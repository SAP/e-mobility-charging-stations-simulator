# OCPP Implementation Architecture

## Overview

The project implements both OCPP 1.6 and OCPP 2.0.x protocols with clear separation:

## Key Components

### OCPP 2.0 Request Service

- **Location**: `src/charging-station/ocpp/2.0/OCPP20RequestService.ts`
- **Purpose**: Handles outgoing OCPP 2.0 requests
- **Key Methods**:
  - `buildRequestPayload()`: Constructs request payloads
  - `requestHandler()`: Handles request processing
  - Constructor sets up payload validation functions

### Supported OCPP 2.0 Commands

- `BOOT_NOTIFICATION`: Station startup notification
- `HEARTBEAT`: Keep-alive messages
- `NOTIFY_REPORT`: Configuration reports
- `STATUS_NOTIFICATION`: Status updates

### Request/Response Flow

1. Request constructed via `buildRequestPayload()`
2. Validation performed using JSON schemas
3. Request sent via WebSocket
4. Response handled by `OCPP20ResponseService`

### Testing Patterns

- Tests located in `tests/charging-station/ocpp/2.0/`
- Use `OCPP20IncomingRequestService` for testing incoming requests
- Use `OCPP20RequestService` for testing outgoing requests
- Mock charging stations created with factory functions
- Follow integration testing approach with real service instances
