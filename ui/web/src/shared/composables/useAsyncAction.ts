/**
 * @file useAsyncAction.ts
 * @description Shared async action executor with pending-key guard and toast notifications.
 */
import { getCurrentScope, onScopeDispose, reactive, readonly } from 'vue'
import { useToast } from 'vue-toast-notification'

/**
 * Creates a reactive pending-state map and a run() helper for async actions with toast notifications.
 *
 * Encapsulates the pending-key guard, toast feedback, and error logging pattern
 * shared by modern skin components.
 * @param initialPending - Object defining the pending keys (e.g. `{ connection: false, startStop: false }`)
 * @param onRefresh - Called after each successful action (e.g. `() => emit('need-refresh')`)
 * @returns `{ pending, run }` — reactive pending map and action executor
 */
export function useAsyncAction<T extends Record<string, boolean>> (
  initialPending: T,
  onRefresh?: () => void
): {
    pending: Readonly<T>
    run: (
      key: keyof T,
      options: {
        action: () => Promise<unknown>
        errorMsg: string
        onSuccess?: () => void
        successMsg: string
      }
    ) => void
  } {
  const $toast = useToast()
  /**
   * Reactive pending-state map. Access properties directly (e.g. `pending.connection`)
   * — do NOT destructure individual keys, as `reactive()` proxies lose reactivity on destructure.
   */
  const pending = reactive({ ...initialPending }) as T

  let disposed = false
  if (getCurrentScope() != null) {
    onScopeDispose(() => {
      disposed = true
    })
  }

  /**
   * Executes an async action with pending-key guard, toast feedback, and error logging.
   * @param key - The pending key to guard and track
   * @param options - Action configuration with action, messages, and optional success callback
   * @param options.action - The async operation to execute
   * @param options.errorMsg - Toast message and console prefix on failure
   * @param options.onSuccess - Optional callback invoked after success (before onRefresh)
   * @param options.successMsg - Toast message on success
   */
  function run (
    key: keyof T,
    options: {
      action: () => Promise<unknown>
      errorMsg: string
      onSuccess?: () => void
      successMsg: string
    }
  ): void {
    const { action, errorMsg, onSuccess, successMsg } = options
    if (pending[key]) return
    pending[key] = true as T[keyof T]
    // eslint-disable-next-line no-void
    void (async () => {
      try {
        await action()
        if (disposed) return
        try {
          onSuccess?.()
        } catch (error: unknown) {
          console.error('Error in onSuccess callback:', error)
        }
        $toast.success(successMsg)
        try {
          onRefresh?.()
        } catch (error: unknown) {
          console.error('Error in onRefresh callback:', error)
        }
      } catch (error: unknown) {
        if (disposed) return
        console.error(`${errorMsg}:`, error)
        $toast.error(errorMsg)
      } finally {
        if (!disposed) {
          pending[key] = false as T[keyof T]
        }
      }
    })()
  }

  return { pending: readonly(pending) as Readonly<T>, run }
}
