import type { ResponsePayload } from 'ui-common'

import chalk from 'chalk'
import Table from 'cli-table3'
import process from 'node:process'

// outputTable is only called with SUCCESS payloads — FAILURE payloads
// are rejected as ServerFailureError and routed to formatter.error() instead.
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
    const table = new Table({ head: [chalk.white('Hash ID')] })
    for (const id of payload.hashIdsFailed) {
      table.push([id])
    }
    process.stderr.write(table.toString() + '\n')
  }

  if (
    (payload.hashIdsSucceeded == null || payload.hashIdsSucceeded.length === 0) &&
    (payload.hashIdsFailed == null || payload.hashIdsFailed.length === 0)
  ) {
    displayGenericPayload(payload)
  }
}

const displayGenericPayload = (payload: ResponsePayload): void => {
  const { status: _, ...rest } = payload
  if (Object.keys(rest).length > 0) {
    process.stdout.write(JSON.stringify(rest, null, 2) + '\n')
  } else {
    process.stdout.write(chalk.green('✓ Success\n'))
  }
}

export const outputTableList = <T extends Record<string, unknown>>(
  items: T[],
  columns: { header: string; key: keyof T }[]
): void => {
  if (items.length === 0) {
    process.stdout.write(chalk.dim('(no items)\n'))
    return
  }
  const table = new Table({ head: columns.map(c => chalk.white(c.header)) })
  for (const item of items) {
    table.push(columns.map(c => String(item[c.key] ?? '')))
  }
  process.stdout.write(table.toString() + '\n')
}
