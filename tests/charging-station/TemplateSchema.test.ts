/**
 * @file Tests for TemplateSchema
 * @description Unit tests for Zod template schema validation
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { CURRENT_SCHEMA_VERSION } from '../../src/charging-station/TemplateMigrations.js'
import { TemplateSchema } from '../../src/charging-station/TemplateSchema.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from './ChargingStationTestConstants.js'
import { buildMinimalTemplate } from './helpers/TemplateFixtures.js'

await describe('TemplateSchema', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('required fields', async () => {
    await it('should accept a minimal valid template with Connectors', () => {
      const result = TemplateSchema.safeParse(
        buildMinimalTemplate({
          Connectors: {
            0: {},
            1: { MeterValues: [] },
          },
        })
      )
      assert.ok(result.success)
      assert.strictEqual(result.data.baseName, TEST_CHARGING_STATION_BASE_NAME)
    })

    for (const requiredField of ['baseName', 'chargePointModel', 'chargePointVendor'] as const) {
      await it(`should reject missing ${requiredField}`, () => {
        const template = buildMinimalTemplate()
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete template[requiredField]
        const result = TemplateSchema.safeParse(template)
        assert.ok(!result.success)
        assert.ok(result.error.issues.some(i => i.path.includes(requiredField)))
      })
    }

    await it('should reject empty baseName', () => {
      const result = TemplateSchema.safeParse(buildMinimalTemplate({ baseName: '' }))
      assert.ok(!result.success)
    })
  })

  await describe('$schemaVersion', async () => {
    await it('should reject template missing $schemaVersion (post-migration schema is strict)', () => {
      const template = buildMinimalTemplate()

      delete template.$schemaVersion
      const result = TemplateSchema.safeParse(template)
      assert.ok(!result.success)
      assert.ok(result.error.issues.some(i => i.path.includes('$schemaVersion')))
    })

    await it('should accept explicit $schemaVersion equal to CURRENT_SCHEMA_VERSION', () => {
      const result = TemplateSchema.safeParse(buildMinimalTemplate())
      assert.ok(result.success)
      assert.strictEqual(result.data.$schemaVersion, CURRENT_SCHEMA_VERSION)
    })

    await it('should reject $schemaVersion not equal to CURRENT_SCHEMA_VERSION', () => {
      const result = TemplateSchema.safeParse(buildMinimalTemplate({ $schemaVersion: 0 }))
      assert.ok(!result.success)
      assert.ok(result.error.issues.some(i => i.path.includes('$schemaVersion')))
    })
  })

  await describe('deprecated keys rejection', async () => {
    for (const [legacyKey, legacyValue] of [
      ['supervisionUrl', 'ws://localhost:8080'],
      ['authorizationFile', 'tags.json'],
      ['mustAuthorizeAtRemoteStart', true],
      ['payloadSchemaValidation', false],
    ] as const) {
      await it(`should reject template containing legacy ${legacyKey} key`, () => {
        const result = TemplateSchema.safeParse(buildMinimalTemplate({ [legacyKey]: legacyValue }))
        assert.ok(!result.success)
        assert.ok(
          result.error.issues.some(
            i => i.path.includes(legacyKey) && i.message.includes('Deprecated')
          )
        )
      })
    }
  })

  await describe('typed sub-schemas', async () => {
    await it('should accept structured signedMeterValue with vendor extensions', () => {
      const result = TemplateSchema.safeParse(
        buildMinimalTemplate({
          Connectors: {
            0: {},
            1: {
              MeterValues: [
                {
                  signedMeterValue: {
                    encodingMethod: 'Other',
                    publicKey: 'pk',
                    signedMeterData: 'data',
                    signingMethod: 'Other',
                    vendorField: 'preserved',
                  },
                  unit: 'Wh',
                },
              ],
            },
          },
        })
      )
      assert.ok(result.success)
    })

    await it('should reject signedMeterValue with non-string encodingMethod', () => {
      const result = TemplateSchema.safeParse(
        buildMinimalTemplate({
          Connectors: {
            0: {},
            1: {
              MeterValues: [
                {
                  signedMeterValue: { encodingMethod: 42 },
                  unit: 'Wh',
                },
              ],
            },
          },
        })
      )
      assert.ok(!result.success)
    })

    await it('should accept structured wsOptions with known fields', () => {
      const result = TemplateSchema.safeParse(
        buildMinimalTemplate({
          wsOptions: {
            handshakeTimeout: 5000,
            headers: { 'X-Custom': 'value' },
            rejectUnauthorized: false,
          },
        })
      )
      assert.ok(result.success)
    })

    await it('should reject wsOptions with non-object headers', () => {
      const result = TemplateSchema.safeParse(
        buildMinimalTemplate({ wsOptions: { headers: 'not an object' } })
      )
      assert.ok(!result.success)
    })

    await it('should accept numeric wsOptions header value (Node OutgoingHttpHeader)', () => {
      const result = TemplateSchema.safeParse(
        buildMinimalTemplate({ wsOptions: { headers: { 'X-Forwarded-Port': 8080 } } })
      )
      assert.ok(result.success)
    })

    await it('should accept multi-value wsOptions header (string array)', () => {
      const result = TemplateSchema.safeParse(
        buildMinimalTemplate({
          wsOptions: { headers: { Accept: ['application/json', 'text/plain'] } },
        })
      )
      assert.ok(result.success)
    })

    await it('should reject wsOptions header array with non-string element', () => {
      const result = TemplateSchema.safeParse(
        buildMinimalTemplate({
          wsOptions: { headers: { Accept: ['application/json', 42] } },
        })
      )
      assert.ok(!result.success)
    })

    await it('should reject wsOptions header with empty field-name (RFC 9110 §5.1)', () => {
      const result = TemplateSchema.safeParse(
        buildMinimalTemplate({ wsOptions: { headers: { '': 'value' } } })
      )
      assert.ok(!result.success)
    })

    await it('should reject wsOptions header with boolean value', () => {
      const result = TemplateSchema.safeParse(
        buildMinimalTemplate({ wsOptions: { headers: { 'X-Foo': true } } })
      )
      assert.ok(!result.success)
    })
  })

  await describe('topology discrimination', async () => {
    await it('should reject template with both Connectors and Evses', () => {
      const result = TemplateSchema.safeParse(
        buildMinimalTemplate({
          Connectors: { 0: {} },
          Evses: { 0: { Connectors: { 0: {} } } },
        })
      )
      assert.ok(!result.success)
      assert.ok(result.error.issues.some(i => i.message.includes('Connectors OR Evses, not both')))
    })

    await it('should accept template with only Connectors', () => {
      const result = TemplateSchema.safeParse(
        buildMinimalTemplate({ Connectors: { 0: {}, 1: {} } })
      )
      assert.ok(result.success)
    })

    await it('should accept template with only Evses', () => {
      const result = TemplateSchema.safeParse(
        buildMinimalTemplate({
          Evses: {
            0: { Connectors: { 0: {} } },
            1: { Connectors: { 1: {} } },
          },
        })
      )
      assert.ok(result.success)
    })

    await it('should accept template with neither Connectors nor Evses', () => {
      const result = TemplateSchema.safeParse(buildMinimalTemplate())
      assert.ok(result.success)
    })
  })

  await describe('Evses validation (OCPP 2.0.1 §7.2)', async () => {
    await it('should reject EVSE 0 with non-zero connector id', () => {
      const result = TemplateSchema.safeParse(
        buildMinimalTemplate({ Evses: { 0: { Connectors: { 1: {} } } } })
      )
      assert.ok(!result.success)
      assert.ok(
        result.error.issues.some(i => i.message.includes('EVSE 0 has invalid connector id'))
      )
    })

    await it('should reject EVSE > 0 with connector id 0', () => {
      const result = TemplateSchema.safeParse(
        buildMinimalTemplate({ Evses: { 1: { Connectors: { 0: {} } } } })
      )
      assert.ok(!result.success)
      assert.ok(result.error.issues.some(i => i.message.includes('connector ids must start at 1')))
    })

    await it('should accept valid EVSE configuration', () => {
      const result = TemplateSchema.safeParse(
        buildMinimalTemplate({
          Evses: {
            0: { Connectors: { 0: {} } },
            1: { Connectors: { 1: {} } },
            2: { Connectors: { 2: {} } },
          },
        })
      )
      assert.ok(result.success)
    })
  })

  await describe('MeterValues normalization', async () => {
    await it('should accept string value in MeterValues', () => {
      const result = TemplateSchema.safeParse(
        buildMinimalTemplate({
          Connectors: {
            0: {},
            1: { MeterValues: [{ unit: 'Wh', value: '42' }] },
          },
        })
      )
      assert.ok(result.success)
      const mv = result.data.Connectors?.['1']?.MeterValues?.[0]
      assert.strictEqual(mv?.value, '42')
    })

    await it('should coerce number value to string in MeterValues', () => {
      const result = TemplateSchema.safeParse(
        buildMinimalTemplate({
          Connectors: {
            0: {},
            1: { MeterValues: [{ unit: 'Wh', value: 0 }] },
          },
        })
      )
      assert.ok(result.success)
      const mv = result.data.Connectors?.['1']?.MeterValues?.[0]
      assert.strictEqual(mv?.value, '0')
    })
  })

  await describe('looseObject behavior', async () => {
    await it('should tolerate unknown top-level keys', () => {
      const result = TemplateSchema.safeParse(
        buildMinimalTemplate({ unknownField: 'should be preserved' })
      )
      assert.ok(result.success)
      assert.strictEqual(
        (result.data as Record<string, unknown>).unknownField,
        'should be preserved'
      )
    })
  })

  await describe('connector key validation', async () => {
    await it('should accept numeric string keys in Connectors', () => {
      const result = TemplateSchema.safeParse(
        buildMinimalTemplate({ Connectors: { 0: {}, 1: {}, 2: {} } })
      )
      assert.ok(result.success)
    })

    await it('should reject non-numeric keys in Connectors', () => {
      const result = TemplateSchema.safeParse(buildMinimalTemplate({ Connectors: { abc: {} } }))
      assert.ok(!result.success)
    })
  })
})
