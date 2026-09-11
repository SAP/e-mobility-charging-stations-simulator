import type { ConnectorStatus } from '../../types/index.js'

export interface TransactionIntervalState {
  consumed: number
  readonly transactionId?: string
}

const transactionIntervalConsumptions = new WeakMap<object, Record<string, number>>()

export const recordTransactionIntervalConsumption = (
  meterValue: object,
  baselineKey: string,
  energyWh: number
): void => {
  if (!Number.isFinite(energyWh) || energyWh <= 0) return
  transactionIntervalConsumptions.set(meterValue, { [baselineKey]: energyWh })
}

export const getTransactionIntervalConsumptions = (
  meterValues: readonly object[] | undefined
): Record<string, number> | undefined => {
  if (meterValues == null) return undefined
  const consumptions: Record<string, number> = {}
  for (const meterValue of meterValues) {
    const meterValueConsumptions = transactionIntervalConsumptions.get(meterValue)
    if (meterValueConsumptions == null) continue
    for (const [key, value] of Object.entries(meterValueConsumptions)) {
      consumptions[key] = (consumptions[key] ?? 0) + value
    }
  }
  return Object.keys(consumptions).length > 0 ? consumptions : undefined
}

export const captureTransactionIntervalState = (
  connectorStatus: ConnectorStatus
): TransactionIntervalState => ({
  consumed: 0,
  transactionId: connectorStatus.transactionId?.toString(),
})

export const completeTransactionIntervalState = (
  state: TransactionIntervalState,
  baselineKey: string,
  meterValues: readonly object[]
): void => {
  state.consumed = getTransactionIntervalConsumptions(meterValues)?.[baselineKey] ?? 0
}

export const restoreTransactionIntervalState = (
  state: TransactionIntervalState,
  connectorStatus: ConnectorStatus,
  baselineKey: string
): void => {
  if (state.consumed <= 0 || connectorStatus.transactionId?.toString() !== state.transactionId) {
    return
  }
  connectorStatus.transactionEnergyActiveImportIntervalCarry ??= {}
  connectorStatus.transactionEnergyActiveImportIntervalCarry[baselineKey] =
    (connectorStatus.transactionEnergyActiveImportIntervalCarry[baselineKey] ?? 0) + state.consumed
}

interface IntervalMeterValue {
  sampledValue: readonly IntervalSampledValue[]
}

interface IntervalSampledValue {
  location?: string
  measurand?: string
  phase?: string
  unit?: string
  unitOfMeasure?: { multiplier?: number; unit?: string }
  value: number | string
}

export const truncateTransactionIntervalValue = (value: number): number =>
  Math.floor(Math.max(0, value) * 100) / 100

export const getRepresentedTransactionIntervalEnergyWh = (
  meterValue: IntervalMeterValue,
  numberOfPhases: number,
  inletToOutputEfficiency = 1
): number => {
  let representedEnergyWh = 0
  for (const sampledValue of meterValue.sampledValue) {
    if (sampledValue.measurand !== 'Energy.Active.Import.Interval') continue
    const value =
      typeof sampledValue.value === 'number'
        ? sampledValue.value
        : Number.parseFloat(sampledValue.value)
    if (!Number.isFinite(value)) continue
    const unit = sampledValue.unitOfMeasure?.unit ?? sampledValue.unit
    const unitMultiplier = unit === 'kWh' ? 1000 : unit === 'MWh' ? 1_000_000 : 1
    const decimalMultiplier = 10 ** (sampledValue.unitOfMeasure?.multiplier ?? 0)
    const phaseMultiplier = /^L[123](?:-N)?$/.test(sampledValue.phase ?? '') ? numberOfPhases : 1
    const locationMultiplier =
      sampledValue.location === 'Inlet' && inletToOutputEfficiency > 0 ? inletToOutputEfficiency : 1
    representedEnergyWh = Math.max(
      representedEnergyWh,
      value * unitMultiplier * decimalMultiplier * phaseMultiplier * locationMultiplier
    )
  }
  return representedEnergyWh
}
