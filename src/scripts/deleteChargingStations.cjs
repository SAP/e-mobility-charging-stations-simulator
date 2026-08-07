const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_CONFIG = Object.freeze({
  pollIntervalMs: 1000,
  pollTimeoutMs: 120000,
  stateFile: 'deleteChargingStations.state.json',
})

const Phase = Object.freeze({
  CLEAN_PROPERTY: 'CLEAN_PROPERTY',
  CLEAN_SITE: 'CLEAN_SITE',
  COMPLETE: 'COMPLETE',
  DECOMMISSION: 'DECOMMISSION',
  DELETE_CHARGER: 'DELETE_CHARGER',
  PATCH_CONNECTORS: 'PATCH_CONNECTORS',
  POLL_DECOMMISSION: 'POLL_DECOMMISSION',
  PREFLIGHT: 'PREFLIGHT',
  VERIFY_CHARGER: 'VERIFY_CHARGER',
  VERIFY_PROPERTY: 'VERIFY_PROPERTY',
  VERIFY_SITE: 'VERIFY_SITE',
})

class DeletionWorkflowError extends Error {
  constructor (message) {
    super(message)
    this.name = 'DeletionWorkflowError'
  }
}

class DriivzApiError extends Error {
  constructor (method, requestPath, status, responseBody) {
    super(`Driivz ${method} ${requestPath} failed with status ${status.toString()}`)
    this.name = 'DriivzApiError'
    this.method = method
    this.requestPath = requestPath
    this.responseBody = responseBody
    this.status = status
  }
}

class DriivzClient {
  constructor ({ baseUrl, fetchImplementation = globalThis.fetch, headers = {} }) {
    if (typeof fetchImplementation !== 'function') {
      throw new DeletionWorkflowError('A fetch implementation is required')
    }
    this.baseUrl = baseUrl.replace(/\/$/u, '')
    this.fetchImplementation = fetchImplementation
    this.headers = headers
  }

  decommissionCharger (chargerId, date) {
    return this.request(
      'PATCH',
      `/v1/chargers/${encodeURIComponent(chargerId)}/status/actions/decommission`,
      { allowPastDate: true, date }
    )
  }

  deleteCharger (chargerId) {
    return this.request('DELETE', `/v1/chargers/${encodeURIComponent(chargerId)}`)
  }

  deleteProperty (propertyId) {
    return this.request('DELETE', `/v1/properties/${encodeURIComponent(propertyId)}`)
  }

  deleteSite (siteId) {
    return this.request('DELETE', `/v1/sites/${encodeURIComponent(siteId)}`)
  }

  filterEvTransactions (chargerId) {
    return this.request('POST', '/v1/ev-transactions/filter', { chargerIds: [chargerId] })
  }

  filterReservations (chargerId) {
    return this.request('POST', '/v1/reservations/filter', { chargerIds: [chargerId] })
  }

  getChargerProfile (chargerId) {
    return this.requestOptional('GET', `/v1/chargers/${encodeURIComponent(chargerId)}/profile`)
  }

  getProperty (propertyId) {
    return this.requestOptional('GET', `/v1/properties/${encodeURIComponent(propertyId)}`)
  }

  getSite (siteId) {
    return this.requestOptional('GET', `/v1/sites/${encodeURIComponent(siteId)}`)
  }

  patchConnectorEvse (chargerId, connectorId, payload) {
    return this.request(
      'PATCH',
      `/v1/chargers/${encodeURIComponent(chargerId)}/connectors/${encodeURIComponent(connectorId)}/evse`,
      payload
    )
  }

  async request (method, requestPath, body) {
    const response = await this.fetchImplementation(`${this.baseUrl}${requestPath}`, {
      body: body == null ? undefined : JSON.stringify(body),
      headers: {
        Accept: 'application/json',
        ...(body == null ? {} : { 'Content-Type': 'application/json' }),
        ...this.headers,
      },
      method,
    })
    const responseText = await response.text()
    let responseBody
    if (responseText.length > 0) {
      try {
        responseBody = JSON.parse(responseText)
      } catch {
        responseBody = responseText
      }
    }
    if (!response.ok) {
      throw new DriivzApiError(method, requestPath, response.status, responseBody)
    }
    return responseBody
  }

