## Why

EVSE-level AuthorizeRemoteStart variable scope lacked explicit specification: station and connector contexts resolved runtime overrides, but EVSE scope returned UnsupportedParam or UnknownVariable. This gap reduced fidelity when simulating multi-EVSE stations under OCPP 2.0.1.

## What Changes

- Add EVSE-level support for AuthorizeRemoteStart variable resolution with unified runtime override handling.
- Clarify runtime vs persistent behavior for AuthorizeRemoteStart across station, connector, and EVSE scopes.
- Document validation constraints and standardized reasonCode usage (omit success statusInfo).
- Add tests covering EVSE GetVariables and SetVariables outcomes.

## Impact

- Affected specs: ocpp (variable handling requirements).
- Affected code: OCPP20VariableManager.ts, ConfigurationKeyUtils.ts, tests/charging-station/ocpp/2.0/\*.
- Non-breaking externally; internal stricter validation may reject previously tolerated invalid values.
