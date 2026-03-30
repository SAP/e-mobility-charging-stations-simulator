/**
 * Testable interface for OCPP20VariableManager
 *
 * This module provides type-safe access to private methods for testing purposes.
 * It replaces `as any` casts with a properly typed interface, enabling:
 * - Type-safe method invocations in tests
 * - IntelliSense and autocompletion for handler parameters/returns
 * - Compile-time checking for test code
 * @example
 * ```typescript
 * import { createTestableVariableManager } from './__testable__/OCPP20VariableManagerTestable.js'
 *
 * const testable = createTestableVariableManager(OCPP20VariableManager.getInstance())
 * const isValid = testable.isComponentValid(mockChargingStation, component)
 * ```
 */

import type { ComponentType, VariableType } from '../../../../types/index.js'
import type { ChargingStation } from '../../../index.js'
import type { OCPP20VariableManager } from '../OCPP20VariableManager.js'

/**
 * Interface exposing private methods of OCPP20VariableManager for testing.
 * Each method signature matches the corresponding private method in the class.
 */
export interface TestableOCPP20VariableManager {
  /**
   * Validates whether a component is supported by the charging station.
   * @param chargingStation - The charging station instance
   * @param component - The component to validate
   * @returns true if the component is valid/supported
   */
  isComponentValid: (chargingStation: ChargingStation, component: ComponentType) => boolean

  /**
   * Checks whether a variable is supported for the given component.
   * @param component - The component containing the variable
   * @param variable - The variable to check
   * @returns true if the variable is supported
   */
  isVariableSupported: (component: ComponentType, variable: VariableType) => boolean
}

/**
 * Creates a testable wrapper around OCPP20VariableManager.
 * Provides type-safe access to private methods without `as any` casts.
 * @param manager - The OCPP20VariableManager instance to wrap
 * @returns A typed interface exposing private methods
 * @example
 * ```typescript
 * // Before (with as any cast):
 * const isValid = (manager as any).isComponentValid(station, component)
 *
 * // After (with testable interface):
 * const testable = createTestableVariableManager(manager)
 * const isValid = testable.isComponentValid(station, component)
 * ```
 */
export function createTestableVariableManager (
  manager: OCPP20VariableManager
): TestableOCPP20VariableManager {
  // Cast to unknown first to satisfy TypeScript while preserving runtime behavior
  const managerImpl = manager as unknown as TestableOCPP20VariableManager

  return {
    isComponentValid: managerImpl.isComponentValid.bind(manager),
    isVariableSupported: managerImpl.isVariableSupported.bind(manager),
  }
}