  async requestOptional (method, requestPath) {
    try {
      return await this.request(method, requestPath)
    } catch (error) {
      if (error instanceof DriivzApiError && error.status === 404) {
        return null
      }
      throw error
    }
  }
}

class DriivzDeletionWorkflow {
  constructor ({
    chargers,
    client,
    now = Date.now,
    pollIntervalMs = DEFAULT_CONFIG.pollIntervalMs,
    pollTimeoutMs = DEFAULT_CONFIG.pollTimeoutMs,
    sleep = async delay => new Promise(resolve => setTimeout(resolve, delay)),
    stateStore,
  }) {
    this.chargers = chargers
    this.client = client
    this.now = now
    this.pollIntervalMs = pollIntervalMs
    this.pollTimeoutMs = pollTimeoutMs
    this.sleep = sleep
    this.stateStore = stateStore
  }

  async cleanProperty (state, chargerState) {
    const { propertyId } = chargerState.charger
    if (propertyId == null) {
      this.complete(state, chargerState, 'Charger deletion completed')
      return false
    }
    const property = await this.client.getProperty(propertyId)
    if (property == null) {
      this.complete(state, chargerState, 'Charger and parent deletion completed')
      return false
    }
    if (!Array.isArray(property.siteIds)) {
      throw new DeletionWorkflowError(`Property ${propertyId} read-back does not contain siteIds`)
    }
    if (property.siteIds.length > 0) {
      this.complete(state, chargerState, `Property ${propertyId} is not empty`)
      return false
    }
    if (getSharedFlag(property) !== false) {
      this.complete(
        state,
        chargerState,
        `Property ${propertyId} is shared or has no explicit sharing flag`
      )
      return false
    }
    await this.client.deleteProperty(propertyId)
    this.transition(state, chargerState, Phase.VERIFY_PROPERTY)
    return true
  }

  async cleanSite (state, chargerState) {
    const { siteId } = chargerState.charger
    if (siteId == null) {
      this.transition(state, chargerState, Phase.CLEAN_PROPERTY)
      return true
    }
    const site = await this.client.getSite(siteId)
    if (site == null) {
      this.transition(state, chargerState, Phase.CLEAN_PROPERTY)
      return true
    }
    if (!Array.isArray(site.chargerIds)) {
      throw new DeletionWorkflowError(`Site ${siteId} read-back does not contain chargerIds`)
    }
    if (site.chargerIds.length > 0) {
      this.complete(state, chargerState, `Site ${siteId} is not empty`)
      return false
    }
    await this.client.deleteSite(siteId)
    this.transition(state, chargerState, Phase.VERIFY_SITE)
    return true
  }

  complete (state, chargerState, outcome) {
    chargerState.outcome = outcome
    this.transition(state, chargerState, Phase.COMPLETE)
  }

  async deleteCharger (state, chargerState) {
    try {
      await this.client.deleteCharger(chargerState.charger.id)
    } catch (error) {
      if (!(error instanceof DriivzApiError) || error.status !== 404) {
        throw error
      }
    }
    this.transition(state, chargerState, Phase.VERIFY_CHARGER)
  }

  async patchConnectors (state, chargerState) {
    const connectorEvses = chargerState.charger.connectorEvses ?? []
    const patchedConnectorIds = new Set(chargerState.patchedConnectorIds ?? [])
    for (const connectorEvse of connectorEvses) {
      if (patchedConnectorIds.has(connectorEvse.connectorId)) {
        continue
      }
      await this.client.patchConnectorEvse(
        chargerState.charger.id,
        connectorEvse.connectorId,
        connectorEvse.payload
      )
      patchedConnectorIds.add(connectorEvse.connectorId)
      chargerState.patchedConnectorIds = [...patchedConnectorIds]
      this.persist(state, chargerState)
    }
    this.transition(state, chargerState, Phase.DELETE_CHARGER)
  }

