/**
 * @file Tests for OCPP 2.0 VariableMetadata predicates
 * @description Unit tests for the isPersistent/isVolatile/isReadOnly/isWriteOnly
 * predicates consumed by OCPP20VariableManager.
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  isPersistent,
  isReadOnly,
  isVolatile,
  isWriteOnly,
  type VariableMetadata,
} from '../../../../src/charging-station/ocpp/2.0/OCPP20VariableRegistry.js'
import { MutabilityEnumType, PersistenceEnumType } from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'

const buildMetadata = (
  mutability: MutabilityEnumType,
  persistence: PersistenceEnumType
): VariableMetadata => ({ mutability, persistence }) as unknown as VariableMetadata

await describe('OCPP20VariableRegistry metadata predicates', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await it('should detect persistent versus volatile persistence', () => {
    assert.strictEqual(
      isPersistent(buildMetadata(MutabilityEnumType.ReadWrite, PersistenceEnumType.Persistent)),
      true
    )
    assert.strictEqual(
      isPersistent(buildMetadata(MutabilityEnumType.ReadWrite, PersistenceEnumType.Volatile)),
      false
    )
    assert.strictEqual(
      isVolatile(buildMetadata(MutabilityEnumType.ReadWrite, PersistenceEnumType.Volatile)),
      true
    )
    assert.strictEqual(
      isVolatile(buildMetadata(MutabilityEnumType.ReadWrite, PersistenceEnumType.Persistent)),
      false
    )
  })

  await it('should detect read-only and write-only mutability', () => {
    assert.strictEqual(
      isReadOnly(buildMetadata(MutabilityEnumType.ReadOnly, PersistenceEnumType.Persistent)),
      true
    )
    assert.strictEqual(
      isReadOnly(buildMetadata(MutabilityEnumType.ReadWrite, PersistenceEnumType.Persistent)),
      false
    )
    assert.strictEqual(
      isReadOnly(buildMetadata(MutabilityEnumType.WriteOnly, PersistenceEnumType.Persistent)),
      false
    )
    assert.strictEqual(
      isWriteOnly(buildMetadata(MutabilityEnumType.WriteOnly, PersistenceEnumType.Persistent)),
      true
    )
    assert.strictEqual(
      isWriteOnly(buildMetadata(MutabilityEnumType.ReadOnly, PersistenceEnumType.Persistent)),
      false
    )
    assert.strictEqual(
      isWriteOnly(buildMetadata(MutabilityEnumType.ReadWrite, PersistenceEnumType.Persistent)),
      false
    )
  })
})
