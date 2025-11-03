# Code Style and Conventions

## TypeScript/Node.js Conventions

- **Naming**: camelCase for variables/functions/methods, PascalCase for classes/types/enums/interfaces
- **Async operations**: Prefer async/await over raw Promises; handle rejections explicitly with try/catch
- **Error handling**: Use typed errors (BaseError, OCPPError) with structured properties; avoid generic Error
- **Null safety**: Avoid non-null assertions (!); use optional chaining (?.) and nullish coalescing (??)
- **Type safety**: Prefer explicit types over any; use type guards and discriminated unions where appropriate

## OCPP-specific Conventions

- **Command naming**: Follow OCPP standard naming exactly (e.g., RemoteStartTransaction, BootNotification, StatusNotification)
- **Enumeration naming**: Use standard OCPP specifications enumeration names and values exactly
- **Version handling**: Clearly distinguish between OCPP 1.6 and 2.0.x implementations in separate namespaces/files
- **Payload validation**: Validate against OCPP JSON schemas when ocppStrictCompliance is enabled
- **Message format**: Use standard SRPC format: [messageTypeId, messageId, action, payload]

## Testing Conventions

- Use `describe()` and `it()` functions from Node.js test runner
- Test files should be named `*.test.ts`
- Use `@std/expect` for assertions
- Mock charging stations with `createChargingStation()`
- Use `/* eslint-disable */` comments for specific test requirements
- Async tests should use `await` in describe/it callbacks

## File Organization

- OCPP 1.6 code in `src/charging-station/ocpp/1.6/`
- OCPP 2.0 code in `src/charging-station/ocpp/2.0/`
- Types in `src/types/` with proper exports through index files
- Tests mirror source structure in `tests/`
