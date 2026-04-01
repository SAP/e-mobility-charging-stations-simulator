import type { ChargingStation } from '../../../charging-station/index.js'
import type { StopTransactionReason } from '../../../types/index.js'

import { OCPPError } from '../../../exception/index.js'
import {
  BootReasonEnumType,
  type ChargingStationInfo,
  type ConfigurationKeyType,
  CurrentType,
  ErrorType,
  type MeasurandPerPhaseSampledValueTemplates,
  type MeasurandValues,
  type MeterValueContext,
  type MeterValuePhase,
  MeterValueUnit,
  OCPP16StopTransactionReason,
  type OCPP20BootNotificationRequest,
  type OCPP20MeterValue,
  OCPP20ReasonEnumType,
  type OCPP20SampledValue,
  OCPP20TriggerReasonEnumType,
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

export const buildOCPP20BootNotificationRequest = (
  stationInfo: ChargingStationInfo,
  bootReason: BootReasonEnumType = BootReasonEnumType.PowerUp
): OCPP20BootNotificationRequest => ({
  chargingStation: {
    model: stationInfo.chargePointModel,
    vendorName: stationInfo.chargePointVendor,
    ...(stationInfo.firmwareVersion != null && {
      firmwareVersion: stationInfo.firmwareVersion,
    }),
    ...(stationInfo.chargeBoxSerialNumber != null && {
      serialNumber: stationInfo.chargeBoxSerialNumber,
    }),
    ...((stationInfo.iccid != null || stationInfo.imsi != null) && {
      modem: {
        ...(stationInfo.iccid != null && { iccid: stationInfo.iccid }),
        ...(stationInfo.imsi != null && { imsi: stationInfo.imsi }),
      },
    }),
  },
  reason: bootReason,
})

export const buildOCPP20MeterValue = (
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
    return buildOCPP20SampledValue(sampledValueTemplate, value, context, phase)
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
  // Power.Active.Import measurand
  const powerMeasurand = buildPowerMeasurandValue(
    chargingStation,
    connectorId,
    evseId,
    measurandsKey
  )
  if (powerMeasurand?.values.allPhases != null) {
    const unitDivider = powerMeasurand.template.unit === MeterValueUnit.KILO_WATT ? 1000 : 1
    const connectorMaximumAvailablePower =
      chargingStation.getConnectorMaximumAvailablePower(connectorId)
    const connectorMaximumPower = Math.round(connectorMaximumAvailablePower)
    const connectorMinimumPower = Math.round(powerMeasurand.template.minimumValue ?? 0)

    meterValue.sampledValue.push(
      buildVersionedSampledValue(powerMeasurand.template, powerMeasurand.values.allPhases, context)
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
            buildVersionedSampledValue(phaseTemplate, phasePowerValue, context, phaseValue)
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
    evseId,
    measurandsKey
  )
  if (currentMeasurand?.values.allPhases != null) {
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
      buildVersionedSampledValue(
        currentMeasurand.template,
        currentMeasurand.values.allPhases,
        context
      )
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
          context,
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
export function buildOCPP20SampledValue (
  sampledValueTemplate: SampledValueTemplate,
  value: number,
  context?: MeterValueContext,
  phase?: MeterValuePhase
): OCPP20SampledValue {
  const fields = resolveSampledValueFields(sampledValueTemplate, value, context, phase)
  return {
    context: fields.context,
    location: fields.location,
    measurand: fields.measurand,
    ...(fields.unit != null && { unitOfMeasure: { unit: fields.unit } }),
    value: fields.value,
    ...(fields.phase != null && { phase: fields.phase }),
  } as OCPP20SampledValue
}

export const mapStopReasonToOCPP20 = (
  reason?: StopTransactionReason
): {
  stoppedReason: OCPP20ReasonEnumType
  triggerReason: OCPP20TriggerReasonEnumType
} => {
  switch (reason) {
    case OCPP16StopTransactionReason.DE_AUTHORIZED:
    case OCPP20ReasonEnumType.DeAuthorized:
      return {
        stoppedReason: OCPP20ReasonEnumType.DeAuthorized,
        triggerReason: OCPP20TriggerReasonEnumType.Deauthorized,
      }
    case OCPP16StopTransactionReason.EMERGENCY_STOP:
    case OCPP20ReasonEnumType.EmergencyStop:
      return {
        stoppedReason: OCPP20ReasonEnumType.EmergencyStop,
        triggerReason: OCPP20TriggerReasonEnumType.AbnormalCondition,
      }
    case OCPP16StopTransactionReason.EV_DISCONNECTED:
    case OCPP20ReasonEnumType.EVDisconnected:
      return {
        stoppedReason: OCPP20ReasonEnumType.EVDisconnected,
        triggerReason: OCPP20TriggerReasonEnumType.EVDeparted,
      }
    case OCPP16StopTransactionReason.HARD_RESET:
    case OCPP16StopTransactionReason.REBOOT:
    case OCPP16StopTransactionReason.SOFT_RESET:
    case OCPP20ReasonEnumType.ImmediateReset:
    case OCPP20ReasonEnumType.Reboot:
      return {
        stoppedReason: OCPP20ReasonEnumType.ImmediateReset,
        triggerReason: OCPP20TriggerReasonEnumType.ResetCommand,
      }
    case OCPP16StopTransactionReason.OTHER:
    case OCPP20ReasonEnumType.Other:
      return {
        stoppedReason: OCPP20ReasonEnumType.Other,
        triggerReason: OCPP20TriggerReasonEnumType.AbnormalCondition,
      }
    case OCPP16StopTransactionReason.POWER_LOSS:
    case OCPP20ReasonEnumType.PowerLoss:
      return {
        stoppedReason: OCPP20ReasonEnumType.PowerLoss,
        triggerReason: OCPP20TriggerReasonEnumType.AbnormalCondition,
      }
    case OCPP16StopTransactionReason.REMOTE:
    case OCPP20ReasonEnumType.Remote:
      return {
        stoppedReason: OCPP20ReasonEnumType.Remote,
        triggerReason: OCPP20TriggerReasonEnumType.RemoteStop,
      }
    case OCPP20ReasonEnumType.TimeLimitReached:
      return {
        stoppedReason: OCPP20ReasonEnumType.TimeLimitReached,
        triggerReason: OCPP20TriggerReasonEnumType.TimeLimitReached,
      }
    case OCPP16StopTransactionReason.LOCAL:
    case OCPP20ReasonEnumType.Local:
    case undefined:
    default:
      return {
        stoppedReason: OCPP20ReasonEnumType.Local,
        triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
      }
  }
}
