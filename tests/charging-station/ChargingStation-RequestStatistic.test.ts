/**
 * @file Tests for ChargingStation.recordRequestStatistic
 * @description Verifies the single-sourced `enableStatistics` gate applied before
 * delegating to performanceStatistics.addRequestStatistic.
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/index.js'

import { ChargingStation as ChargingStationClass } from '../../src/charging-station/ChargingStation.js'
import { MessageType, RequestCommand } from '../../src/types/index.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

interface RecordRequestStatisticContext {
  performanceStatistics?: { addRequestStatistic: (...args: unknown[]) => void }
  stationInfo?: { enableStatistics?: boolean }
}

const callRecordRequestStatistic = (
  context: RecordRequestStatisticContext,
  command: RequestCommand,
  messageType: MessageType
): void => {
  ChargingStationClass.prototype.recordRequestStatistic.call(
    context as unknown as ChargingStation,
    command,
    messageType
  )
}

await describe('ChargingStation.recordRequestStatistic', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await it('should record the statistic when enableStatistics is true', () => {
    const addRequestStatistic = mock.fn()
    callRecordRequestStatistic(
      { performanceStatistics: { addRequestStatistic }, stationInfo: { enableStatistics: true } },
      RequestCommand.HEARTBEAT,
      MessageType.CALL_MESSAGE
    )
    assert.strictEqual(addRequestStatistic.mock.callCount(), 1)
    assert.deepStrictEqual(addRequestStatistic.mock.calls[0].arguments, [
      RequestCommand.HEARTBEAT,
      MessageType.CALL_MESSAGE,
    ])
  })

  await it('should not record the statistic when enableStatistics is not true', () => {
    const addRequestStatistic = mock.fn()
    callRecordRequestStatistic(
      { performanceStatistics: { addRequestStatistic }, stationInfo: { enableStatistics: false } },
      RequestCommand.HEARTBEAT,
      MessageType.CALL_RESULT_MESSAGE
    )
    callRecordRequestStatistic(
      { performanceStatistics: { addRequestStatistic }, stationInfo: {} },
      RequestCommand.HEARTBEAT,
      MessageType.CALL_RESULT_MESSAGE
    )
    assert.strictEqual(addRequestStatistic.mock.callCount(), 0)
  })

  await it('should not throw when performanceStatistics is undefined and enableStatistics is true', () => {
    assert.doesNotThrow(() => {
      callRecordRequestStatistic(
        { stationInfo: { enableStatistics: true } },
        RequestCommand.HEARTBEAT,
        MessageType.CALL_ERROR_MESSAGE
      )
    })
  })
})
