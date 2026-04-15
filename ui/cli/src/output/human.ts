import chalk from 'chalk'
import process from 'node:process'

export const printError = (message: string): void => {
  process.stderr.write(chalk.red(`✗ ${message}\n`))
}
