## ADDED Requirements

### Requirement: EVSE-Level AuthorizeRemoteStart Support

The simulator SHALL support AuthorizeRemoteStart variable resolution at EVSE scope consistent with station and connector scopes, employing unified runtime override handling and standardized OCPP 2.0.1 reason codes (success responses omit attributeStatusInfo).

#### Scenario: EVSE GetVariables Accepted

- **WHEN** a GetVariables request targets component SampledDataCtrlr (or appropriate component mapping) and variable AuthorizeRemoteStart for an existing EVSE
- **THEN** the response SHALL include attributeStatus Accepted and SHALL return the effective (computed or overridden) value with no attributeStatusInfo

#### Scenario: EVSE SetVariables Accepted

- **WHEN** a SetVariables request sets AuthorizeRemoteStart for an existing EVSE with a valid boolean value
- **THEN** the response SHALL include status Accepted, omit attributeStatusInfo, and apply the runtime override (non-persistent) scoped to that EVSE

#### Scenario: EVSE runtime override cleared on reset

- **WHEN** an EVSE AuthorizeRemoteStart override is set and the station reset lifecycle occurs (soft or hard reset) clearing transient runtime variables
- **THEN** a subsequent GetVariables for AuthorizeRemoteStart at that EVSE SHALL return the default baseline value (override removed)

#### Scenario: EVSE invalid value rejected

- **WHEN** a SetVariables request sets AuthorizeRemoteStart at EVSE scope to a non-boolean value
- **THEN** the response SHALL include status Rejected with attributeStatusInfo.reasonCode PropertyConstraintViolation and descriptive additionalInfo; attributeValue omitted

#### Scenario: Unknown EVSE index

- **WHEN** a GetVariables or SetVariables request references a non-existent EVSE index
- **THEN** the response SHALL include status Rejected with attributeStatusInfo.reasonCode NotFound

#### Scenario: Consistent reasonCode usage

- **WHEN** EVSE AuthorizeRemoteStart succeeds (Accepted)
- **THEN** attributeStatusInfo SHALL be omitted; on failure, only standardized codes (ImmutableVariable, PropertyConstraintViolation, NotFound, InternalError, UnsupportedParam) SHALL be used

## MODIFIED Requirements

### Requirement: Transient Runtime Overrides Reset

The simulator SHALL treat non-persistent runtime variable overrides (including EVSE-scoped AuthorizeRemoteStart) as transient and clear them via resetRuntimeVariables()/resetRuntimeOverrides() simulating reboot/reset lifecycle; persistent configuration-backed variables retain values across resets.

#### Scenario: EVSE override cleared on reset

- **WHEN** an EVSE-scoped AuthorizeRemoteStart override is set
- **AND** resetRuntimeVariables() is invoked
- **THEN** a subsequent GetVariables for that EVSE SHALL return its default value (override removed)

## REMOVED Requirements

_(None)_
