import type { ChargingStation } from '../../../charging-station/index.js'

import { OCPPError } from '../../../exception/index.js'
import {
  type ConfigurationKeyType,
  ErrorType,
  type MeterValueContext,
  type MeterValuePhase,
  MeterValueUnit,
  type OCPP20MeterValue,
  type OCPP20SampledValue,
  OCPPVersion,
  RequestCommand,
  type SampledValueTemplate,
} from '../../../types/index.js'
import { roundTo } from '../../../utils/index.js'
import {
  addLineToLineVoltageToMeterValue,
  addMainVoltageToMeterValue,
  addPhaseVoltageToMeterValue,
  buildCurrentMeasurandValue,
  buildEmptyMeterValue,
  buildEnergyMeasurandValue,
  buildPowerMeasurandValue,
  buildSampledValue,
  buildSocMeasurandValue,
  buildVoltageMeasurandValue,
  updateConnectorEnergyValues,
  validateEnergyMeasurandValue,
  validateSocMeasurandValue,
} from '../OCPPServiceUtils.js'

export const buildMeterValueForOCPP20 = (
  chargingStation: ChargingStation,
  transactionId: number | string,
  interval: number,
  measurandsKey?: ConfigurationKeyType,
  context?: MeterValueContext,
  debug = false
): OCPP20MeterValue => {
  const connectorId = chargingStation.getConnectorIdByTransactionId(transactionId)
  const evseId = chargingStation.getEvseIdByTransactionId(transactionId)
  if (connectorId == null || evseId == null) {
    throw new OCPPError(
      ErrorType.INTERNAL_ERROR,
      `Cannot build MeterValues: no connector/EVSE found for transaction ${String(transactionId)}`,
      RequestCommand.METER_VALUES
    )
  }
  const connectorStatus = chargingStation.getConnectorStatus(connectorId)
  const meterValue = buildEmptyMeterValue() as OCPP20MeterValue
  const buildVersionedSampledValue = (
    sampledValueTemplate: SampledValueTemplate,
    value: number,
    context?: MeterValueContext,
    phase?: MeterValuePhase
  ): OCPP20SampledValue => {
    return buildSampledValueForOCPP20(sampledValueTemplate, value, context, phase)
  }
  // SoC measurand
  const socMeasurand = buildSocMeasurandValue(chargingStation, connectorId, evseId, measurandsKey)
  if (socMeasurand != null) {
    const socSampledValue = buildVersionedSampledValue(
      socMeasurand.template,
      socMeasurand.value,
      context
    )
    meterValue.sampledValue.push(socSampledValue)
    validateSocMeasurandValue(
      chargingStation,
      connectorId,
      socSampledValue,
      socMeasurand.template.minimumValue ?? 0,
      100,
      debug
    )
  }
  // Voltage measurand
  const voltageMeasurand = buildVoltageMeasurandValue(
    chargingStation,
    connectorId,
    evseId,
    measurandsKey
  )
  if (voltageMeasurand != null) {
    addMainVoltageToMeterValue(
      chargingStation,
      meterValue,
      voltageMeasurand,
      buildVersionedSampledValue,
      context
    )
    for (
      let phase = 1;
      chargingStation.getNumberOfPhases() === 3 && phase <= chargingStation.getNumberOfPhases();
      phase++
    ) {
      addPhaseVoltageToMeterValue(
        chargingStation,
        connectorId,
        meterValue,
        voltageMeasurand,
        phase,
        buildVersionedSampledValue,
        measurandsKey,
        context
      )
      addLineToLineVoltageToMeterValue(
        chargingStation,
        connectorId,
        meterValue,
        voltageMeasurand,
        phase,
        buildVersionedSampledValue,
        measurandsKey,
        context
      )
    }
  }
  // Energy.Active.Import.Register measurand
  const energyMeasurand = buildEnergyMeasurandValue(
    chargingStation,
    connectorId,
    interval,
    evseId,
    measurandsKey
  )
  if (energyMeasurand != null) {
    updateConnectorEnergyValues(connectorStatus, energyMeasurand.value)
    const unitDivider = energyMeasurand.template.unit === MeterValueUnit.KILO_WATT_HOUR ? 1000 : 1
    const energySampledValue = buildVersionedSampledValue(
      energyMeasurand.template,
      roundTo(
        chargingStation.getEnergyActiveImportRegisterByTransactionId(transactionId) / unitDivider,
        2
      ),
      context
    )
    meterValue.sampledValue.push(energySampledValue)
    const connectorMaximumAvailablePower =
      chargingStation.getConnectorMaximumAvailablePower(connectorId)
    const connectorMaximumEnergyRounded = roundTo(
      (connectorMaximumAvailablePower * interval) / (3600 * 1000),
      2
    )
    const connectorMinimumEnergyRounded = roundTo(energyMeasurand.template.minimumValue ?? 0, 2)
    validateEnergyMeasurandValue(
      chargingStation,
      connectorId,
      energySampledValue,
      energyMeasurand.value,
      connectorMinimumEnergyRounded,
      connectorMaximumEnergyRounded,
      interval,
      debug
    )
  }
  // Power.Active.Import measurand
  const powerMeasurand = buildPowerMeasurandValue(
    chargingStation,
    connectorId,
    evseId,
    measurandsKey
  )
  if (powerMeasurand?.values.allPhases != null) {
    const powerSampledValue = buildVersionedSampledValue(
      powerMeasurand.template,
      powerMeasurand.values.allPhases,
      context
    )
    meterValue.sampledValue.push(powerSampledValue)
  }
  // Current.Import measurand
  const currentMeasurand = buildCurrentMeasurandValue(
    chargingStation,
    connectorId,
    evseId,
    measurandsKey
  )
  if (currentMeasurand?.values.allPhases != null) {
    const currentSampledValue = buildVersionedSampledValue(
      currentMeasurand.template,
      currentMeasurand.values.allPhases,
      context
    )
    meterValue.sampledValue.push(currentSampledValue)
  }
  return meterValue
}

/**
 * Builds an OCPP 2.0 sampled value from a template and measurement data.
 * @param sampledValueTemplate - The sampled value template to use.
 * @param value - The measured value.
 * @param context - The reading context.
 * @param phase - The phase of the measurement.
 * @returns The built OCPP 2.0 sampled value.
 */
export function buildSampledValueForOCPP20 (
  sampledValueTemplate: SampledValueTemplate,
  value: number,
  context?: MeterValueContext,
  phase?: MeterValuePhase
): OCPP20SampledValue {
  return buildSampledValue(
    OCPPVersion.VERSION_20,
    sampledValueTemplate,
    value,
    context,
    phase
  ) as OCPP20SampledValue
}
