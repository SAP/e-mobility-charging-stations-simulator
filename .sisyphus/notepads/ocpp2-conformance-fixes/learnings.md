# Learnings & Conventions

## [2026-02-20] Task 2: TxUpdatedInterval Implementation

### Patterns Established

- **Timer management**: Use `clampToSafeTimerValue()` wrapper for all setInterval calls
- **Variable retrieval**: Use `OCPP20VariableManager.getVariables()` with component/variable lookup
- **Lifecycle hooks**: START at RequestStartTransaction, STOP before transaction cleanup
- **ConnectorStatus fields**: Store timer references in connector status for cleanup
- **Error handling**: Catch promise rejections in setInterval callbacks with logger.error

### Code Conventions

- Import enums from `src/charging-station/ocpp/index.ts` (centralized exports)
- Follow existing MeterValues pattern for periodic message sending
- Validate OCPP version at method entry (`if (ocppVersion !== VERSION_20) return`)
- Check connector null and interval validity before starting timers
- Prevent duplicate timers (check if timer already exists)

### File Structure

- ChargingStation.ts: Public start/stop methods
- OCPP20IncomingRequestService.ts: Private helper + START lifecycle
- OCPP20ServiceUtils.ts: STOP lifecycle hook
- ConnectorStatus.ts: Timer field storage
- ocpp/index.ts: Centralized type exports
