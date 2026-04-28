/**
 * @file Tests for modern error-extraction helper
 * @description Unit tests for getFailureInfo which unwraps ServerFailureError payloads.
 *   Payloads are cast via `as never` because we're testing defensive handling of
 *   malformed shapes the strongly-typed signature forbids.
 */
import { type ResponsePayload, ResponseStatus, ServerFailureError } from 'ui-common'
import { describe, expect, it } from 'vitest'

import { getFailureInfo } from '@/skins/modern/composables/errors'

/**
 * Builds a ResponsePayload-shaped object with custom responsesFailed entries.
 * Cast via `as never` so we can exercise malformed shapes for defensive paths.
 * @param responsesFailed the entries to put in the payload
 * @returns a ResponsePayload-cast object
 */
const payloadWith = (responsesFailed: unknown[]): ResponsePayload =>
  ({
    hashIdsFailed: [],
    responsesFailed,
    status: ResponseStatus.FAILURE,
  }) as never

describe('modern getFailureInfo', () => {
  it('should return extractErrorMessage for non-ServerFailureError', () => {
    const info = getFailureInfo(new Error('boom'))
    expect(info.payload).toBeUndefined()
    expect(info.summary).toBe('boom')
  })

  it('should return a summary for unknown non-Error values', () => {
    const info = getFailureInfo('weird')
    expect(info.payload).toBeUndefined()
    expect(typeof info.summary).toBe('string')
  })

  it('should prefer idTagInfo.status when present', () => {
    const payload = payloadWith([{ commandResponse: { idTagInfo: { status: 'Invalid' } } }])
    const err = new ServerFailureError(payload)
    const info = getFailureInfo(err)
    expect(info.summary).toBe('Invalid')
    expect(info.payload).toEqual(payload)
  })

  it('should fall back to commandResponse.status when idTagInfo absent', () => {
    const payload = payloadWith([{ commandResponse: { status: 'Rejected' } }])
    const err = new ServerFailureError(payload)
    const info = getFailureInfo(err)
    expect(info.summary).toBe('Rejected')
  })

  it('should fall back to errorMessage when status fields absent', () => {
    const payload = payloadWith([{ commandResponse: {}, errorMessage: 'network down' }])
    const err = new ServerFailureError(payload)
    const info = getFailureInfo(err)
    expect(info.summary).toBe('network down')
  })

  it('should fall back to extractErrorMessage when payload has no useful string fields', () => {
    const payload = payloadWith([{ commandResponse: {} }])
    const err = new ServerFailureError(payload)
    const info = getFailureInfo(err)
    expect(typeof info.summary).toBe('string')
    expect(info.summary.length).toBeGreaterThan(0)
  })

  it('should handle responsesFailed being empty', () => {
    const payload = payloadWith([])
    const err = new ServerFailureError(payload)
    const info = getFailureInfo(err)
    expect(info.payload).toEqual(payload)
    expect(typeof info.summary).toBe('string')
  })

  it('should ignore empty-string status fields and falls through', () => {
    const payload = payloadWith([
      { commandResponse: { idTagInfo: { status: '' }, status: '' }, errorMessage: 'fallback' },
    ])
    const err = new ServerFailureError(payload)
    const info = getFailureInfo(err)
    expect(info.summary).toBe('fallback')
  })

  it('should ignore non-string status fields', () => {
    const payload = payloadWith([
      { commandResponse: { idTagInfo: { status: 42 }, status: null }, errorMessage: 'fb' },
    ])
    const err = new ServerFailureError(payload)
    const info = getFailureInfo(err)
    expect(info.summary).toBe('fb')
    expect(info.payload).toEqual(payload)
  })
})
