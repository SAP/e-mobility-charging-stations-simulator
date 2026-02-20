# Architectural Decisions

## [2026-02-20] Task 2: TxUpdatedInterval

### Decision 1: Separate TxUpdatedInterval from MeterValues

- **Context**: Both send periodic messages during transactions
- **Decision**: Keep completely separate timers (`transactionSetInterval` vs `transactionTxUpdatedSetInterval`)
- **Rationale**:
  - Different intervals (MeterValueSampleInterval vs TxUpdatedInterval)
  - Different message types (MeterValues vs TransactionEvent)
  - Different trigger reasons (Periodic vs MeterValuePeriodic)
  - OCPP spec treats them as independent features

### Decision 2: Export Strategy for OCPP Types

- **Context**: Circular dependency issues with OCPP20ServiceUtils import
- **Decision**: Export from `ocpp/index.ts` as single source of truth
- **Rationale**: Prevents circular imports, maintains clean module boundaries

### Decision 3: Interval Validation Approach

- **Context**: Need to validate TxUpdatedInterval from variable manager
- **Decision**: Default to 30s if variable missing/invalid, no error thrown
- **Rationale**: Graceful degradation, aligns with OCPP "SHOULD" requirement (not "SHALL")
