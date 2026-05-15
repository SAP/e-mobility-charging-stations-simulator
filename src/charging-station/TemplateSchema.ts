import { z } from 'zod'

// ---------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------

/**
 * SampledValueTemplate — MeterValues entries in connectors.
 * Accepts both string and number for `value` and normalizes to string,
 * covering the type mismatch in templates like `evlink` (`"value": 0`). // cspell:ignore evlink
 */
const SampledValueTemplateSchema = z.looseObject({
  context: z.string().optional(),
  fluctuationPercent: z.number().optional(),
  format: z.string().optional(),
  location: z.string().optional(),
  measurand: z.string().optional(),
  minimumValue: z.number().optional(),
  phase: z.string().optional(),
  signedMeterValue: z.looseObject({}).optional(),
  unit: z.string().optional(),
  unitOfMeasure: z.looseObject({}).optional(),
  value: z.union([z.string(), z.number()]).pipe(z.coerce.string()).optional(),
})

/**
 * ConnectorStatus — individual connector configuration within a template.
 * Uses looseObject to tolerate runtime-only fields added by the simulator.
 */
const ConnectorStatusSchema = z.looseObject({
  bootStatus: z.string().optional(),
  maximumPower: z.number().optional(),
  MeterValues: z.array(SampledValueTemplateSchema).optional(),
})

/**
 * EvseTemplate — EVSE entry containing its connectors.
 */
const EvseTemplateSchema = z.looseObject({
  Connectors: z.record(z.string().regex(/^\d+$/), ConnectorStatusSchema),
  MeterValues: z.array(SampledValueTemplateSchema).optional(),
})

/**
 * ConfigurationKey — OCPP configuration key entry.
 * `key` is z.string() (open set: vendor-specific and OCPP 2.0 namespaced keys are valid).
 */
const ConfigurationKeySchema = z.looseObject({
  key: z.string(),
  readonly: z.boolean(),
  reboot: z.boolean().optional(),
  value: z.string().optional(),
  visible: z.boolean().optional(),
})

/**
 * ChargingStationOcppConfiguration — the Configuration section.
 */
const OcppConfigurationSchema = z.looseObject({
  configurationKey: z.array(ConfigurationKeySchema).optional(),
})

/**
 * AutomaticTransactionGeneratorConfiguration — ATG section.
 * `stopAbsoluteDuration` is typed as required in the interface but absent from all templates,
 * so it is optional in the schema (templates omit it; the runtime provides the default).
 */
const AutomaticTransactionGeneratorSchema = z.looseObject({
  enable: z.boolean(),
  idTagDistribution: z.string().optional(),
  maxDelayBetweenTwoTransactions: z.number(),
  maxDuration: z.number(),
  minDelayBetweenTwoTransactions: z.number(),
  minDuration: z.number(),
  probabilityOfStart: z.number(),
  requireAuthorize: z.boolean().optional(),
  stopAbsoluteDuration: z.boolean().optional(),
  stopAfterHours: z.number(),
})

/**
 * FirmwareUpgrade sub-schema.
 */
const FirmwareUpgradeSchema = z.looseObject({
  failureStatus: z.string().optional(),
  reset: z.boolean().optional(),
  versionUpgrade: z
    .looseObject({
      patternGroup: z.number().optional(),
      step: z.number().optional(),
    })
    .optional(),
})

/**
 * CommandsSupport sub-schema.
 */
const CommandsSupportSchema = z.looseObject({
  incomingCommands: z.record(z.string(), z.boolean()),
  outgoingCommands: z.record(z.string(), z.boolean()).optional(),
})

// ---------------------------------------------------------------
// Connectors vs Evses topology variants
// ---------------------------------------------------------------

const ConnectorsVariant = z.looseObject({
  Connectors: z.record(z.string().regex(/^\d+$/), ConnectorStatusSchema),
})

const EvsesVariant = z.looseObject({
  Evses: z.record(z.string().regex(/^\d+$/), EvseTemplateSchema),
})

// ---------------------------------------------------------------
// Main template schema (loose — tolerates unknown keys)
// ---------------------------------------------------------------

