## Why

OCPP 2.0.1 variable handling added SetVariables support, but parts of the current OCPP20VariableManager duplicate persistence, mutability, and validation logic already implemented by existing configuration key helpers. This increases maintenance overhead and risk of divergence from strict OCPP 2.0.1 specification requirements. We need to audit and refactor so the existing VariableManager operates purely as a translation proxy between OCPP components/variables and the underlying configuration key handling (data format, persistence, mutability, validation) without introducing any new indirection layer.

## What Changes

Additional scope extension: Align ResetResponse success handling by omitting `statusInfo` for Accepted/Scheduled resets unless conveying actionable scheduling context; remove use of legacy `NoError` reasonCode in success responses.

- Refactor OCPP20VariableManager to REMOVE duplicated logic and rely directly on existing configuration helpers (ChargingStationConfigurationUtils / ConfigurationKeyUtils) for data format, persistence, mutability, validation.
- Ensure VariableManager only performs translation: request parsing, mapping to internal keys, assembling OCPP-compliant responses (statuses, reasonCodes) based on helper outcomes.
- Align reasonCode mapping strictly with OCPP 2.0.1 spec; eliminate legacy custom codes (WriteOnly, ValueZeroNotAllowed, ValuePositiveOnly, InvalidURL, NoError) unless re-added by future spec delta.
- Add tests verifying delegation (spies/mocks) and absence of standalone persistence/validation logic in VariableManager.
- Add startup self-check ensuring every declared OCPP variable maps to an existing configuration key (fail fast, log error, mark InternalError status if unmapped) (**BREAKING** if unmapped variables previously functioned partially).
- Update spec delta to clarify translation-only role and removal of duplicate logic (no new layer introduced).

## Impact

- Affected specs: ocpp (centralized validation logic requirement)
- Affected code: src/charging-station/ocpp/2.0/OCPP20VariableManager.ts, ConfigurationKeyUtils.ts, ChargingStationConfigurationUtils.ts, tests/charging-station/ocpp/2.0/\*
- Benefits: reduced duplication, stricter spec conformity, lower divergence risk, clearer responsibility boundaries.
