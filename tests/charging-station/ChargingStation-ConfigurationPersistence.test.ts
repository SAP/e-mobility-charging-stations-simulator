/**
 * @file Tests for ChargingStation configuration persistence
 * @description Verifies isolated flat and nested template storage and restoration
 * from the same persisted configuration path.
 */
import { secondsToMilliseconds } from 'date-fns'
import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'
import type {
  ChargingStationConfiguration,
  ChargingStationTemplate,
} from '../../src/types/index.js'

import { setConfigurationKeyValue } from '../../src/charging-station/ConfigurationKeyUtils.js'
import { getHashId } from '../../src/charging-station/HelpersId.js'
import { getAssetFilePath } from '../../src/resolveAssetsDir.js'
import { StandardParametersKey } from '../../src/types/index.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import {
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_CUSTOM_HEARTBEAT_INTERVAL_SECONDS,
} from './ChargingStationTestConstants.js'
import {
  cleanupStationTemplates,
  copyStationTemplate,
  createStationFromTemplate,
} from './helpers/StationHelpers.realStation.js'

const OVERRIDE_KEY = 'EVSE_ASSETS_DIR'

interface StationPersistence {
  pendingConfigurationSave: Promise<void>
}

const waitForConfigurationSave = async (station: ChargingStation): Promise<void> => {
  await (station as unknown as StationPersistence).pendingConfigurationSave
}

