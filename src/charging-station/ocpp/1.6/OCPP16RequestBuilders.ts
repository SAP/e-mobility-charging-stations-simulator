import type { ChargingStation } from '../../../charging-station/index.js'

import { OCPPError } from '../../../exception/index.js'
import {
  type ChargingStationInfo,
  type ConfigurationKeyType,
  CurrentType,
  ErrorType,
  type MeasurandPerPhaseSampledValueTemplates,
  type MeasurandValues,
  type MeterValueContext,
  type MeterValuePhase,
  MeterValueUnit,
  type OCPP16BootNotificationRequest,
  type OCPP16MeterValue,
  type OCPP16SampledValue,
  RequestCommand,
  type SampledValueTemplate,
} from '../../../types/index.js'
import { ACElectricUtils, DCElectricUtils, roundTo } from '../../../utils/index.js'
import {
  addLineToLineVoltageToMeterValue,
  addMainVoltageToMeterValue,
  addPhaseVoltageToMeterValue,
  buildCurrentMeasurandValue,
  buildEmptyMeterValue,
  buildEnergyMeasurandValue,
  buildPowerMeasurandValue,
  buildSocMeasurandValue,
  buildVoltageMeasurandValue,
  resolveSampledValueFields,
  updateConnectorEnergyValues,
  validateCurrentMeasurandPhaseValue,
  validateCurrentMeasurandValue,
  validateEnergyMeasurandValue,
  validatePowerMeasurandValue,
  validateSocMeasurandValue,
} from '../OCPPServiceUtils.js'

export const buildOCPP16BootNotificationRequest = (
  stationInfo: ChargingStationInfo
): OCPP16BootNotificationRequest => ({
  chargePointModel: stationInfo.chargePointModel,
  chargePointVendor: stationInfo.chargePointVendor,
  ...(stationInfo.chargeBoxSerialNumber != null && {
    chargeBoxSerialNumber: stationInfo.chargeBoxSerialNumber,
  }),
  ...(stationInfo.chargePointSerialNumber != null && {
    chargePointSerialNumber: stationInfo.chargePointSerialNumber,
  }),
  ...(stationInfo.firmwareVersion != null && {
    firmwareVersion: stationInfo.firmwareVersion,
  }),
  ...(stationInfo.iccid != null && { iccid: stationInfo.iccid }),
  ...(stationInfo.imsi != null && { imsi: stationInfo.imsi }),
  ...(stationInfo.meterSerialNumber != null && {
    meterSerialNumber: stationInfo.meterSerialNumber,
  }),
  ...(stationInfo.meterType != null && {
    meterType: stationInfo.meterType,
  }),
})

