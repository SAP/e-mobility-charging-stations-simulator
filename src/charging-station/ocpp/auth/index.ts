/**
 * OCPP Authentication System
 *
 * Authentication layer for OCPP 1.6 and 2.0 protocols.
 * This module provides a consistent API for handling authentication
 * across different OCPP versions, with support for multiple authentication
 * strategies including local lists, remote authorization, and certificate-based auth.
 * @module ocpp/auth
 */

export {
  type DifferentialAuthEntry,
  InMemoryLocalAuthListManager,
} from './cache/InMemoryLocalAuthListManager.js'
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
export { OCPPAuthServiceFactory } from './services/OCPPAuthServiceFactory.js'
export { OCPPAuthServiceImpl } from './services/OCPPAuthServiceImpl.js'
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
  type Identifier,
  IdentifierType,
  isCertificateBased,
  isOCPP16Type,
  isOCPP20Type,
  mapOCPP16Status,
  mapOCPP20AuthorizationStatus,
  mapOCPP20TokenType,
  mapToOCPP16Status,
  mapToOCPP20Status,
  mapToOCPP20TokenType,
  requiresAdditionalInfo,
} from './types/AuthTypes.js'