const BaseTemplateSchema = z.looseObject({
  $schemaVersion: z.number().int().min(1).default(1),
  amperageLimitationOcppKey: z.string().optional(),
  amperageLimitationUnit: z.string().optional(),
  AutomaticTransactionGenerator: AutomaticTransactionGeneratorSchema.optional(),
  automaticTransactionGeneratorPersistentConfiguration: z.boolean().optional(),
  autoReconnectMaxRetries: z.number().optional(),
  autoRegister: z.boolean().optional(),
  autoStart: z.boolean().optional(),
  baseName: z.string().min(1),
  beginEndMeterValues: z.boolean().optional(),
  chargeBoxSerialNumberPrefix: z.string().optional(),
  chargePointModel: z.string().min(1),
  chargePointSerialNumberPrefix: z.string().optional(),
  chargePointVendor: z.string().min(1),
  commandsSupport: CommandsSupportSchema.optional(),
  Configuration: OcppConfigurationSchema.optional(),
  Connectors: z.record(z.string().regex(/^\d+$/), ConnectorStatusSchema).optional(),
  currentOutType: z.string().optional(),
  customValueLimitationMeterValues: z.boolean().optional(),
  enableStatistics: z.boolean().optional(),
  Evses: z.record(z.string().regex(/^\d+$/), EvseTemplateSchema).optional(),
  firmwareUpgrade: FirmwareUpgradeSchema.optional(),
  firmwareVersion: z.string().optional(),
  firmwareVersionPattern: z.string().optional(),
  fixedName: z.boolean().optional(),
  iccid: z.string().optional(),
  idTagsFile: z.string().optional(),
  imsi: z.string().optional(),
  mainVoltageMeterValues: z.boolean().optional(),
  messageTriggerSupport: z.record(z.string(), z.boolean()).optional(),
  meteringPerTransaction: z.boolean().optional(),
  meterSerialNumberPrefix: z.string().optional(),
  meterType: z.string().optional(),
  mustAuthorizeAtRemoteStart: z.boolean().optional(),
  nameSuffix: z.string().optional(),
  numberOfConnectors: z.union([z.number(), z.array(z.number())]).optional(),
  numberOfPhases: z.number().optional(),
  ocppPersistentConfiguration: z.boolean().optional(),
  ocppProtocol: z.string().optional(),
  ocppStrictCompliance: z.boolean().optional(),
  ocppVersion: z.string().optional(),
  outOfOrderEndMeterValues: z.boolean().optional(),
  payloadSchemaValidation: z.boolean().optional(),
  phaseLineToLineVoltageMeterValues: z.boolean().optional(),
  postTransactionDelay: z.number().optional(),
  power: z.union([z.number(), z.array(z.number())]).optional(),
  powerSharedByConnectors: z.boolean().optional(),
  powerUnit: z.string().optional(),
  randomConnectors: z.boolean().optional(),
  reconnectExponentialDelay: z.boolean().optional(),
  registrationMaxRetries: z.number().optional(),
  remoteAuthorization: z.boolean().optional(),
  resetTime: z.number().optional(),
  stationInfoPersistentConfiguration: z.boolean().optional(),
  stopTransactionsOnStopped: z.boolean().optional(),
  supervisionPassword: z.string().optional(),
  supervisionUrlOcppConfiguration: z.boolean().optional(),
  supervisionUrlOcppKey: z.string().optional(),
  supervisionUrls: z.union([z.string(), z.array(z.string())]).optional(),
  supervisionUser: z.string().optional(),
  templateHash: z.string().optional(),
  transactionDataMeterValues: z.boolean().optional(),
  useConnectorId0: z.boolean().optional(),
  voltageOut: z.number().optional(),
  wsOptions: z.looseObject({}).optional(),
  x509Certificates: z.record(z.string(), z.string()).optional(),
})

/**
 * TemplateSchema — validates that the template has valid structure and
 * defines either Connectors OR Evses (not both, not neither).
 */
export const TemplateSchema = BaseTemplateSchema.superRefine((template, ctx) => {
  const hasConnectors = template.Connectors != null
  const hasEvses = template.Evses != null
  if (hasConnectors && hasEvses) {
    ctx.addIssue({
      code: 'custom',
      message: 'Template must define Connectors OR Evses, not both',
      path: ['Connectors'],
    })
  }
  // Validate Evses topology (OCPP 2.0.1 §7.2 constraints)
  if (hasEvses && template.Evses != null) {
    for (const evseKey in template.Evses) {
      const evseId = Number(evseKey)
      const connectorIds = Object.keys(template.Evses[evseKey].Connectors).map(Number)
      if (evseId === 0) {
        for (const connectorId of connectorIds) {
          if (connectorId !== 0) {
            ctx.addIssue({
              code: 'custom',
              message: `EVSE 0 has invalid connector id ${connectorId.toString()}, only connector id 0 is allowed (OCPP 2.0.1 §7.2)`,
              path: ['Evses', evseKey, 'Connectors', connectorId.toString()],
            })
          }
        }
      } else if (evseId > 0) {
        for (const connectorId of connectorIds) {
          if (connectorId < 1) {
            ctx.addIssue({
              code: 'custom',
              message: `EVSE ${evseId.toString()} has invalid connector id ${connectorId.toString()}, connector ids must start at 1 (OCPP 2.0.1 §7.2)`,
              path: ['Evses', evseKey, 'Connectors', connectorId.toString()],
            })
          }
        }
      }
    }
  }
})

/**
 * StrictTemplateSchema — rejects unknown keys. For CI strict mode.
 */
export const StrictTemplateSchema = BaseTemplateSchema.strict()

// ---------------------------------------------------------------
// Exported sub-schemas for reuse
// ---------------------------------------------------------------
export { ConnectorsVariant, EvsesVariant }
