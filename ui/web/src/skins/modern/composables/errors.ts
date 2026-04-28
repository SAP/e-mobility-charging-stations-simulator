// Error-extraction helpers for v2 dialogs.
//
// `ServerFailureError.payload.responsesFailed[i]` has `errorMessage` and
// `commandResponse` (the actual protocol response, e.g. `{ idTagInfo: { status } }`
// for authorize). We dig into `commandResponse` to surface the real protocol
// status and return the full payload for a debug-panel JSON dump.

import { extractErrorMessage, type ResponsePayload, ServerFailureError } from 'ui-common'

export interface FailureInfo {
  payload?: ResponsePayload
  summary: string
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined

const stringField = (rec: Record<string, unknown> | undefined, key: string): string | undefined => {
  const v = rec?.[key]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

export const getFailureInfo = (error: unknown): FailureInfo => {
  if (error instanceof ServerFailureError) {
    const first = asRecord(error.payload.responsesFailed?.[0])
    const cmdResponse = asRecord(first?.commandResponse)
    const idTagInfo = asRecord(cmdResponse?.idTagInfo)

    // Preferred: the protocol status inside commandResponse (e.g. "Invalid",
    // "Blocked", "Expired" for authorize; "Accepted"/"Rejected" for others).
    const summary =
      stringField(idTagInfo, 'status') ??
      stringField(cmdResponse, 'status') ??
      stringField(first, 'errorMessage') ??
      extractErrorMessage(error)

    return { payload: error.payload, summary }
  }
  return { summary: extractErrorMessage(error) }
}
