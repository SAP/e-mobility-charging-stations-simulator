/**
 * @file UI server component barrel.
 * @description Exposes concrete UI server implementations (`UIMCPServer`,
 *   `UIWebSocketServer`) selected through `UIServerFactory`, the transport-agnostic
 *   `HttpMethod` enum, the `DEFAULT_COMPRESSION_THRESHOLD_BYTES` canonical default,
 *   plus the `AbstractUIService` base class and its `BroadcastChannelResponseLogContext`
 *   type which are consumed as extension points across the broadcast-channel boundary.
 *
 *   Deliberately not re-exported:
 *   - `AbstractUIServer` — internal extension point subclassed only by the concrete
 *     servers within this sub-component; no external extenders exist.
 *   - `UIHttpServer` — `@deprecated` pending removal; re-exporting through a fresh
 *     barrel would surface the deprecation on every consumer via
 *     `@typescript-eslint/no-deprecated`.
 *   - `UIServerAccessPolicy` / `UIServerNet` / `UIServerSecurity` helpers beyond
 *     `DEFAULT_COMPRESSION_THRESHOLD_BYTES` — internal to `UIServerFactory` and
 *     the concrete servers.
 *   - `ui-services/UIService001` / `ui-services/UIServiceFactory` concrete
 *     implementations — internal to `AbstractUIService`.
 */
export {
  AbstractUIService,
  type BroadcastChannelResponseLogContext,
} from './ui-services/AbstractUIService.js'
export { UIMCPServer } from './UIMCPServer.js'
export { UIServerFactory } from './UIServerFactory.js'
export { DEFAULT_COMPRESSION_THRESHOLD_BYTES } from './UIServerSecurity.js'
export { HttpMethod } from './UIServerUtils.js'
export { UIWebSocketServer } from './UIWebSocketServer.js'
