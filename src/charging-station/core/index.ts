// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file Charging station core barrel — acyclic public API surface.
 * @description Acyclic subset of the `charging-station` public API consumed by
 * the `ocpp/` component: configuration-key helpers, connector/reservation
 * utilities and the bounded transaction-event queue. It re-exports neither
 * `AutomaticTransactionGenerator` nor the `ChargingStation` class value (both
 * depend transitively on `ocpp/`), so `ocpp/` imports these helpers from this
 * barrel instead of `charging-station/index.js`, breaking the circular
 * dependency `ocpp/ → charging-station/index.js → AutomaticTransactionGenerator
 * → ocpp/`. The top-level `charging-station/index.js` re-exports this module,
 * so the `charging-station` public API is unchanged.
 */

export {
  addConfigurationKey,
  buildConfigKey,
  deleteConfigurationKey,
  getConfigurationKey,
  setConfigurationKeyValue,
} from '../ConfigurationKeyUtils.js'
export {
  canProceedChargingProfile,
  checkChargingStationState,
  checkConfiguration,
  checkStationInfoConnectorStatus,
  getBootConnectorStatus,
  getChargingStationId,
  getConnectorChargingProfiles,
  getHashId,
  getIdTagsFile,
  getMaxConfiguredNumberOfConnectors,
  getMaxNumberOfEvses,
  getPhaseRotationValue,
  hasFeatureProfile,
  hasPendingReservation,
  hasPendingReservations,
  hasReservationExpired,
  pickConfiguredNumberOfConnectors,
  prepareChargingProfileKind,
  removeExpiredReservations,
  resetAuthorizeConnectorStatus,
  resetConnectorStatus,
  setChargingStationOptions,
  validateStationInfo,
} from '../Helpers.js'
export {
  boundTransactionEventQueue,
  clearTransactionEventQueueInFlight,
  enqueueBoundedTransactionEvent,
  getMutableSignedMeterValue,
  getRawSignedMeterValuePublicKey,
  getTransactionEventQueueBytes,
  hasQueuedEndedTransactionEvent,
  invalidateTransactionEventQueueAccounting,
  isTransactionEventQueueBlocked,
  isTransactionEventQueueStaged,
  markTransactionEventQueueDeliveryAttempted,
  queuedTransactionEventHasPublicKey,
  removeBoundedTransactionEvent,
  resetTransactionEventQueueRuntimeState,
  restoreRejectedTransactionEventIntervalCarry,
  setTransactionEventQueueBlocked,
  setTransactionEventQueueInFlight,
  setTransactionEventQueueStaged,
  shiftBoundedTransactionEvent,
  transferDiscardedTransactionEventIntervalEnergy,
} from '../TransactionEventQueueUtils.js'
