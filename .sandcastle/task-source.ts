import type { RunResult } from '@ai-hero/sandcastle'

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
  MAX_SLUG_CHARS,
  MAX_TITLE_CHARS,
  SANDBOX_AUTH_HOOKS,
} from './constants.js'
import { branchPrefixOf, labelOf, type StrategyEntry } from './strategies/index.js'
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
  /** Docker image name for the sandbox. */
  dockerImage: string
  /** Maximum planner retries. */
  maxRetries?: number
  /** Strategies to run, in priority order (first matching label wins). */
  strategies: readonly StrategyEntry[]
}

/** Interface for task discovery sources. */
export interface TaskSource {
  /** Discovers tasks to work on. */
  discover(): Promise<TaskSpec[]>
}

/** A sanitized issue resolved to the strategy that will handle it. */
interface ResolvedIssue {
  body: string
  branchPrefix: string
  labels: string[]
  number: number
  strategyKey: string
  title: string
}

/**
 * Task source that discovers work from GitHub issues via planner agent.
 * Each strategy in the registry is associated with the GitHub label
 * `sandcastle-<key>` and produces tasks on branches `agent/<key>-<n>-<slug>`.
 */
export class GithubIssueSource implements TaskSource {
  private readonly branchPatterns: readonly RegExp[]
  private readonly controlTagPattern: RegExp
  private readonly dockerImage: string
  private readonly maxRetries: number
  private readonly strategies: readonly StrategyEntry[]

  /**
   * @param config - Configuration for the GitHub issue source.
   */
  constructor (config: GithubIssueSourceConfig) {
    if (config.strategies.length === 0) {
      throw new Error('GithubIssueSource requires at least one strategy.')
    }
    this.dockerImage = config.dockerImage
    this.maxRetries = config.maxRetries ?? 5
    this.strategies = config.strategies

    this.branchPatterns = this.strategies.map(
      entry => new RegExp(`^${escapeRegex(branchPrefixOf(entry.key))}-(\\d+)-${SLUG_PATTERN_BODY}$`)
    )
    this.controlTagPattern = buildControlTagPattern(this.strategies)
  }

  /**
   * Discovers tasks by fetching GitHub issues per strategy, running the planner,
   * and validating the plan.
   * @returns Array of task specifications to implement.
   */
  async discover (): Promise<TaskSpec[]> {
    const issues = await this.fetchAndSanitizeIssues()

    if (issues.length === 0) {
      console.log(
        'No issues with labels [%s]. Exiting.',
        this.strategies.map(s => labelOf(s.key)).join(', ')
      )
      return []
    }

    const coveredIssues = await this.fetchIssuesWithOpenPRs()
    const actionableIssues = issues.filter(issue => !coveredIssues.has(issue.number))

    if (actionableIssues.length === 0) {
      console.log(
        'All issues with labels [%s] already have open PRs. Exiting.',
        this.strategies.map(s => labelOf(s.key)).join(', ')
      )
      return []
    }

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      console.log(`\n=== Planner attempt ${String(attempt)}/${String(this.maxRetries)} ===\n`)

      let plan: RunResult
      try {
        plan = await sandcastle.run({
          agent: agentProvider(AGENT_PLANNER_MODEL, AGENT_PLANNER_EFFORT),
          completionSignal: COMPLETION_SIGNAL,
          hooks: SANDBOX_AUTH_HOOKS,
          idleTimeoutSeconds: AGENT_IDLE_TIMEOUT_S,
          maxIterations: 5,
          name: 'Planner',
          promptArgs: {
            ISSUES_JSON: JSON.stringify(
              actionableIssues.map(({ body, labels, number, title }) => ({
                body,
                labels,
                number,
                title,
              })),
              null,
              2
            ),
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
        console.log(`  #${task.id} [${task.strategyKey}]: ${task.title} → ${task.branch}`)
      }

      return tasks
    }

    throw new Error('Planner failed to produce a valid plan after all retries.')
  }

  /**
   * Fetches issues for each registered strategy in parallel, then deduplicates
   * by issue number in registry order (first strategy registered wins). Each
   * issue is annotated with the strategy that will handle it and the
   * corresponding branch prefix.
   * @returns Sanitized issues with their resolved strategy.
   */
  private async fetchAndSanitizeIssues (): Promise<ResolvedIssue[]> {
    const fetched = await Promise.all(
      this.strategies.map(async entry => ({
        entry,
        rawIssues: await this.fetchIssuesByLabel(labelOf(entry.key)),
      }))
    )
    const seen = new Map<number, ResolvedIssue>()
    for (const { entry, rawIssues } of fetched) {
      for (const issue of rawIssues) {
        const previous = seen.get(issue.number)
        if (previous !== undefined) {
          const winnerLabel = labelOf(previous.strategyKey)
          const droppedLabel = labelOf(entry.key)
          console.warn(
            `Issue #${String(issue.number)} carries multiple strategy labels ` +
              `('${winnerLabel}' and '${droppedLabel}'); processing as '${winnerLabel}' ` +
              `(registered first), skipping '${droppedLabel}'. ` +
              'To remove the unwanted label: ' +
              `gh issue edit ${String(issue.number)} --remove-label ${droppedLabel}`
          )
          continue
        }
        seen.set(issue.number, {
          body: this.sanitizeForPrompt(issue.body),
          branchPrefix: branchPrefixOf(entry.key),
          labels: issue.labels.map(l => l.name),
          number: issue.number,
          strategyKey: entry.key,
          title: this.sanitizeForPrompt(issue.title),
        })
      }
    }
    return [...seen.values()]
  }

  private async fetchIssuesByLabel (label: string): Promise<z.infer<typeof RawIssuesSchema>> {
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
          label,
        ],
        { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024, timeout: GIT_TIMEOUT_MS }
      )
      rawIssuesJson = stdout
    } catch (err: unknown) {
      throw new Error(
        `Failed to fetch issues with label '${label}': ${toErrorMessage(err)}. Ensure gh is installed and authenticated.`,
        { cause: err }
      )
    }

