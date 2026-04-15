import chalk from 'chalk'
import Table from 'cli-table3'
import process from 'node:process'
import { type ResponsePayload, ResponseStatus } from 'ui-common'

export const outputTable = (payload: ResponsePayload): void => {
  if (payload.hashIdsSucceeded != null && payload.hashIdsSucceeded.length > 0) {
    process.stdout.write(
      chalk.green(`✓ Succeeded (${payload.hashIdsSucceeded.length.toString()}):\n`)
    )
    const table = new Table({ head: [chalk.white('Hash ID')] })
    for (const id of payload.hashIdsSucceeded) {
      table.push([id])
    }
    process.stdout.write(table.toString() + '\n')
  }

  if (payload.hashIdsFailed != null && payload.hashIdsFailed.length > 0) {
    process.stderr.write(chalk.red(`✗ Failed (${payload.hashIdsFailed.length.toString()}):\n`))
    if (payload.responsesFailed != null && payload.responsesFailed.length > 0) {
      const table = new Table({ head: [chalk.white('Hash ID'), chalk.white('Error')] })
      for (const entry of payload.responsesFailed) {
        table.push([entry.hashId ?? '(unknown)', entry.errorMessage ?? 'Unknown error'])
      }
      process.stderr.write(table.toString() + '\n')
    } else {
      const table = new Table({ head: [chalk.white('Hash ID')] })
      for (const id of payload.hashIdsFailed) {
        table.push([id])
      }
      process.stderr.write(table.toString() + '\n')
    }
  }

  if (
    (payload.hashIdsSucceeded == null || payload.hashIdsSucceeded.length === 0) &&
    (payload.hashIdsFailed == null || payload.hashIdsFailed.length === 0)
  ) {
    displayGenericPayload(payload)
  }
}

const displayGenericPayload = (payload: ResponsePayload): void => {
  const { status, ...rest } = payload
  if (Object.keys(rest).length > 0) {
    process.stdout.write(JSON.stringify(rest, null, 2) + '\n')
  } else if (status === ResponseStatus.SUCCESS) {
    process.stdout.write(chalk.green('✓ Success\n'))
  } else {
    process.stderr.write(chalk.red(`✗ ${status}\n`))
  }
}
