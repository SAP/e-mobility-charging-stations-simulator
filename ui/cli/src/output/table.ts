import chalk from 'chalk'
import process from 'node:process'
import { type ResponsePayload, ResponseStatus } from 'ui-common'

import { borderlessTable, truncateId } from './format.js'
import { tryRenderPayload } from './renderers.js'

export const outputTable = (payload: ResponsePayload): void => {
  if (tryRenderPayload(payload)) return

  if (payload.hashIdsSucceeded != null && payload.hashIdsSucceeded.length > 0) {
    process.stdout.write(
      chalk.green(`✓ Succeeded (${payload.hashIdsSucceeded.length.toString()}):\n`)
    )
    const table = borderlessTable(['Hash ID'])
    for (const id of payload.hashIdsSucceeded) {
      table.push([truncateId(id)])
    }
    process.stdout.write(table.toString() + '\n')
  }

  if (payload.hashIdsFailed != null && payload.hashIdsFailed.length > 0) {
    process.stderr.write(chalk.red(`✗ Failed (${payload.hashIdsFailed.length.toString()}):\n`))
    if (payload.responsesFailed != null && payload.responsesFailed.length > 0) {
      const table = borderlessTable(['Hash ID', 'Error'])
      for (const entry of payload.responsesFailed) {
        table.push([truncateId(entry.hashId ?? '(unknown)'), entry.errorMessage ?? 'Unknown error'])
      }
      process.stderr.write(table.toString() + '\n')
    } else {
      const table = borderlessTable(['Hash ID'])
      for (const id of payload.hashIdsFailed) {
        table.push([truncateId(id)])
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
  const meaningful = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v != null && !(Array.isArray(v) && v.length === 0))
  )
  if (Object.keys(meaningful).length > 0) {
    process.stdout.write(JSON.stringify(meaningful, null, 2) + '\n')
  } else if (status === ResponseStatus.SUCCESS) {
    process.stdout.write(chalk.green('✓ Success\n'))
  } else {
    const label =
      typeof status === 'string' && status.length > 0
        ? status.charAt(0).toUpperCase() + status.slice(1)
        : 'Failure'
    process.stderr.write(chalk.red(`✗ ${label}\n`))
  }
}