    try {
      return RawIssuesSchema.parse(JSON.parse(rawIssuesJson))
    } catch (err: unknown) {
      throw new Error(
        `Failed to parse issues JSON for label '${label}': ${toErrorMessage(err)}. Unexpected format from gh CLI.`,
        { cause: err }
      )
    }
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
      for (const pr of prs) {
        for (const pattern of this.branchPatterns) {
          const match = pattern.exec(pr.headRefName)
          if (match) {
            issueNumbers.add(Number(match[1]))
            break
          }
        }
      }
      return issueNumbers
    } catch (err: unknown) {
      console.warn(`Failed to check open PRs: ${toErrorMessage(err)}. Processing all issues.`)
      return new Set()
    }
  }

  /**
   * Strips agent-control tags from text to reduce prompt-injection risk.
   * The deny-list is derived once from the registry at construction time.
   * @param text - Raw text to sanitize.
   * @returns Text with all control tags removed.
   */
  private sanitizeForPrompt (text: string): string {
    return text.normalize('NFKC').replace(this.controlTagPattern, '')
  }

  private validatePlan (planContent: string, actionableIssues: ResolvedIssue[]): null | TaskSpec[] {
    try {
      const PlanSchema = z.object({ issues: z.array(z.unknown()) })
      const parseResult = PlanSchema.safeParse(JSON.parse(planContent))
      if (!parseResult.success) {
        console.error('Planner output missing valid issues array. Retrying.')
        return null
      }
      const parsed = parseResult.data
      const issueMap = new Map(actionableIssues.map(issue => [String(issue.number), issue]))

      const seenIds = new Set<string>()
      const validated: TaskSpec[] = []
      for (const entry of parsed.issues) {
        const spec = this.validatePlanEntry(entry, issueMap)
        if (spec === null) continue
        if (seenIds.has(spec.id)) {
          console.warn(
            `Planner produced duplicate id '${spec.id}'; keeping first occurrence and dropping the rest.`
          )
          continue
        }
        seenIds.add(spec.id)
        validated.push(spec)
      }

      if (parsed.issues.length > 0 && validated.length === 0) {
        console.error(
          `Planner produced ${String(parsed.issues.length)} entries but none passed validation. Retrying.`
        )
        return null
      }
      return validated
    } catch (err: unknown) {
      console.error(`Planner produced invalid JSON: ${toErrorMessage(err)}. Retrying.`)
      return null
    }
  }

  private validatePlanEntry (entry: unknown, issueMap: Map<string, ResolvedIssue>): null | TaskSpec {
    if (typeof entry !== 'object' || entry === null) return null
    const item = entry as Record<string, unknown>
    if (typeof item.id !== 'string' || !/^\d+$/.test(item.id)) return null
    if (typeof item.slug !== 'string') return null
    if (item.slug.length > MAX_SLUG_CHARS || !SLUG_PATTERN.test(item.slug)) return null
    if (typeof item.title !== 'string') return null
    if (item.title.length > MAX_TITLE_CHARS) return null
    // eslint-disable-next-line no-control-regex -- guard against control characters in titles
    if (/[\x00-\x1f]/.test(item.title)) return null
    const sanitizedTitle = this.sanitizeForPrompt(item.title).trim()
    if (sanitizedTitle.length === 0) return null

    const source = issueMap.get(item.id)
    if (!source) return null

    const spec: TaskSpec = {
      body: source.body,
      branch: `${source.branchPrefix}-${item.id}-${item.slug}`,
      id: item.id,
      labels: source.labels,
      strategyKey: source.strategyKey,
      title: sanitizedTitle,
    }
    if (isValidIssueType(item.issueType)) {
      spec.issueType = item.issueType
    }
    if (isValidConfidence(item.confidence)) {
      spec.confidence = item.confidence
    }
    if (typeof item.rootCauseHypothesis === 'string' && item.rootCauseHypothesis.length > 0) {
      spec.rootCauseHypothesis = this.sanitizeForPrompt(item.rootCauseHypothesis).slice(0, 500)
    }
    if (Array.isArray(item.acceptanceCriteria)) {
      const criteria = item.acceptanceCriteria
        .filter((c): c is string => typeof c === 'string' && c.length > 0)
        .map(c => this.sanitizeForPrompt(c).slice(0, 200))
      if (criteria.length > 0) {
        spec.acceptanceCriteria = criteria.slice(0, 5)
      }
    }
    return spec
  }
}

