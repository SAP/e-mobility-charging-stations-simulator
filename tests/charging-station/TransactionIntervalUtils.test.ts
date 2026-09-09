import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { ConnectorStatus } from '../../src/types/ConnectorStatus.js'

import {
  captureTransactionIntervalState,
  completeTransactionIntervalState,
  getRepresentedTransactionIntervalEnergyWh,
  recordTransactionIntervalConsumption,
  restoreTransactionIntervalState,
  truncateTransactionIntervalValue,
} from '../../src/charging-station/meter-values/TransactionIntervalUtils.js'

await describe('TransactionIntervalUtils', async () => {
  await it('preserves every failed concurrent interval consumption', () => {
    const baselineKey = 'TxCtrlr.Measurands'
    const connectorStatus = { transactionId: 'transaction-1' } as ConnectorStatus
    const firstMeterValue = {}
    const secondMeterValue = {}
    const firstState = captureTransactionIntervalState(connectorStatus)
    recordTransactionIntervalConsumption(firstMeterValue, baselineKey, 10)
    completeTransactionIntervalState(firstState, baselineKey, [firstMeterValue])
    const secondState = captureTransactionIntervalState(connectorStatus)
    recordTransactionIntervalConsumption(secondMeterValue, baselineKey, 5)
    completeTransactionIntervalState(secondState, baselineKey, [secondMeterValue])

    restoreTransactionIntervalState(firstState, connectorStatus, baselineKey)
    restoreTransactionIntervalState(secondState, connectorStatus, baselineKey)

    assert.strictEqual(
      connectorStatus.transactionEnergyActiveImportIntervalCarry?.[baselineKey],
      15
    )
  })

  await it('accounts for only the interval energy represented on the wire', () => {
    assert.strictEqual(truncateTransactionIntervalValue(0.009), 0)
    assert.strictEqual(truncateTransactionIntervalValue(0.019), 0.01)
    assert.strictEqual(
      getRepresentedTransactionIntervalEnergyWh(
        {
          sampledValue: [
            {
              measurand: 'Energy.Active.Import.Interval',
              unit: 'kWh',
              value: '0.01',
            },
          ],
        },
        1
      ),
      10
    )
    assert.strictEqual(
      getRepresentedTransactionIntervalEnergyWh(
        {
          sampledValue: [
            {
              measurand: 'Energy.Active.Import.Interval',
              phase: 'L1',
              unitOfMeasure: { unit: 'kWh' },
              value: 0.003,
            },
          ],
        },
        3
      ),
      9
    )
    assert.strictEqual(
      getRepresentedTransactionIntervalEnergyWh(
        {
          sampledValue: [
            {
              location: 'Inlet',
              measurand: 'Energy.Active.Import.Interval',
              unit: 'Wh',
              value: 100,
            },
          ],
        },
        1,
        0.9
      ),
      90
    )
    assert.strictEqual(
      getRepresentedTransactionIntervalEnergyWh(
        {
          sampledValue: [
            {
              location: 'Inlet',
              measurand: 'Energy.Active.Import.Interval',
              phase: 'L1',
              unit: 'Wh',
              value: 100 / 3,
            },
          ],
        },
        3,
        0.9
      ),
      90
    )
  })

  await it('does not carry a failed interval into a replacement transaction', () => {
    const baselineKey = 'TxCtrlr.Measurands'
    const connectorStatus = { transactionId: 'transaction-1' } as ConnectorStatus
    const meterValue = {}
    const state = captureTransactionIntervalState(connectorStatus)
    recordTransactionIntervalConsumption(meterValue, baselineKey, 10)
    completeTransactionIntervalState(state, baselineKey, [meterValue])
    connectorStatus.transactionId = 'transaction-2'

    restoreTransactionIntervalState(state, connectorStatus, baselineKey)

    assert.strictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, undefined)
  })
})
