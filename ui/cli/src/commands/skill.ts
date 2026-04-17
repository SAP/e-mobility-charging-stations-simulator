import { Command } from 'commander'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'

declare const __EMBEDDED_SKILL__: string

const SKILL_DIR_NAME = 'evse-simulator'
const SKILL_FILE_NAME = 'SKILL.md'

const getInstallDir = (global: boolean): string =>
  global
    ? resolve(homedir(), '.agents', 'skills', SKILL_DIR_NAME)
    : resolve(process.cwd(), '.agents', 'skills', SKILL_DIR_NAME)

export const createSkillCommands = (): Command => {
  const cmd = new Command('skill').description('Show or install the embedded agent skill')

  cmd
    .command('show')
    .description('Print the embedded SKILL.md to stdout')
    .action(() => {
      process.stdout.write(__EMBEDDED_SKILL__)
    })

  cmd
    .command('install')
    .description('Install the skill into .agents/skills/evse-simulator/')
    .option('--global', 'Install to ~/.agents/skills/ instead of project-local')
    .option('-f, --force', 'Overwrite existing installation')
    .action((options: { force?: boolean; global?: boolean }) => {
      const dir = getInstallDir(options.global === true)
      const filepath = resolve(dir, SKILL_FILE_NAME)

      if (existsSync(filepath) && options.force !== true) {
        process.stderr.write(`Skill already installed at ${filepath}\nUse --force to overwrite.\n`)
        process.exitCode = 1
        return
      }

      try {
        mkdirSync(dir, { recursive: true })
        writeFileSync(filepath, __EMBEDDED_SKILL__, 'utf8')
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        process.stderr.write(`Failed to install skill: ${msg}\n`)
        process.exitCode = 1
        return
      }
      process.stdout.write(`Installed skill to ${filepath}\n`)
    })

  return cmd
}