/**
 * Strict kebab-case slug body shared by plan validation and PR-coverage
 * branch parsing: lowercase letters/digits, hyphen-separated, no leading,
 * trailing or double hyphen, no underscore. Anchored consumers wrap it in
 * `^...$`. Mirrors the strategy-key shape so the assembled branch
 * `<branchPrefix>-<id>-<slug>` is uniformly kebab-cased.
 */
const SLUG_PATTERN_BODY = '[a-z0-9]+(?:-[a-z0-9]+)*'

const SLUG_PATTERN = new RegExp(`^${SLUG_PATTERN_BODY}$`)

const VALID_CONFIDENCE = new Set(['high', 'low', 'medium'])
const VALID_ISSUE_TYPES = new Set(['bug-fix', 'feature', 'refactor'])

/**
 * @param value - Value to escape for safe interpolation in a regex.
 * @returns The value with regex metacharacters escaped.
 */
function escapeRegex (value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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
 * Universal agent-control tags shared by every strategy: orchestrator-level
 * vocabulary (planner output, completion signal) and common prompt-injection
 * vectors. Strategy-specific tags come from `StrategyEntry.key` and
 * `StrategyEntry.controlTags`.
 */
const UNIVERSAL_CONTROL_TAGS: readonly string[] = [
  'code',
  'findings',
  'instructions',
  'plan',
  'promise',
  'system',
  'tool_call',
] as const

/**
 * Builds the regex that strips agent-control tags. The deny-list is the union
 * of {@link UNIVERSAL_CONTROL_TAGS} and, for every registered strategy, its
 * `key` plus optional `controlTags`. Adding a strategy automatically extends
 * the deny-list — no edit to the task source is required.
 * @param strategies - Registered strategies whose vocabulary participates.
 * @returns Compiled regex matching opening or closing tags of any control name.
 */
function buildControlTagPattern (strategies: readonly StrategyEntry[]): RegExp {
  const tags = new Set<string>(UNIVERSAL_CONTROL_TAGS)
  for (const entry of strategies) {
    tags.add(entry.key)
    for (const tag of entry.controlTags ?? []) tags.add(tag)
  }
  const alternation = [...tags].map(escapeRegex).join('|')
  // Lookahead asserts the tag name ends at an XML-tag-name boundary
  // (whitespace, `/` for self-closing, or `>`), preventing prefix collisions
  // such as `<plant>` matching alternative `plan`.
  return new RegExp(`</?(?:${alternation})(?=[\\s/>])[^>]*>`, 'gi')
}
