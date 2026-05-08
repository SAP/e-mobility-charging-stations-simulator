import * as sandcastle from '@ai-hero/sandcastle'
import { docker } from '@ai-hero/sandcastle/sandboxes/docker'
import { z } from 'zod'

import type { TaskSpec } from './types.js'

import {
  AGENT_IDLE_TIMEOUT_S,
  AGENT_PLANNER_EFFORT,
  AGENT_PLANNER_MODEL,
  AGENT_TASK_TIMEOUT_MS,
  COMPLETION_SIGNAL,
  DOCKER_MOUNTS,
  GIT_TIMEOUT_MS,
  GITHUB_MAX_ISSUES_FETCH,
  GITHUB_MAX_PRS_FETCH,
  MAX_TITLE_CHARS,
  SANDBOX_AUTH_HOOKS,
} from './constants.js'
import { agentProvider, execFileAsync, toErrorMessage } from './utils.js'

const RawIssueSchema = z.object({
  body: z
    .string()
    .nullable()
    .transform(b => b ?? ''),
  labels: z.array(z.object({ name: z.string() })),
  number: z.number(),
  title: z.string(),
})
const RawIssuesSchema = z.array(RawIssueSchema)

/** Configuration for the GitHub issue task source. */
export interface GithubIssueSourceConfig {
  /** Git branch prefix for issue branches. */
  branchPrefix: string
  /** Docker image name for the sandbox. */
  dockerImage: string
  /** GitHub issue label to filter by. */
  label: string
  /** Maximum planner retries. */
  maxRetries?: number
}

/** Interface for task discovery sources. */
export interface TaskSource {
  /** Discovers tasks to work on. */
  discover(): Promise<TaskSpec[]>
}

/**
 * Task source that discovers work from GitHub issues via planner agent.
 */
export class GithubIssueSource implements TaskSource {
  private readonly branchPattern: RegExp
  private readonly branchPrefix: string
  private readonly dockerImage: string
  private readonly escapedPrefix: string
  private readonly label: string
  private readonly maxRetries: number

  /**
   * @param config - Configuration for the GitHub issue source.
   */
  constructor (config: GithubIssueSourceConfig) {
    this.branchPrefix = config.branchPrefix
    this.dockerImage = config.dockerImage
    this.label = config.label
    this.maxRetries = config.maxRetries ?? 5

    this.escapedPrefix = this.branchPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    this.branchPattern = new RegExp(`^${this.escapedPrefix}-\\d+-[\\w-]+$`)
  }

  /**
   * Discovers tasks by fetching GitHub issues, running the planner, and validating the plan.
   * @returns Array of task specifications to implement.
   */
  async discover (): Promise<TaskSpec[]> {
    const issuesJson = await this.fetchAndSanitizeIssues()

    if (issuesJson.length === 0) {
      console.log("No issues with label '%s'. Exiting.", this.label)
      return []
    }

    const coveredIssues = await this.fetchIssuesWithOpenPRs()
    const actionableIssues = issuesJson.filter(issue => !coveredIssues.has(issue.number))

    if (actionableIssues.length === 0) {
      console.log('All sandcastle issues already have open PRs. Exiting.')
      return []
    }

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      console.log(`\n=== Planner attempt ${String(attempt)}/${String(this.maxRetries)} ===\n`)

      let plan: Awaited<ReturnType<typeof sandcastle.run>>
      try {
        plan = await sandcastle.run({
          agent: agentProvider(AGENT_PLANNER_MODEL, AGENT_PLANNER_EFFORT),
          completionSignal: COMPLETION_SIGNAL,
          hooks: SANDBOX_AUTH_HOOKS,
          idleTimeoutSeconds: AGENT_IDLE_TIMEOUT_S,
          maxIterations: 5,
          name: 'Planner',
          promptArgs: {
            BRANCH_PREFIX: this.branchPrefix,
            ISSUES_JSON: JSON.stringify(actionableIssues, null, 2),
          },
          promptFile: './.sandcastle/plan-prompt.md',
          sandbox: docker({ imageName: this.dockerImage, mounts: [...DOCKER_MOUNTS] }),
          signal: AbortSignal.timeout(AGENT_TASK_TIMEOUT_MS),
        })
      } catch (err: unknown) {
        console.error(`Planner timed out or failed: ${toErrorMessage(err)}`)
        continue
      }

      const planMatches = [...plan.stdout.matchAll(/<plan>([\s\S]*?)<\/plan>/g)]
      const planMatch = planMatches.at(-1)
      if (!planMatch) {
        console.error('Planner did not produce a <plan> tag. Retrying.')
        continue
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- regex group always captures but TS types array access as possibly undefined
      const planContent = planMatch[1] ?? ''
      const tasks = this.validatePlan(planContent, actionableIssues)
      if (tasks === null) {
        continue
      }

      if (tasks.length === 0) {
        console.log('No actionable issues. Exiting.')
        return []
      }

      console.log(`Plan: ${String(tasks.length)} issue(s) to work on:`)
      for (const task of tasks) {
        console.log(`  #${task.id}: ${task.title} → ${task.branch}`)
      }

      return tasks
    }

    throw new Error('Planner failed to produce a valid plan after all retries.')
  }

