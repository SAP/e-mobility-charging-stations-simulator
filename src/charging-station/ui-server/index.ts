/**
 * @file UI server component barrel.
 * @description Exposes concrete UI server implementations (`UIMCPServer`,
 *   `UIWebSocketServer`) selected through `UIServerFactory`, the transport-agnostic
 *   `HttpMethod` enum, the `DEFAULT_COMPRESSION_THRESHOLD_BYTES` canonical default,
 *   plus the `AbstractUIService` base class and its `BroadcastChannelResponseLogContext`
 *   type which are consumed as extension points across the broadcast-channel boundary.
 *   `AbstractUIServer` is re-exported as a type-only symbol for external consumers
 *   (`Bootstrap`) that hold a reference to the selected concrete server without
 *   subclassing it.
 *
 *   Deliberately not re-exported:
 *   - `UIHttpServer` — `@deprecated` pending removal; re-exporting through a fresh
 *     barrel would surface the deprecation on every consumer via
 *     `@typescript-eslint/no-deprecated`.
 *   - `UIServerAccessPolicy` — internal to the concrete servers.
 *   - `UIServerNet` (`splitHeaderList` / `splitQuoted`) — HTTP-header parsing
 *     internals used by `UIServerAccessPolicy` only. Host-parsing helpers that
 *     were previously here (`isLoopback`, `normalizeHost`, `normalizeIPAddress`,
 *     `isHostLiteralWithoutPort`, `LOOPBACK_HOSTNAME`) now live in
 *     `src/utils/HostUtils.ts` and are re-exported through `src/utils/index.ts`.
 *   - `UIServerSecurity` (`DEFAULT_MAX_PAYLOAD_SIZE_BYTES`, `PayloadTooLargeError`,
 *     `readLimitedBody`) — request-body handling internals consumed by the
 *     concrete servers only; `DEFAULT_COMPRESSION_THRESHOLD_BYTES` is the sole
 *     canonical default surfaced through this barrel.
 *   - `UIServerUtils` (`isProtocolAndVersionSupported`, protocol-negotiation
 *     helpers) — WebSocket protocol handshake internals consumed by
 *     `UIWebSocketServer` and `UIHttpServer` only; `HttpMethod` is the sole
 *     transport-agnostic enum surfaced through this barrel.
 *   - `ui-services/UIService001` / `ui-services/UIServiceFactory` concrete
 *     implementations — internal to `AbstractUIService`.
 */
export type { AbstractUIServer } from './AbstractUIServer.js'
export {
  AbstractUIService,
  type BroadcastChannelResponseLogContext,
} from './ui-services/AbstractUIService.js'
export { UIMCPServer } from './UIMCPServer.js'
export { UIServerFactory } from './UIServerFactory.js'
export { DEFAULT_COMPRESSION_THRESHOLD_BYTES } from './UIServerSecurity.js'
export { HttpMethod } from './UIServerUtils.js'
export { UIWebSocketServer } from './UIWebSocketServer.js'
