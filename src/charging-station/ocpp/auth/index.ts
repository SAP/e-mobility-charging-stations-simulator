/**
 * OCPP Authentication System
 *
 * Unified authentication layer for OCPP 1.6 and 2.0 protocols.
 * This module provides a consistent API for handling authentication
 * across different OCPP versions, with support for multiple authentication
 * strategies including local lists, remote authorization, and certificate-based auth.
 * @module ocpp/auth
 */

// ============================================================================
// Interfaces
// ============================================================================

export { OCPP16AuthAdapter } from './adapters/OCPP16AuthAdapter.js'

// ============================================================================
// Types & Enums
// ============================================================================

export { OCPP20AuthAdapter } from './adapters/OCPP20AuthAdapter.js'

// ============================================================================
// Type Guards & Mappers (Pure Functions)
// ============================================================================

export type {
  AuthCache,
  AuthComponentFactory,
  AuthStats,
  AuthStrategy,
  CacheStats,
  CertificateAuthProvider,
  CertificateInfo,
  LocalAuthEntry,
  LocalAuthListManager,
  OCPPAuthAdapter,
  OCPPAuthService,
} from './interfaces/OCPPAuthService.js'

// ============================================================================
// Adapters
// ============================================================================

export { OCPPAuthServiceFactory } from './services/OCPPAuthServiceFactory.js'
export { OCPPAuthServiceImpl } from './services/OCPPAuthServiceImpl.js'

// ============================================================================
// Strategies
// ============================================================================

export { CertificateAuthStrategy } from './strategies/CertificateAuthStrategy.js'
export { LocalAuthStrategy } from './strategies/LocalAuthStrategy.js'
export { RemoteAuthStrategy } from './strategies/RemoteAuthStrategy.js'

// ============================================================================
// Services
// ============================================================================

export {
  type AuthConfiguration,
  AuthContext,
  AuthenticationError,
  AuthenticationMethod,
  AuthErrorCode,
  type AuthorizationResult,
  AuthorizationStatus,
  type AuthRequest,
  type CertificateHashData,
  IdentifierType,
  type UnifiedIdentifier,
} from './types/AuthTypes.js'
export {
  isCertificateBased,
  isOCPP16Type,
  isOCPP20Type,
  mapOCPP16Status,
  mapOCPP20TokenType,
  mapToOCPP16Status,
  mapToOCPP20Status,
  mapToOCPP20TokenType,
  requiresAdditionalInfo,
} from './types/AuthTypes.js'

// ============================================================================
// Utils
// ============================================================================

export * from './utils/index.js'
