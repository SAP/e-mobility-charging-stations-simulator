import chalk from 'chalk'
import { satisfies } from 'semver'
import { version, exit } from 'node:process'
import { readFileSync } from 'node:fs'

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
    // eslint-disable-next-line n/no-process-exit
    exit(1)
  }
}

checkNodeVersion()
