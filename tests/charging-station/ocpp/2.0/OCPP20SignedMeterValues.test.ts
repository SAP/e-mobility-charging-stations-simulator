/**
 * @file Tests for OCPP 2.0 signed meter value support
 * @description Verifies signedMeterValue population in sampled value building,
 *              context-dependent sub-switch logic, and public key inclusion.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { addConfigurationKey, buildConfigKey } from '../../../../src/charging-station/index.js'
import { buildOCPP20SampledValue } from '../../../../src/charging-station/ocpp/2.0/OCPP20RequestBuilders.js'
import { buildMeterValue } from '../../../../src/charging-station/ocpp/OCPPServiceUtils.js'
import { type SampledValueSigningConfig } from '../../../../src/charging-station/ocpp/OCPPSignedMeterValueUtils.js'
import {
  MeterValueMeasurand,
  OCPP20ComponentName,
  OCPP20ReadingContextEnumType,
  type OCPP20SampledValue,
  OCPPVersion,
  PublicKeyWithSignedMeterValueEnumType,
  type SampledValueTemplate,
  SigningMethodEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_TRANSACTION_ID_STRING,
} from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

const energyTemplate: SampledValueTemplate = {
  measurand: MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
  unit: 'Wh',
  value: '0',
} as unknown as SampledValueTemplate

const voltageTemplate: SampledValueTemplate = {
  measurand: MeterValueMeasurand.VOLTAGE,
  unit: 'V',
  value: '230',
} as unknown as SampledValueTemplate

await describe('OCPP 2.0 Signed Meter Values', async () => {
  await describe('buildOCPP20SampledValue with signing config', async () => {
    await it('should add signedMeterValue when signing is enabled for energy measurand', () => {
      const signingConfig: SampledValueSigningConfig = {
        enabled: true,
        meterSerialNumber: 'SIM-METER-001',
        publicKeyHex: 'abcdef1234567890',
        publicKeySentInTransaction: false,
        publicKeyWithSignedMeterValue: PublicKeyWithSignedMeterValueEnumType.EveryMeterValue,
        transactionId: 'tx-1',
      }

      const { sampledValue } = buildOCPP20SampledValue(
        energyTemplate,
        1500,
        undefined,
        undefined,
        signingConfig
      )

      assert.ok(sampledValue.signedMeterValue != null)
      assert.strictEqual(
        sampledValue.signedMeterValue.signingMethod,
        SigningMethodEnumType.ECDSA_secp256r1_SHA256
      )
      assert.strictEqual(sampledValue.signedMeterValue.encodingMethod, 'OCMF')
    })

    await it('should not add signedMeterValue when signing is disabled', () => {
      const { sampledValue } = buildOCPP20SampledValue(energyTemplate, 1500)

      assert.strictEqual(sampledValue.signedMeterValue, undefined)
    })

    await it('should not add signedMeterValue for non-energy measurands', () => {
      const signingConfig: SampledValueSigningConfig = {
        enabled: true,
        meterSerialNumber: 'SIM-METER-001',
        publicKeySentInTransaction: false,
        publicKeyWithSignedMeterValue: PublicKeyWithSignedMeterValueEnumType.EveryMeterValue,
        transactionId: 'tx-1',
      }

      const { sampledValue } = buildOCPP20SampledValue(
        voltageTemplate,
        230,
        undefined,
        undefined,
        signingConfig
      )

      assert.strictEqual(sampledValue.signedMeterValue, undefined)
    })

    await it('should include publicKey when configured as EveryMeterValue', () => {
      const signingConfig: SampledValueSigningConfig = {
        enabled: true,
        meterSerialNumber: 'SIM-METER-001',
        publicKeyHex: 'abcdef1234567890',
        publicKeySentInTransaction: false,
        publicKeyWithSignedMeterValue: PublicKeyWithSignedMeterValueEnumType.EveryMeterValue,
        transactionId: 'tx-1',
      }

      const { sampledValue } = buildOCPP20SampledValue(
        energyTemplate,
        1500,
        undefined,
        undefined,
        signingConfig
      )

      assert.notStrictEqual(sampledValue.signedMeterValue?.publicKey, '')
    })

    await it('should set publicKey to empty string when configured as Never', () => {
      const signingConfig: SampledValueSigningConfig = {
        enabled: true,
        meterSerialNumber: 'SIM-METER-001',
        publicKeyHex: 'abcdef1234567890',
        publicKeySentInTransaction: false,
        publicKeyWithSignedMeterValue: PublicKeyWithSignedMeterValueEnumType.Never,
        transactionId: 'tx-1',
      }

      const { sampledValue } = buildOCPP20SampledValue(
        energyTemplate,
        1500,
        undefined,
        undefined,
        signingConfig
      )

      assert.strictEqual(sampledValue.signedMeterValue?.publicKey, '')
    })

    await it('should set publicKeySentInTransaction after including publicKey with OncePerTransaction', () => {
      const signingConfig: SampledValueSigningConfig = {
        enabled: true,
        meterSerialNumber: 'SIM-METER-001',
        publicKeyHex: 'abcdef1234567890',
        publicKeySentInTransaction: false,
        publicKeyWithSignedMeterValue: PublicKeyWithSignedMeterValueEnumType.OncePerTransaction,
        transactionId: 'tx-1',
      }

      const firstResult = buildOCPP20SampledValue(
        energyTemplate,
        1500,
        undefined,
        undefined,
        signingConfig
      )
      assert.strictEqual(firstResult.publicKeyIncluded, true)

      signingConfig.publicKeySentInTransaction = true
      const secondResult = buildOCPP20SampledValue(
        energyTemplate,
        1500,
        undefined,
        undefined,
        signingConfig
      )
      assert.strictEqual(secondResult.publicKeyIncluded, false)
    })

    await it('should not include publicKey on second call with OncePerTransaction', () => {
      const signingConfig: SampledValueSigningConfig = {
        enabled: true,
        meterSerialNumber: 'SIM-METER-001',
        publicKeyHex: 'abcdef1234567890',
        publicKeySentInTransaction: true,
        publicKeyWithSignedMeterValue: PublicKeyWithSignedMeterValueEnumType.OncePerTransaction,
        transactionId: 'tx-1',
      }

      const { sampledValue } = buildOCPP20SampledValue(
        energyTemplate,
        1500,
        undefined,
        undefined,
        signingConfig
      )

      assert.strictEqual(sampledValue.signedMeterValue?.publicKey, '')
    })
  })

  await describe('buildMeterValue with OCPP 2.0 signing integration', async () => {
    let station: ChargingStation

    afterEach(() => {
      standardCleanup()
    })

    beforeEach(() => {
      const { station: s } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
        stationInfo: {
          meterSerialNumber: 'SIM-METER-001',
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      station = s
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = [energyTemplate]
        connectorStatus.transactionId = TEST_TRANSACTION_ID_STRING
      }
    })

    await it('should add signedMeterValue on energy sampled value when SignReadings is true', () => {
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.SampledDataCtrlr, 'SignReadings'),
        'true'
      )
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.SampledDataCtrlr, 'SignUpdatedReadings'),
        'true'
      )
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.OCPPCommCtrlr, 'PublicKeyWithSignedMeterValue'),
        PublicKeyWithSignedMeterValueEnumType.Never
      )

      const meterValue = buildMeterValue(station, TEST_TRANSACTION_ID_STRING, 0)

      assert.ok(meterValue.sampledValue.length > 0)
      const energySampledValue = meterValue.sampledValue.find(
        sv => sv.measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      ) as OCPP20SampledValue | undefined
      assert.notStrictEqual(energySampledValue, undefined)
      assert.ok(energySampledValue?.signedMeterValue != null)
      assert.strictEqual(
        energySampledValue.signedMeterValue.signingMethod,
        SigningMethodEnumType.ECDSA_secp256r1_SHA256
      )
      assert.strictEqual(energySampledValue.signedMeterValue.encodingMethod, 'OCMF')
    })

    await it('should not add signedMeterValue when SignReadings is not configured', () => {
      const meterValue = buildMeterValue(station, TEST_TRANSACTION_ID_STRING, 0)

      assert.ok(meterValue.sampledValue.length > 0)
      const energySampledValue = meterValue.sampledValue.find(
        sv => sv.measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      ) as OCPP20SampledValue | undefined
      assert.notStrictEqual(energySampledValue, undefined)
      assert.strictEqual(energySampledValue?.signedMeterValue, undefined)
    })

    await it('should not add signedMeterValue when SignReadings is false', () => {
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.SampledDataCtrlr, 'SignReadings'),
        'false'
      )

      const meterValue = buildMeterValue(station, TEST_TRANSACTION_ID_STRING, 0)

      const energySampledValue = meterValue.sampledValue.find(
        sv => sv.measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      ) as OCPP20SampledValue | undefined
      assert.strictEqual(energySampledValue?.signedMeterValue, undefined)
    })

    await it('should not sign non-energy measurands even when signing is enabled', () => {
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = [voltageTemplate, energyTemplate]
      }
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.SampledDataCtrlr, 'SignReadings'),
        'true'
      )
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.OCPPCommCtrlr, 'PublicKeyWithSignedMeterValue'),
        PublicKeyWithSignedMeterValueEnumType.Never
      )
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.SampledDataCtrlr, 'TxUpdatedMeasurands'),
        'Voltage,Energy.Active.Import.Register'
      )

      const meterValue = buildMeterValue(station, TEST_TRANSACTION_ID_STRING, 0)

      const voltageSampledValue = meterValue.sampledValue.find(
        sv => sv.measurand === MeterValueMeasurand.VOLTAGE
      ) as OCPP20SampledValue | undefined
      assert.strictEqual(
        voltageSampledValue?.signedMeterValue,
        undefined,
        'Voltage measurand should not have signedMeterValue'
      )
    })

    await it('should set publicKeySentInTransaction on connector status with OncePerTransaction', () => {
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.SampledDataCtrlr, 'SignReadings'),
        'true'
      )
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.SampledDataCtrlr, 'SignUpdatedReadings'),
        'true'
      )
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.OCPPCommCtrlr, 'PublicKeyWithSignedMeterValue'),
        PublicKeyWithSignedMeterValueEnumType.OncePerTransaction
      )
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.FiscalMetering, 'PublicKey'),
        'abcdef1234567890'
      )

      const connectorStatus = station.getConnectorStatus(1)
      assert.strictEqual(connectorStatus?.publicKeySentInTransaction ?? false, false)

      buildMeterValue(station, TEST_TRANSACTION_ID_STRING, 0)

      assert.strictEqual(connectorStatus?.publicKeySentInTransaction, true)
    })

    await it('should not sign when SignReadings=true but SignStartedReadings=false with TRANSACTION_BEGIN context', () => {
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.SampledDataCtrlr, 'SignReadings'),
        'true'
      )
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.SampledDataCtrlr, 'SignStartedReadings'),
        'false'
      )
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.OCPPCommCtrlr, 'PublicKeyWithSignedMeterValue'),
        PublicKeyWithSignedMeterValueEnumType.Never
      )

      const meterValue = buildMeterValue(
        station,
        TEST_TRANSACTION_ID_STRING,
        0,
        undefined,
        OCPP20ReadingContextEnumType.TRANSACTION_BEGIN
      )

      const energySampledValue = meterValue.sampledValue.find(
        sv => sv.measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      ) as OCPP20SampledValue | undefined
      assert.strictEqual(
        energySampledValue?.signedMeterValue,
        undefined,
        'Should not sign when SignStartedReadings is false'
      )
    })

    await it('should sign when SignReadings=true and SignStartedReadings=true with TRANSACTION_BEGIN context', () => {
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.SampledDataCtrlr, 'SignReadings'),
        'true'
      )
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.SampledDataCtrlr, 'SignStartedReadings'),
        'true'
      )
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.OCPPCommCtrlr, 'PublicKeyWithSignedMeterValue'),
        PublicKeyWithSignedMeterValueEnumType.Never
      )
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.FiscalMetering, 'PublicKey'),
        'abcdef1234567890'
      )

      const meterValue = buildMeterValue(
        station,
        TEST_TRANSACTION_ID_STRING,
        0,
        undefined,
        OCPP20ReadingContextEnumType.TRANSACTION_BEGIN
      )

      const energySampledValue = meterValue.sampledValue.find(
        sv => sv.measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      ) as OCPP20SampledValue | undefined
      assert.ok(
        energySampledValue?.signedMeterValue != null,
        'Should sign when SignStartedReadings is true'
      )
    })

    await it('should not sign when SignReadings=true but SignUpdatedReadings=false with periodic context', () => {
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.SampledDataCtrlr, 'SignReadings'),
        'true'
      )
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.SampledDataCtrlr, 'SignUpdatedReadings'),
        'false'
      )
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.OCPPCommCtrlr, 'PublicKeyWithSignedMeterValue'),
        PublicKeyWithSignedMeterValueEnumType.Never
      )

      const meterValue = buildMeterValue(
        station,
        TEST_TRANSACTION_ID_STRING,
        0,
        undefined,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC
      )

      const energySampledValue = meterValue.sampledValue.find(
        sv => sv.measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      ) as OCPP20SampledValue | undefined
      assert.strictEqual(
        energySampledValue?.signedMeterValue,
        undefined,
        'Should not sign when SignUpdatedReadings is false'
      )
    })

    await it('should sign when SignReadings=true and SignUpdatedReadings=true with periodic context', () => {
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.SampledDataCtrlr, 'SignReadings'),
        'true'
      )
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.SampledDataCtrlr, 'SignUpdatedReadings'),
        'true'
      )
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.OCPPCommCtrlr, 'PublicKeyWithSignedMeterValue'),
        PublicKeyWithSignedMeterValueEnumType.Never
      )
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.FiscalMetering, 'PublicKey'),
        'abcdef1234567890'
      )

      const meterValue = buildMeterValue(
        station,
        TEST_TRANSACTION_ID_STRING,
        0,
        undefined,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC
      )

      const energySampledValue = meterValue.sampledValue.find(
        sv => sv.measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      ) as OCPP20SampledValue | undefined
      assert.ok(
        energySampledValue?.signedMeterValue != null,
        'Should sign when SignUpdatedReadings is true'
      )
    })

    await it('should sign when SignReadings=true with TRANSACTION_END context regardless of sub-switches', () => {
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.SampledDataCtrlr, 'SignReadings'),
        'true'
      )
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.SampledDataCtrlr, 'SignStartedReadings'),
        'false'
      )
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.SampledDataCtrlr, 'SignUpdatedReadings'),
        'false'
      )
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.OCPPCommCtrlr, 'PublicKeyWithSignedMeterValue'),
        PublicKeyWithSignedMeterValueEnumType.Never
      )
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.FiscalMetering, 'PublicKey'),
        'abcdef1234567890'
      )

      const meterValue = buildMeterValue(
        station,
        TEST_TRANSACTION_ID_STRING,
        0,
        undefined,
        OCPP20ReadingContextEnumType.TRANSACTION_END
      )

      const energySampledValue = meterValue.sampledValue.find(
        sv => sv.measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      ) as OCPP20SampledValue | undefined
      assert.ok(
        energySampledValue?.signedMeterValue != null,
        'Should always sign TRANSACTION_END regardless of sub-switches'
      )
    })
  })
})