await describe('ChargingStation configuration persistence', async () => {
  let originalOverride: string | undefined
  let stations: ChargingStation[]

  beforeEach(() => {
    originalOverride = process.env[OVERRIDE_KEY]
    stations = []
  })

  afterEach(async () => {
    try {
      for (const station of stations) {
        await waitForConfigurationSave(station)
        await station.delete(false)
      }
    } finally {
      standardCleanup()
      cleanupStationTemplates()
      if (originalOverride === undefined) {
        Reflect.deleteProperty(process.env, OVERRIDE_KEY)
      } else {
        process.env[OVERRIDE_KEY] = originalOverride
      }
    }
  })

  const makeStation = (templateFile: string): ChargingStation => {
    const station = createStationFromTemplate(templateFile, {
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      fixedName: true,
      persistentConfiguration: true,
    })
    stations.push(station)
    return station
  }

  const persistenceCases = [
    { canonical: false, name: 'flat external templates', parent: '' },
    { canonical: false, name: 'nested external templates', parent: 'vendor' },
    { canonical: true, name: 'flat canonical templates', parent: '' },
    { canonical: true, name: 'nested canonical templates', parent: 'vendor' },
    {
      assetsName: 'station-templates-assets',
      canonical: true,
      name: 'an assets root containing station-templates in its name',
      parent: 'vendor',
    },
    {
      canonical: true,
      name: 'a canonical vendor directory named station-templates',
      parent: join('vendor', 'station-templates', 'model'),
    },
    {
      assetsAlias: true,
      assetsName: 'selected-assets',
      canonical: true,
      name: 'a selected assets alias with linked templates and vendor directories',
      parent: join('vendor', 'linked', 'station-templates', 'model'),
    },
    {
      aliasInTemplates: true,
      assetsAlias: true,
      assetsName: 'selected-assets',
      canonical: true,
      name: 'an assets alias nested under the selected templates directory',
      parent: 'vendor',
    },
    {
      canonical: false,
      name: 'the nearest external station-templates directory',
      parent: join('vendor', 'station-templates', 'model'),
      storageParent: join('station-templates', 'vendor'),
      storageSubpath: 'model',
    },
    {
      canonical: false,
      name: 'an external template without a station-templates directory',
      outsideTemplates: true,
      parent: 'vendor',
    },
  ]

  for (const persistenceCase of persistenceCases) {
    await it(`should persist and restore configuration for ${persistenceCase.name}`, async () => {
      // Arrange
      const sourceTemplate = copyStationTemplate()
      const root = dirname(dirname(sourceTemplate))
      const assetsDir =
        persistenceCase.assetsName == null ? root : join(root, persistenceCase.assetsName)
      const selectedAssetsDir =
        persistenceCase.assetsAlias === true
          ? persistenceCase.aliasInTemplates === true
            ? join(assetsDir, 'station-templates', 'assets-alias')
            : join(root, 'assets-alias')
          : assetsDir
      if (persistenceCase.assetsAlias === true) {
        const templatesDir = join(root, 'templates-storage')
        const vendorDir = join(root, 'vendor-target')
        mkdirSync(join(templatesDir, 'vendor'), { recursive: true })
        mkdirSync(vendorDir)
        mkdirSync(assetsDir)
        symlinkSync(templatesDir, join(assetsDir, 'station-templates'), 'junction')
        symlinkSync(vendorDir, join(templatesDir, 'vendor', 'linked'), 'junction')
        symlinkSync(assetsDir, selectedAssetsDir, 'junction')
      }
      const templateParent =
        persistenceCase.outsideTemplates === true
          ? join(root, 'external', persistenceCase.parent)
          : join(selectedAssetsDir, 'station-templates', persistenceCase.parent)
      mkdirSync(templateParent, { recursive: true })
      const templateFile = join(templateParent, 'model.json')
      copyFileSync(sourceTemplate, templateFile)
      if (persistenceCase.canonical) {
        symlinkSync(getAssetFilePath('json-schemas'), join(assetsDir, 'json-schemas'), 'junction')
        process.env[OVERRIDE_KEY] = selectedAssetsDir
      }
      const template = JSON.parse(readFileSync(templateFile, 'utf8')) as ChargingStationTemplate
      const expectedConfigurationDir =
        persistenceCase.outsideTemplates === true
          ? templateParent
          : join(
            assetsDir,
            persistenceCase.storageParent ?? '',
            'configurations',
            persistenceCase.storageSubpath ?? persistenceCase.parent
          )
      const expectedConfigurationFile = join(
        expectedConfigurationDir,
        `${getHashId(1, template)}.json`
      )

      // Act
      const station = makeStation(templateFile)
      await waitForConfigurationSave(station)

      // Assert
      assert.strictEqual(existsSync(expectedConfigurationFile), true)
      if (persistenceCase.assetsAlias === true) {
        assert.strictEqual(station.stationInfo?.templateName, join(persistenceCase.parent, 'model'))
      }
      if (persistenceCase.canonical) {
        assert.strictEqual(
          existsSync(join(assetsDir, 'station-templates', 'configurations')),
          false
        )
      }
      const initialConfiguration = JSON.parse(
        readFileSync(expectedConfigurationFile, 'utf8')
      ) as ChargingStationConfiguration
      assert.strictEqual(
        initialConfiguration.stationInfo?.chargingStationId,
        TEST_CHARGING_STATION_BASE_NAME
      )

      // Change a public OCPP setting, then reconstruct from exactly the same file.
      const heartbeatInterval = String(TEST_CUSTOM_HEARTBEAT_INTERVAL_SECONDS)
      assert.notStrictEqual(
        setConfigurationKeyValue(
          station,
          StandardParametersKey.HeartbeatInterval,
          heartbeatInterval
        ),
        undefined
      )
      await waitForConfigurationSave(station)
      const savedConfiguration = JSON.parse(
        readFileSync(expectedConfigurationFile, 'utf8')
      ) as ChargingStationConfiguration
      assert.strictEqual(
        savedConfiguration.configurationKey?.find(
          entry => entry.key === StandardParametersKey.HeartbeatInterval.toString()
        )?.value,
        heartbeatInterval
      )
      await station.delete(false)
      standardCleanup()
      const restoredStation = makeStation(templateFile)
      await waitForConfigurationSave(restoredStation)
      assert.strictEqual(
        restoredStation.getHeartbeatInterval(),
        secondsToMilliseconds(TEST_CUSTOM_HEARTBEAT_INTERVAL_SECONDS)
      )
      assert.strictEqual(existsSync(expectedConfigurationFile), true)
    })
  }
})
