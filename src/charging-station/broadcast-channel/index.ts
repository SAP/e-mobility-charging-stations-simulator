/**
 * @file Broadcast channel component barrel.
 * @description Exposes the two concrete `WorkerBroadcastChannel` subclasses used for
 *   main-thread ↔ worker-thread OCPP message routing.
 *
 *   Deliberately not re-exported:
 *   - `WorkerBroadcastChannel` — abstract base subclassed only by the two concrete
 *     channels within this sub-component; no external extenders exist.
 */
export { ChargingStationWorkerBroadcastChannel } from './ChargingStationWorkerBroadcastChannel.js'
export { UIServiceWorkerBroadcastChannel } from './UIServiceWorkerBroadcastChannel.js'
