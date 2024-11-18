import chalk from 'chalk'
import { readFileSync } from 'node:fs'
import { exit, version } from 'node:process'
// eslint-disable-next-line n/no-unpublished-import
import { satisfies } from 'semver'

import { JSRuntime, runtime } from './runtime.js'

const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'))

/**
 * Check if the current node version match the required engines version.
 */
export const checkNodeVersion = () => {
  const enginesNodeVersion = packageJson.engines.node
  if (satisfies(version, enginesNodeVersion) === false) {
    console.error(
      chalk.red(
        `Required node version ${enginesNodeVersion} not satisfied with current version ${version}`
      )
    )
    exit(1)
  }
}

switch (runtime) {
  case JSRuntime.node:
    checkNodeVersion()
    break
  case JSRuntime.bun:
  case JSRuntime.deno:
  case JSRuntime.workerd:
  case JSRuntime.browser:
  default:
    console.warn(chalk.yellow(`Unsupported '${runtime}' runtime detected`))
    break
}