  private async fetchAndSanitizeIssues (): Promise<
    {
      body: string
      labels: string[]
      number: number
      title: string
    }[]
  > {
    let rawIssuesJson: string
    try {
      const { stdout } = await execFileAsync(
        'gh',
        [
          'issue',
          'list',
          '--state',
          'open',
          '--json',
          'number,title,labels,body',
          '--limit',
          String(GITHUB_MAX_ISSUES_FETCH),
          '--label',
          this.label,
        ],
        { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024, timeout: GIT_TIMEOUT_MS }
      )
      rawIssuesJson = stdout
    } catch (err: unknown) {
      throw new Error(
        `Failed to fetch issues: ${toErrorMessage(err)}. Ensure gh is installed and authenticated.`,
        { cause: err }
      )
    }

    let rawIssues: z.infer<typeof RawIssuesSchema>
    try {
      rawIssues = RawIssuesSchema.parse(JSON.parse(rawIssuesJson))
    } catch (err: unknown) {
      throw new Error(
        `Failed to parse issues JSON: ${toErrorMessage(err)}. Unexpected format from gh CLI.`,
        { cause: err }
      )
    }

    return rawIssues.map(issue => ({
      body: sanitizeForPrompt(issue.body),
      labels: issue.labels.map(label => label.name),
      number: issue.number,
      title: sanitizeForPrompt(issue.title),
    }))
  }

  private async fetchIssuesWithOpenPRs (): Promise<Set<number>> {
    try {
      const { stdout } = await execFileAsync(
        'gh',
        [
          'pr',
          'list',
          '--state',
          'open',
          '--json',
          'headRefName',
          '--limit',
          String(GITHUB_MAX_PRS_FETCH),
        ],
        { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024, timeout: GIT_TIMEOUT_MS }
      )
      const prs = z.array(z.object({ headRefName: z.string() })).parse(JSON.parse(stdout))
      const issueNumbers = new Set<number>()
      const pattern = new RegExp(`^${this.escapedPrefix}-(\\d+)-`)
      for (const pr of prs) {
        const match = pattern.exec(pr.headRefName)
        if (match) {
          issueNumbers.add(Number(match[1]))
        }
      }
      return issueNumbers
    } catch (err: unknown) {
      console.warn(`Failed to check open PRs: ${toErrorMessage(err)}. Processing all issues.`)
      return new Set()
    }
  }

  private validatePlan (
    planContent: string,
    issuesJson: { body: string; labels: string[]; number: number; title: string }[]
  ): null | TaskSpec[] {
    try {
      const PlanSchema = z.object({ issues: z.array(z.unknown()) })
      const parseResult = PlanSchema.safeParse(JSON.parse(planContent))
      if (!parseResult.success) {
        console.error('Planner output missing valid issues array. Retrying.')
        return null
      }
      const parsed = parseResult.data
      const validated = parsed.issues.filter((entry): entry is Record<string, unknown> => {
        if (typeof entry !== 'object' || entry === null) return false
        const item = entry as Record<string, unknown>
        if (typeof item.id !== 'string' || !/^\d+$/.test(item.id)) return false
        if (typeof item.branch !== 'string' || !this.branchPattern.test(item.branch)) return false
        if (typeof item.title !== 'string') return false
        if (item.title.length > MAX_TITLE_CHARS) return false
        // eslint-disable-next-line no-control-regex
        if (/[\x00-\x1f]/.test(item.title)) return false
        return true
      })

      const issueMap = new Map(issuesJson.map(issue => [String(issue.number), issue]))
      return validated
        .map(entry => {
          const source = issueMap.get(entry.id as string)
          if (!source) return null
          const spec: TaskSpec = {
            body: source.body,
            branch: entry.branch as string,
            id: entry.id as string,
            labels: source.labels,
            title: entry.title as string,
          }
          if (isValidIssueType(entry.issueType)) {
            spec.issueType = entry.issueType
          }
          if (isValidConfidence(entry.confidence)) {
            spec.confidence = entry.confidence
          }
          if (
            typeof entry.rootCauseHypothesis === 'string' &&
            entry.rootCauseHypothesis.length > 0
          ) {
            spec.rootCauseHypothesis = sanitizeForPrompt(entry.rootCauseHypothesis).slice(0, 500)
          }
          if (Array.isArray(entry.acceptanceCriteria)) {
            const criteria = entry.acceptanceCriteria
              .filter((c): c is string => typeof c === 'string' && c.length > 0)
              .map(c => sanitizeForPrompt(c).slice(0, 200))
            if (criteria.length > 0) {
              spec.acceptanceCriteria = criteria.slice(0, 5)
            }
          }
          return spec
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    } catch (err: unknown) {
      console.error(`Planner produced invalid JSON: ${toErrorMessage(err)}. Retrying.`)
      return null
    }
  }
}

const VALID_CONFIDENCE = new Set(['high', 'low', 'medium'])
const VALID_ISSUE_TYPES = new Set(['bug-fix', 'feature', 'refactor'])

/**
 * @param value - Value to check.
 * @returns Whether value is a valid confidence level.
 */
function isValidConfidence (value: unknown): value is 'high' | 'low' | 'medium' {
  return typeof value === 'string' && VALID_CONFIDENCE.has(value)
}

/**
 * @param value - Value to check.
 * @returns Whether value is a valid issue type.
 */
function isValidIssueType (value: unknown): value is 'bug-fix' | 'feature' | 'refactor' {
  return typeof value === 'string' && VALID_ISSUE_TYPES.has(value)
}

/**
 * Strips agent-control tags from text to reduce prompt-injection risk.
 * @param text - Raw text to sanitize.
 * @returns Text with plan/findings/promise tags removed.
 */
function sanitizeForPrompt (text: string): string {
  const normalized = text.normalize('NFKC')
  return normalized.replace(
    /<\/?(?:plan|findings|promise|system|code|instructions|implement|review|tool_call)[^>]*>/gi,
    ''
  )
}
