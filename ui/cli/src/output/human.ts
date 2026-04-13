import chalk from 'chalk'
import process from 'node:process'

export const printSuccess = (message: string): void => {
  process.stdout.write(chalk.green(`✓ ${message}\n`))
}

export const printError = (message: string): void => {
  process.stderr.write(chalk.red(`✗ ${message}\n`))
}

export const printWarning = (message: string): void => {
  process.stderr.write(chalk.yellow(`⚠ ${message}\n`))
}

export const printInfo = (message: string): void => {
  process.stderr.write(chalk.dim(`  ${message}\n`))
}