  persist (state, chargerState) {
    chargerState.updatedAt = new Date(this.now()).toISOString()
    this.stateStore.save(state)
  }

  async pollDecommission (state, chargerState) {
    const startedAt = this.now()
    do {
      const profile = await this.client.getChargerProfile(chargerState.charger.id)
      if (profile == null) {
        throw new DeletionWorkflowError(
          `Charger ${chargerState.charger.id} profile is absent while decommission is pending`
        )
      }
      chargerState.lastProvisionStatus = profile.provisionStatus
      this.persist(state, chargerState)
      if (profile.provisionStatus === 'DECOMMISSIONED') {
        this.transition(state, chargerState, Phase.PATCH_CONNECTORS)
        return true
      }
      if (this.now() - startedAt >= this.pollTimeoutMs) {
        chargerState.lastError = {
          at: new Date(this.now()).toISOString(),
          message: `Timed out waiting for charger ${chargerState.charger.id} to become DECOMMISSIONED`,
        }
        this.persist(state, chargerState)
        return false
      }
      await this.sleep(this.pollIntervalMs)
    } while (true)
  }

  async preflight (state, chargerState) {
    const { id } = chargerState.charger
    const profile = await this.client.getChargerProfile(id)
    if (profile == null) {
      throw new DeletionWorkflowError(
        `Charger ${id} profile is absent before the deletion lifecycle started`
      )
    }

    const transactions = await this.client.filterEvTransactions(id)
    const reservations = await this.client.filterReservations(id)
    chargerState.preflight = {
      checkedAt: new Date(this.now()).toISOString(),
      provisionStatus: profile.provisionStatus,
      reservationsEmpty: isFilterEmpty(reservations),
      transactionsEmpty: isFilterEmpty(transactions),
    }
    if (!chargerState.preflight.transactionsEmpty || !chargerState.preflight.reservationsEmpty) {
      throw new DeletionWorkflowError(`Charger ${id} still has transactions or reservations`)
    }
    if (profile.provisionStatus === 'DECOMMISSIONED') {
      this.transition(state, chargerState, Phase.PATCH_CONNECTORS)
      return
    }
    this.transition(state, chargerState, Phase.DECOMMISSION)
  }

  async run () {
    const state = this.stateStore.load()
    for (const charger of this.chargers) {
      state.chargers[charger.id] ??= {
        attempts: 0,
        charger,
        phase: Phase.PREFLIGHT,
        updatedAt: new Date(this.now()).toISOString(),
      }
      const chargerState = state.chargers[charger.id]
      chargerState.charger = charger
      chargerState.attempts += 1
      chargerState.lastError = undefined
      this.persist(state, chargerState)
      try {
        await this.runCharger(state, chargerState)
      } catch (error) {
        chargerState.lastError = {
          at: new Date(this.now()).toISOString(),
          message: error instanceof Error ? error.message : String(error),
        }
        this.persist(state, chargerState)
      }
    }
    return state
  }

  async runCharger (state, chargerState) {
    while (chargerState.phase !== Phase.COMPLETE) {
      switch (chargerState.phase) {
        case Phase.CLEAN_PROPERTY:
          if (!(await this.cleanProperty(state, chargerState))) {
            return
          }
          break
        case Phase.CLEAN_SITE:
          if (!(await this.cleanSite(state, chargerState))) {
            return
          }
          break
        case Phase.DECOMMISSION:
          await this.startDecommission(state, chargerState)
          return
        case Phase.DELETE_CHARGER:
          await this.deleteCharger(state, chargerState)
          break
        case Phase.PATCH_CONNECTORS:
          await this.patchConnectors(state, chargerState)
          break
        case Phase.POLL_DECOMMISSION:
          if (!(await this.pollDecommission(state, chargerState))) {
            return
          }
          break
        case Phase.PREFLIGHT:
          await this.preflight(state, chargerState)
          break
        case Phase.VERIFY_CHARGER:
          if (!(await this.verifyChargerDeletion(state, chargerState))) {
            return
          }
          break
        case Phase.VERIFY_PROPERTY:
          if (!(await this.verifyPropertyDeletion(state, chargerState))) {
            return
          }
          break
        case Phase.VERIFY_SITE:
          if (!(await this.verifySiteDeletion(state, chargerState))) {
            return
          }
          break
        default:
          throw new DeletionWorkflowError(`Unknown deletion phase: ${chargerState.phase}`)
      }
    }
  }

