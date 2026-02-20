# Known Issues & Gotchas

## [2026-02-20] Task 2: TxUpdatedInterval

### Issue 1: Import Path for OCPP20ServiceUtils

- **Problem**: Direct import caused circular dependency errors
- **Solution**: Export via `ocpp/index.ts` centralized exports
- **Files affected**: ChargingStation.ts, ocpp/index.ts

### Issue 2: Timer Safety with Large Intervals

- **Problem**: JavaScript setTimeout/setInterval has MAX_SAFE_INTEGER limit
- **Solution**: Use `clampToSafeTimerValue()` utility (max 2147483647ms ~= 24.8 days)
- **Reference**: src/utils/Utils.ts lines 388-396

### Issue 3: TransactionEvent During Transaction

- **Context**: sendTransactionEvent needs active transaction check
- **Validation**: Check `transactionStarted === true` AND `transactionId != null` before sending
- **Reason**: Timer may fire after transaction ends if stop is delayed

## Patterns to Avoid

- ❌ Hardcoded intervals (use variable manager)
- ❌ Missing OCPP version guards (breaks 1.6 compatibility)
- ❌ Unhandled promise rejections in setInterval callbacks
- ❌ Forgetting to clear timers on transaction end (memory leak)
