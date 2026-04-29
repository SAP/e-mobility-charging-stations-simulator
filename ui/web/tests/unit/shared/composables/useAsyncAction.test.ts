/**
 * @file Tests for useAsyncAction composable
 * @description Verifies loading state, error toasts, and success callbacks for async action wrapper.
 */
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useAsyncAction } from '@/shared/composables/useAsyncAction.js'

import { toastMock } from '../../../setup.js'
import { withSetup } from '../../helpers.js'

describe('useAsyncAction', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize pending keys to false', () => {
    const [{ pending }] = withSetup(() => useAsyncAction({ a: false, b: false }))
    expect(pending.a).toBe(false)
    expect(pending.b).toBe(false)
  })

  it('should set pending[key] to true while action is in progress', async () => {
    let resolveAction!: (value: unknown) => void
    const action = () =>
      new Promise(resolve => {
        resolveAction = resolve
      })
    const [{ pending, run }] = withSetup(() => useAsyncAction({ a: false }))
    run('a', { action, errorMsg: 'err', successMsg: 'ok' })
    expect(pending.a).toBe(true)
    resolveAction(undefined)
    await flushPromises()
    expect(pending.a).toBe(false)
  })

  it('should show success toast on success', async () => {
    const [{ run }] = withSetup(() => useAsyncAction({ a: false }))
    run('a', { action: () => Promise.resolve(), errorMsg: 'Error!', successMsg: 'Success!' })
    await flushPromises()
    expect(toastMock.success).toHaveBeenCalledWith('Success!')
  })

  it('should call onRefresh after success', async () => {
    const onRefresh = vi.fn()
    const [{ run }] = withSetup(() => useAsyncAction({ a: false }, onRefresh))
    run('a', { action: () => Promise.resolve(), errorMsg: 'err', successMsg: 'ok' })
    await flushPromises()
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('should call onSuccess callback before onRefresh', async () => {
    const calls: string[] = []
    const onRefresh = vi.fn(() => calls.push('refresh'))
    const onSuccess = vi.fn(() => calls.push('success'))
    const [{ run }] = withSetup(() => useAsyncAction({ a: false }, onRefresh))
    run('a', { action: () => Promise.resolve(), errorMsg: 'err', onSuccess, successMsg: 'ok' })
    await flushPromises()
    expect(calls).toEqual(['success', 'refresh'])
  })

  it('should show error toast on failure', async () => {
    const [{ run }] = withSetup(() => useAsyncAction({ a: false }))
    run('a', {
      action: () => Promise.reject(new Error('fail')),
      errorMsg: 'Error!',
      successMsg: 'ok',
    })
    await flushPromises()
    expect(toastMock.error).toHaveBeenCalledWith('Error!')
  })

  it('should not start a new action when pending[key] is already true', async () => {
    let resolveAction!: (value: unknown) => void
    const action = () =>
      new Promise(resolve => {
        resolveAction = resolve
      })
    const [{ pending, run }] = withSetup(() => useAsyncAction({ a: false }))
    run('a', { action, errorMsg: 'err', successMsg: 'first' })
    expect(pending.a).toBe(true)
    run('a', { action: () => Promise.resolve(), errorMsg: 'err', successMsg: 'second' })
    resolveAction(undefined)
    await flushPromises()
    expect(toastMock.success).toHaveBeenCalledTimes(1)
    expect(toastMock.success).toHaveBeenCalledWith('first')
  })

  it('should not call onRefresh on failure', async () => {
    const onRefresh = vi.fn()
    const [{ run }] = withSetup(() => useAsyncAction({ a: false }, onRefresh))
    run('a', { action: () => Promise.reject(new Error('fail')), errorMsg: 'err', successMsg: 'ok' })
    await flushPromises()
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('should still call onRefresh when onSuccess callback throws', async () => {
    const refreshMock = vi.fn()
    const [{ run }] = withSetup(() => useAsyncAction({ a: false }, refreshMock))
    run('a', {
      action: () => Promise.resolve(),
      errorMsg: 'err',
      onSuccess: () => {
        throw new Error('onSuccess exploded')
      },
      successMsg: 'ok',
    })
    await flushPromises()
    expect(refreshMock).toHaveBeenCalled()
  })

  it('should not crash when onRefresh callback throws', async () => {
    const [{ pending, run }] = withSetup(() =>
      useAsyncAction({ a: false }, () => {
        throw new Error('refresh exploded')
      })
    )
    run('a', { action: () => Promise.resolve(), errorMsg: 'err', successMsg: 'ok' })
    await flushPromises()
    expect(pending.a).toBe(false)
  })

  it('should not fire callbacks or reset pending after scope disposal', async () => {
    let resolveAction!: (value: unknown) => void
    const action = () =>
      new Promise(resolve => {
        resolveAction = resolve
      })
    const onRefresh = vi.fn()
    const [{ pending, run }, app] = withSetup(() => useAsyncAction({ a: false }, onRefresh))
    run('a', { action, errorMsg: 'err', successMsg: 'ok' })
    expect(pending.a).toBe(true)
    app.unmount()
    resolveAction(undefined)
    await flushPromises()
    expect(toastMock.success).not.toHaveBeenCalled()
    expect(onRefresh).not.toHaveBeenCalled()
    expect(pending.a).toBe(true)
  })

  it('should not show error toast after scope disposal on failure', async () => {
    let rejectAction!: (reason: unknown) => void
    const action = () =>
      new Promise((_resolve, reject) => {
        rejectAction = reject
      })
    const [{ run }, app] = withSetup(() => useAsyncAction({ a: false }))
    run('a', { action, errorMsg: 'Error!', successMsg: 'ok' })
    app.unmount()
    rejectAction(new Error('fail'))
    await flushPromises()
    expect(toastMock.error).not.toHaveBeenCalled()
  })
})