  async startDecommission (state, chargerState) {
    if (chargerState.decommissionAttemptedAt != null) {
      const startedAt = this.now()
      do {
        const profile = await this.client.getChargerProfile(chargerState.charger.id)
        if (profile == null) {
          throw new DeletionWorkflowError(
            `Charger ${chargerState.charger.id} profile is absent while reconciling decommission`
          )
        }
        if (profile.provisionStatus === 'DECOMMISSIONED') {
          this.transition(state, chargerState, Phase.PATCH_CONNECTORS)
          return
        }
        if (profile.provisionStatus !== chargerState.preflight?.provisionStatus) {
          this.transition(state, chargerState, Phase.POLL_DECOMMISSION)
          return
        }
        if (this.now() - startedAt >= this.pollTimeoutMs) {
          break
        }
        await this.sleep(this.pollIntervalMs)
      } while (true)
    }
    const decommissionDate =
      chargerState.decommissionAttemptedAt ?? new Date(this.now()).toISOString()
    chargerState.decommissionAttemptedAt = decommissionDate
    this.persist(state, chargerState)
    await this.client.decommissionCharger(chargerState.charger.id, decommissionDate)
    chargerState.decommissionRequestedAt = decommissionDate
    this.transition(state, chargerState, Phase.POLL_DECOMMISSION)
  }

  transition (state, chargerState, phase) {
    chargerState.phase = phase
    chargerState.lastError = undefined
    this.persist(state, chargerState)
  }

  async verifyChargerDeletion (state, chargerState) {
    const profile = await this.client.getChargerProfile(chargerState.charger.id)
    if (profile != null) {
      chargerState.lastError = {
        at: new Date(this.now()).toISOString(),
        message: `Charger ${chargerState.charger.id} is still present after DELETE`,
      }
      this.persist(state, chargerState)
      return false
    }
    this.transition(state, chargerState, Phase.CLEAN_SITE)
    return true
  }

  async verifyPropertyDeletion (state, chargerState) {
    const property = await this.client.getProperty(chargerState.charger.propertyId)
    if (property != null) {
      chargerState.lastError = {
        at: new Date(this.now()).toISOString(),
        message: `Property ${chargerState.charger.propertyId} is still present after DELETE`,
      }
      this.persist(state, chargerState)
      return false
    }
    this.complete(state, chargerState, 'Charger and parent deletion completed')
    return true
  }

  async verifySiteDeletion (state, chargerState) {
    const site = await this.client.getSite(chargerState.charger.siteId)
    if (site != null) {
      chargerState.lastError = {
        at: new Date(this.now()).toISOString(),
        message: `Site ${chargerState.charger.siteId} is still present after DELETE`,
      }
      this.persist(state, chargerState)
      return false
    }
    this.transition(state, chargerState, Phase.CLEAN_PROPERTY)
    return true
  }
}

class FileWorkflowStateStore {
  constructor (filePath) {
    this.filePath = path.resolve(filePath)
  }

  load () {
    if (!fs.existsSync(this.filePath)) {
      return { chargers: {}, version: 1 }
    }
    const state = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
    if (state?.version !== 1 || state.chargers == null || typeof state.chargers !== 'object') {
      throw new DeletionWorkflowError(`Invalid workflow state in ${this.filePath}`)
    }
    return state
  }

