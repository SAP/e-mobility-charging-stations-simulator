/**
 * @file Real-worker supervision URL update scenarios.
 * @description Exercises the updated payload and persisted configuration without opening a socket.
 */
import { readFileSync } from 'node:fs'
import { parentPort, workerData } from 'node:worker_threads'
// eslint-disable-next-line n/no-unpublished-import -- Test-only TypeScript loader.
import { register } from 'tsx/esm/api'

const unregister = register()
const { getConfigurationKey } =
  await import('../../../src/charging-station/ConfigurationKeyUtils.ts')
const { flushMicrotasks, standardCleanup } = await import('../../helpers/TestLifecycleHelpers.ts')
const {
  cleanupStationTemplates,
  copyStationTemplate,
  createStationFromTemplate,
  resolvePersistedConfigurationFile,
} = await import('../helpers/StationHelpers.realStation.ts')

const scenarios = []
let station
let failure
try {
  for (const supervisionUrlOcppConfiguration of [false, true]) {
    const template = copyStationTemplate({
      supervisionUrlOcppConfiguration,
      supervisionUrlOcppKey: workerData.key,
    })
    station = createStationFromTemplate(template, {
      baseName: workerData.stationId,
      fixedName: true,
      persistentConfiguration: true,
      supervisionPassword: 'old-password',
      supervisionUrls: 'ws://localhost:9999/',
      supervisionUser: 'old-user',
    })
    await station.pendingConfigurationSave
    const captureState = () => ({
      connectionUrl: station.wsConnectionUrl.href,
      creationOptions: structuredClone(station.creationOptions),
      ocppUrl: getConfigurationKey(station, workerData.key)?.value,
      stationInfo: {
        supervisionPassword: station.stationInfo?.supervisionPassword,
        supervisionUrls: station.stationInfo?.supervisionUrls,
        supervisionUser: station.stationInfo?.supervisionUser,
      },
    })

    // In a worker, updated synchronously builds a payload that reads wsConnectionUrl.
    station.setSupervisionUrl(workerData.url, 'new-user', '')
    await station.pendingConfigurationSave
    const accepted = captureState()
    const configurationFile = resolvePersistedConfigurationFile(template)
    const persistedBefore = readFileSync(configurationFile, 'utf8')
    let rejection
    try {
      station.setSupervisionUrl('not a url', 'rejected-user', 'rejected-password')
    } catch (error) {
      rejection = { message: error.message, name: error.name }
    }
    await station.pendingConfigurationSave
    scenarios.push({
      accepted,
      persistedAfter: readFileSync(configurationFile, 'utf8'),
      persistedBefore,
      rejected: captureState(),
      rejection,
      supervisionUrlOcppConfiguration,
    })
  }
} catch (error) {
  failure = { message: error.message, stack: error.stack }
} finally {
  await station?.pendingConfigurationSave
  await flushMicrotasks()
  standardCleanup()
  cleanupStationTemplates()
  unregister()
}
parentPort?.postMessage(
  failure == null
    ? { data: scenarios, event: 'supervisionUrlResult' }
    : { data: failure, event: 'supervisionUrlFailure' }
)
