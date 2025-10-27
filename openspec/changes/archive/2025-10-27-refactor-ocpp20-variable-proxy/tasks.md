## 1. Implementation

- [x] 1.1 Inventory existing configuration helper capabilities
- [x] 1.2 Map each OCPP variable to configuration key helper
- [x] 1.3 Refactor VariableManager to translation-only (remove duplicated logic; no new layer)
- [x] 1.4 Remove duplicated persistence/mutability/validation logic
- [x] 1.4a Add compatibility resetRuntimeVariables method (clears runtime overrides)
- [x] 1.5 Normalize reasonCode set against OCPP 2.0.1 spec in docs/ocpp2 (Accepted responses omit attributeStatusInfo)
- [x] 1.6 Add delegation tests (indirect verification via effects: no duplicate persistence, write-only GetVariables rejection)
- [x] 1.7 Add startup mapping self-check (fail/log unmapped)
- [x] 1.8 Update documentation (spec delta + inline code docs if needed)
- [x] 1.9 Run lint (pnpm lint) & ensure zero errors
- [x] 1.10 Run formatting (pnpm format) & ensure no diffs remain
- [x] 1.11 Run OCPP2 spec compliance tests (existing UTs covering spec scenarios) ensuring all pass
- [x] 1.12 Add/adjust UTs to cover translation-only behavior (runtime override reset + write-only GetVariables mapping)
- [ ] 1.13 Validate change with openspec --strict (pending CLI availability)
- [x] 1.14 Final verification: all tasks checked before marking change ready for review