  save (state) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.${process.pid.toString()}.tmp`
    fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
    fs.renameSync(temporaryPath, this.filePath)
  }
}

/**
 * Reads the explicit property sharing flag across supported response variants.
 * @param property - Property read-back payload.
 * @returns The sharing flag, or undefined when the API did not provide one.
 */
function getSharedFlag (property) {
  return property.isShared ?? property.shared ?? property.sharedProperty
}

/**
 * Determines whether a Driivz filter response contains no resources.
 * @param response - Filter endpoint response.
 * @returns Whether the response reports zero resources.
 */
function isFilterEmpty (response) {
  if (Array.isArray(response)) {
    return response.length === 0
  }
  if (response == null || typeof response !== 'object') {
    throw new DeletionWorkflowError('Driivz filter response has an unsupported shape')
  }
  for (const key of ['items', 'results', 'content', 'data']) {
    if (Array.isArray(response[key])) {
      return response[key].length === 0
    }
  }
  for (const key of ['count', 'total', 'totalCount', 'totalElements']) {
    if (Number.isInteger(response[key])) {
      return response[key] === 0
    }
  }
  throw new DeletionWorkflowError('Driivz filter response does not expose an item list or count')
}

/**
 * Creates and runs the deletion workflow from the script configuration.
 * @param root0 - Runtime dependencies and configuration location.
 * @param root0.configPath - Script configuration file path.
 * @param root0.fetchImplementation - HTTP implementation, injectable for tests.
 * @param root0.now - Clock implementation, injectable for tests.
 * @param root0.sleep - Delay implementation, injectable for tests.
 * @returns The persisted workflow state after this run.
 */
async function runFromConfig ({
  configPath = path.resolve('scriptConfig.json'),
  fetchImplementation = globalThis.fetch,
  now,
  sleep,
} = {}) {
  const rootConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const config = { ...DEFAULT_CONFIG, ...rootConfig.driivzDeletion }
  validateConfig(config)
  const configDirectory = path.dirname(configPath)
  const stateFile = path.resolve(configDirectory, config.stateFile)
  const workflow = new DriivzDeletionWorkflow({
    chargers: config.chargers,
    client: new DriivzClient({
      baseUrl: config.baseUrl,
      fetchImplementation,
      headers: config.headers,
    }),
    now,
    pollIntervalMs: config.pollIntervalMs,
    pollTimeoutMs: config.pollTimeoutMs,
    sleep,
    stateStore: new FileWorkflowStateStore(stateFile),
  })
  return workflow.run()
}

/**
 * Validates required deletion configuration.
 * @param config - Merged Driivz deletion configuration.
 */
function validateConfig (config) {
  if (typeof config.baseUrl !== 'string' || config.baseUrl.length === 0) {
    throw new DeletionWorkflowError('driivzDeletion.baseUrl is required')
  }
  if (!Array.isArray(config.chargers) || config.chargers.length === 0) {
    throw new DeletionWorkflowError('driivzDeletion.chargers must contain at least one charger')
  }
  for (const charger of config.chargers) {
    if (typeof charger.id !== 'string' || charger.id.length === 0) {
      throw new DeletionWorkflowError('Every configured charger must have an id')
    }
  }
}

if (require.main === module) {
  runFromConfig()
    .then(state => {
      const pending = Object.values(state.chargers).filter(({ phase }) => phase !== Phase.COMPLETE)
      console.info(
        pending.length === 0
          ? 'Driivz deletion workflow completed'
          : `Driivz deletion workflow has ${pending.length.toString()} pending charger(s)`
      )
      process.exitCode = pending.length === 0 ? 0 : 2
      return state
    })
    .catch(error => {
      console.error(error)
      process.exitCode = 1
    })
}

module.exports = {
  DEFAULT_CONFIG,
  DeletionWorkflowError,
  DriivzApiError,
  DriivzClient,
  DriivzDeletionWorkflow,
  FileWorkflowStateStore,
  isFilterEmpty,
  Phase,
  runFromConfig,
}
