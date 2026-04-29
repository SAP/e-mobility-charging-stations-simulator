/**
 * @file useAsyncAction.ts
 * @description Shared async action executor with pending-key guard and toast notifications.
 * This is the forward pattern for fire-and-forget actions — prefer over useExecuteAction for new code.
 */
import { reactive, readonly } from 'vue'
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
      action: () => Promise<unknown>,
      successMsg: string,
      errorMsg: string,
      onSuccess?: () => void
    ) => void
  } {
  const $toast = useToast()
  const pending = reactive({ ...initialPending }) as T

  /**
   * Executes an async action with pending-key guard, toast feedback, and error logging.
   * @param key - The pending key to guard and track
   * @param action - The async operation to execute
   * @param successMsg - Toast message on success
   * @param errorMsg - Toast message and console prefix on failure
   * @param onSuccess - Optional callback invoked after success (before onRefresh)
   */
  function run (
    key: keyof T,
    action: () => Promise<unknown>,
    successMsg: string,
    errorMsg: string,
    onSuccess?: () => void
  ): void {
    if (pending[key]) return
    pending[key] = true as T[keyof T]
    // eslint-disable-next-line no-void
    void (async () => {
      try {
        await action()
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
        console.error(`${errorMsg}:`, error)
        $toast.error(errorMsg)
      } finally {
        pending[key] = false as T[keyof T]
      }
    })()
  }

  return { pending: readonly(pending) as Readonly<T>, run }
}
