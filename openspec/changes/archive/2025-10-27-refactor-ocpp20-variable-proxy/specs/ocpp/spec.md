## ADDED Requirements

### Requirement: Transient Runtime Overrides Reset

The simulator SHALL treat non-persistent runtime variable overrides (e.g., SampledDataCtrlr.TxUpdatedInterval, ClockCtrlr.DateTime computed value) as transient and clear them via `resetRuntimeVariables()` (alias `resetRuntimeOverrides()`) to simulate reboot/reset lifecycle; persistent configuration-backed variables retain values across resets.

#### Scenario: Runtime override cleared on reset

- **WHEN** a runtime override (non-persistent variable) is set
- **AND** `resetRuntimeVariables()` is invoked (or a simulated reboot occurs)
- **THEN** a subsequent GetVariables for that variable SHALL return its default or freshly computed value instead of the overridden value

#### Scenario: Persistent variable retained on reset

- **WHEN** a persistent variable is updated and a reset occurs
- **THEN** a subsequent GetVariables for that variable SHALL return the updated persisted value

## MODIFIED Requirements

### Requirement: Centralized Validation Logic

The simulator SHALL perform all variable validation, mutability enforcement, persistence decisions, and effective value resolution for OCPP SetVariables and GetVariables by delegating to existing configuration helper modules (ChargingStationConfigurationUtils, ConfigurationKeyUtils). The OCPP20VariableManager SHALL NOT implement independent persistence, mutability, or value validation logic; it SHALL ONLY translate between OCPP component/variable identifiers and internal configuration keys and assemble OCPP-compliant response objects. No new abstraction layer SHALL be introduced; the refactor removes duplicated logic. The manager SHALL store no persistent state; only request-scoped transient data is permitted.

#### Scenario: Proxy delegation for SetVariables

- **WHEN** processing a SetVariables request item
- **THEN** the manager SHALL call a centralized helper to validate and persist the new value and SHALL NOT implement separate persistence logic

#### Scenario: Proxy delegation for GetVariables

- **WHEN** processing a GetVariables request item for a supported variable
- **THEN** the manager SHALL retrieve current value and mutability status via a centralized helper

#### Scenario: Eliminate duplicate persistence

- **WHEN** persistence is required for a variable
- **THEN** only configuration helpers SHALL write/read persistent storage; OCPP layer stores no copies

#### Scenario: Reset statusInfo usage

- **WHEN** sending a ResetResponse with status Accepted or Scheduled
- **THEN** the response MAY omit `statusInfo` entirely and SHALL NOT include a `reasonCode` like `NoError` solely to signal success
- **AND** if `statusInfo` is present for non-error scheduling context, it SHALL use standardized or approved vendor codes (not `NoError`) and SHOULD include contextual `additionalInfo`

#### Scenario: Strict OCPP reasonCode set

- **WHEN** building SetVariableResult or GetVariableResult attributeStatusInfo.reasonCode
- **THEN** only standardized OCPP 2.0.1 codes SHALL be used (NotFound, UnsupportedParam, PropertyConstraintViolation, ImmutableVariable, ChangeRequiresReboot, InternalError) unless a future spec delta adds approved vendor-specific codes
- **AND** Accepted results SHALL omit attributeStatusInfo entirely (no success reasonCode)
- **AND** WriteOnly GetVariables attempts SHALL map to reasonCode UnsupportedParam with attributeStatus Rejected (uniform unsupported semantics)
- **AND** Numeric value errors (zero, negative, non-integer) and invalid URL formats SHALL all map to PropertyConstraintViolation with contextual additionalInfo

#### Scenario: Legacy reasonCode mapping removal

- **WHEN** legacy codes would have applied
- **THEN** they SHALL be replaced as follows:
  - WriteOnly -> UnsupportedParam (GetVariables only)
  - ValueZeroNotAllowed -> PropertyConstraintViolation
  - ValuePositiveOnly -> PropertyConstraintViolation
  - InvalidURL -> PropertyConstraintViolation
  - NoError (Accepted) -> attributeStatusInfo omitted
- **AND** unit tests SHALL assert absence or remapped standardized codes instead of legacy ones
- **AND** future extended codes SHALL require a separate OpenSpec change proposal adding them to the approved list

#### Scenario: Validation reuse