export const buildOCPP16MeterValue = (
  chargingStation: ChargingStation,
  transactionId: number | string,
  interval: number,
  measurandsKey?: ConfigurationKeyType,
  context?: MeterValueContext,
  debug = false
): OCPP16MeterValue => {
  const connectorId = chargingStation.getConnectorIdByTransactionId(transactionId)
  if (connectorId == null) {
    throw new OCPPError(
      ErrorType.INTERNAL_ERROR,
      `Cannot build MeterValues: no connector found for transaction ${String(transactionId)}`,
      RequestCommand.METER_VALUES
    )
  }
  const connectorStatus = chargingStation.getConnectorStatus(connectorId)
  const meterValue = buildEmptyMeterValue() as OCPP16MeterValue
  const buildVersionedSampledValue = (
    sampledValueTemplate: SampledValueTemplate,
    value: number,
    context?: MeterValueContext,
    phase?: MeterValuePhase
  ): OCPP16SampledValue => {
    return buildOCPP16SampledValue(sampledValueTemplate, value, context, phase)
  }
  // SoC measurand
  const socMeasurand = buildSocMeasurandValue(
    chargingStation,
    connectorId,
    undefined,
    measurandsKey
  )
  if (socMeasurand != null) {
    const socSampledValue = buildVersionedSampledValue(socMeasurand.template, socMeasurand.value)
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
    undefined,
    measurandsKey
  )
  if (voltageMeasurand != null) {
    addMainVoltageToMeterValue(
      chargingStation,
      meterValue,
      voltageMeasurand,
      buildVersionedSampledValue
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
        buildVersionedSampledValue
      )
      addLineToLineVoltageToMeterValue(
        chargingStation,
        connectorId,
        meterValue,
        voltageMeasurand,
        phase,
        buildVersionedSampledValue
      )
    }
  }
  // Power.Active.Import measurand
  const powerMeasurand = buildPowerMeasurandValue(
    chargingStation,
    connectorId,
    undefined,
    measurandsKey
  )
  if (powerMeasurand != null) {
    const unitDivider = powerMeasurand.template.unit === MeterValueUnit.KILO_WATT ? 1000 : 1
    const connectorMaximumAvailablePower =
      chargingStation.getConnectorMaximumAvailablePower(connectorId)
    const connectorMaximumPower = Math.round(connectorMaximumAvailablePower)
    const connectorMinimumPower = Math.round(powerMeasurand.template.minimumValue ?? 0)

    meterValue.sampledValue.push(
      buildVersionedSampledValue(powerMeasurand.template, powerMeasurand.values.allPhases)
    )
    const sampledValuesIndex = meterValue.sampledValue.length - 1
    validatePowerMeasurandValue(
      chargingStation,
      connectorId,
      connectorStatus,
      meterValue.sampledValue[sampledValuesIndex],
      connectorMaximumPower / unitDivider,
      connectorMinimumPower / unitDivider,
      debug
    )
    if (chargingStation.getNumberOfPhases() === 3) {
      const connectorMaximumPowerPerPhase = Math.round(
        connectorMaximumAvailablePower / chargingStation.getNumberOfPhases()
      )
      const connectorMinimumPowerPerPhase = Math.round(
        connectorMinimumPower / chargingStation.getNumberOfPhases()
      )
      for (let phase = 1; phase <= chargingStation.getNumberOfPhases(); phase++) {
        const phaseTemplate =
          powerMeasurand.perPhaseTemplates[
            `L${phase.toString()}` as keyof MeasurandPerPhaseSampledValueTemplates
          ]
        if (phaseTemplate != null) {
          const phaseValue = `L${phase.toString()}-N` as MeterValuePhase
          const phasePowerValue =
            powerMeasurand.values[`L${phase.toString()}` as keyof MeasurandValues]
          meterValue.sampledValue.push(
            buildVersionedSampledValue(phaseTemplate, phasePowerValue, undefined, phaseValue)
          )
          const sampledValuesPerPhaseIndex = meterValue.sampledValue.length - 1
          validatePowerMeasurandValue(
            chargingStation,
            connectorId,
            connectorStatus,
            meterValue.sampledValue[sampledValuesPerPhaseIndex],
            connectorMaximumPowerPerPhase / unitDivider,
            connectorMinimumPowerPerPhase / unitDivider,
            debug
          )
        }
      }
    }
  }
  // Current.Import measurand
  const currentMeasurand = buildCurrentMeasurandValue(
    chargingStation,
    connectorId,
    undefined,
    measurandsKey
  )
  if (currentMeasurand != null) {
    const connectorMaximumAvailablePower =
      chargingStation.getConnectorMaximumAvailablePower(connectorId)
    const connectorMaximumAmperage =
      chargingStation.stationInfo?.currentOutType === CurrentType.AC
        ? ACElectricUtils.amperagePerPhaseFromPower(
          chargingStation.getNumberOfPhases(),
          connectorMaximumAvailablePower,
          chargingStation.getVoltageOut()
        )
        : DCElectricUtils.amperage(connectorMaximumAvailablePower, chargingStation.getVoltageOut())
    const connectorMinimumAmperage = currentMeasurand.template.minimumValue ?? 0

    meterValue.sampledValue.push(
      buildVersionedSampledValue(currentMeasurand.template, currentMeasurand.values.allPhases)
    )
    const sampledValuesIndex = meterValue.sampledValue.length - 1
    validateCurrentMeasurandValue(
      chargingStation,
      connectorId,
      connectorStatus,
      meterValue.sampledValue[sampledValuesIndex],
      connectorMaximumAmperage,
      connectorMinimumAmperage,
      debug
    )
    for (
      let phase = 1;
      chargingStation.getNumberOfPhases() === 3 && phase <= chargingStation.getNumberOfPhases();
      phase++
    ) {
      const phaseValue = `L${phase.toString()}` as MeterValuePhase
      meterValue.sampledValue.push(
        buildVersionedSampledValue(
          currentMeasurand.perPhaseTemplates[
            phaseValue as keyof MeasurandPerPhaseSampledValueTemplates
          ] ?? currentMeasurand.template,
          currentMeasurand.values[phaseValue as keyof MeasurandPerPhaseSampledValueTemplates],
          undefined,
          phaseValue
        )
      )
      const sampledValuesPerPhaseIndex = meterValue.sampledValue.length - 1
      validateCurrentMeasurandPhaseValue(
        chargingStation,
        connectorId,
        connectorStatus,
        meterValue.sampledValue[sampledValuesPerPhaseIndex],
        connectorMaximumAmperage,
        connectorMinimumAmperage,
        debug
      )
    }
  }
  // Energy.Active.Import.Register measurand (default)
  const energyMeasurand = buildEnergyMeasurandValue(
    chargingStation,
    connectorId,
    interval,
    undefined,
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
      )
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
  return meterValue
}

/**
 * Builds an OCPP 1.6 sampled value from a template and measurement data.
 * @param sampledValueTemplate - The sampled value template to use.
 * @param value - The measured value.
 * @param context - The reading context.
 * @param phase - The phase of the measurement.
 * @returns The built OCPP 1.6 sampled value.
 */
export function buildOCPP16SampledValue (
  sampledValueTemplate: SampledValueTemplate,
  value: number,
  context?: MeterValueContext,
  phase?: MeterValuePhase
): OCPP16SampledValue {
  const fields = resolveSampledValueFields(sampledValueTemplate, value, context, phase)
  return {
    context: fields.context,
    location: fields.location,
    measurand: fields.measurand,
    unit: fields.unit,
    value: fields.value.toString(),
    ...(fields.phase != null && { phase: fields.phase }),
  } as OCPP16SampledValue
}