- **WHEN** a variable value requires format or range checks
- **THEN** existing configuration helper validation routines SHALL be reused; the proxy SHALL NOT implement bespoke parsing or range logic

#### Scenario: Mapping consistency check

- **WHEN** the simulator starts
- **THEN** a self-check SHALL verify every declared OCPP variable maps to an existing configuration key; failures SHALL log an error and set variable status InternalError for affected variables

#### Scenario: Extended validation step

- **WHEN** the change is validated prior to review
- **THEN** validation SHALL include: successful OpenSpec strict validation, passing code lint (`pnpm lint`), passing formatting (`pnpm format` leaves no changes), all OCPP 2.0.1 spec compliance unit tests green, and added delegation unit tests proving no duplicated persistence logic

### Requirement: GetVariables WriteOnly Enforcement

GetVariables attempts to retrieve any WriteOnly variable SHALL return attributeStatus Rejected with standardized reasonCode UnsupportedParam (legacy WriteOnly code removed) and SHALL NOT include attributeValue.

#### Scenario: WriteOnly variable get rejection (standardized)

- **WHEN** GetVariables attempts to retrieve a WriteOnly variable
- **THEN** the response SHALL include attributeStatus Rejected with attributeStatusInfo.reasonCode UnsupportedParam and SHALL NOT include attributeValue

### Requirement: New Standard & Vendor Variables

The simulator SHALL support standard and vendor variable definitions with explicit mutability, persistence and validation rules using only standardized OCPP reason codes (legacy custom codes removed).

#### Scenario: DateTime retrieval (ClockCtrlr.DateTime)

- **WHEN** a GetVariables request is made for component ClockCtrlr and variable DateTime
- **THEN** the response SHALL return attributeStatus Accepted with the current system time in RFC3339 UTC format as attributeValue; attributeStatusInfo omitted for success

#### Scenario: DateTime immutability

- **WHEN** a SetVariables request attempts to modify ClockCtrlr.DateTime
- **THEN** the response SHALL include status Rejected with attributeStatusInfo.reasonCode ImmutableVariable

#### Scenario: TxUpdatedInterval validation

- **WHEN** a SetVariables request sets TxUpdatedInterval to a value <= 0, negative, or non-integer
- **THEN** the response SHALL include status Rejected with attributeStatusInfo.reasonCode PropertyConstraintViolation and additionalInfo describing the constraint (e.g., 'Must be positive integer > 0')
- **WHEN** a valid positive integer value is provided
- **THEN** the response SHALL include status Accepted and value SHALL be stored as non-persistent (reverts after station restart) with attributeStatusInfo omitted

#### Scenario: TxUpdatedInterval non-persistent reversion

- **WHEN** the simulator restarts after TxUpdatedInterval was set
- **THEN** a subsequent GetVariables for SampledDataCtrlr.TxUpdatedInterval SHALL return the default baseline value

#### Scenario: ConnectionUrl mutability (ChargingStation.ConnectionUrl vendor variable)

- **WHEN** a SetVariables request sets ConnectionUrl with a valid absolute URL using ws, wss, http or https scheme
- **THEN** the response SHALL include status Accepted (attributeStatusInfo omitted) and the value SHALL persist across restarts
- **WHEN** the URL is invalid (missing scheme, unsupported scheme, malformed)
- **THEN** the response SHALL include status Rejected with reasonCode PropertyConstraintViolation and additionalInfo summarizing the issue

#### Scenario: ConnectionUrl write-only access

- **WHEN** a GetVariables request is made for ChargingStation.ConnectionUrl
- **THEN** the response SHALL include attributeStatus Rejected with attributeStatusInfo.reasonCode UnsupportedParam (legacy WriteOnly code removed) and SHALL NOT include attributeValue

## REMOVED Requirements

### Requirement: Result Construction & Reason Codes (Legacy Extended reason codes)

**Reason**: Legacy custom reason codes (WriteOnly, ValueZeroNotAllowed, ValuePositiveOnly, InvalidURL, NoError) replaced by standardized OCPP 2.0.1 codes or omission of attributeStatusInfo for success to reduce divergence and simplify mapping logic.
**Migration**: Update any code/tests referencing removed legacy codes to use PropertyConstraintViolation or UnsupportedParam as specified; remove assumptions about "NoError" success tagging. No API schema changes required beyond reasonCode value normalization.
