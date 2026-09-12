import type { ConnectorStatus } from '../../types/ConnectorStatus.js'

export interface TransactionMeterValueDelivery {
  readonly markBuffered: () => void
  readonly settle: (definitivelyRejected?: boolean) => void
}

export interface TransactionMeterValueDependency {
  readonly onDefinitiveRejection: (callback: () => void) => void
  readonly settled: boolean
  readonly waitForSettlement: () => Promise<boolean>
}

interface PendingTransactionMeterValueDelivery {
  readonly dependency: TransactionMeterValueDependency
  ready: boolean
  readonly readyPromise: Promise<void>
  rejected: boolean
  readonly rejectionCallbacks: Set<() => void>
  readonly resolveReady: () => void
  settled: boolean
}

/**
 * Tracks transaction-scoped MeterValues work whose delivery outcome changes
 * interval-energy or public-key state consumed by a terminal payload.
 */
export class TransactionMeterValueDeliveryBarrier {
  private static readonly barriers = new WeakMap<
    ConnectorStatus,
    TransactionMeterValueDeliveryBarrier
  >()

  private readonly pendingByTransaction = new Map<
    string,
    Set<PendingTransactionMeterValueDelivery>
  >()

  public static begin (
    connectorStatus: ConnectorStatus,
    transactionId: number | string
  ): TransactionMeterValueDelivery | undefined {
    const normalizedTransactionId = transactionId.toString()
    if (connectorStatus.transactionId?.toString() !== normalizedTransactionId) return

    let barrier = TransactionMeterValueDeliveryBarrier.barriers.get(connectorStatus)
    if (barrier == null) {
      barrier = new TransactionMeterValueDeliveryBarrier()
      TransactionMeterValueDeliveryBarrier.barriers.set(connectorStatus, barrier)
    }
    return barrier.begin(normalizedTransactionId)
  }

  public static async wait (
    connectorStatus: ConnectorStatus,
    transactionId: number | string
  ): Promise<readonly TransactionMeterValueDependency[]> {
    const barrier = TransactionMeterValueDeliveryBarrier.barriers.get(connectorStatus)
    if (barrier == null) return []
    const dependencies = await barrier.wait(transactionId.toString())
    if (barrier.pendingByTransaction.size === 0) {
      TransactionMeterValueDeliveryBarrier.barriers.delete(connectorStatus)
    }
    return dependencies
  }

  private begin (transactionId: string): TransactionMeterValueDelivery {
    const ready = Promise.withResolvers<undefined>()
    const settlement = Promise.withResolvers<boolean>()
    const rejectionCallbacks = new Set<() => void>()
    const pendingDelivery: PendingTransactionMeterValueDelivery = {
      dependency: {
        onDefinitiveRejection: callback => {
          if (pendingDelivery.rejected) {
            callback()
          } else if (!pendingDelivery.settled) {
            rejectionCallbacks.add(callback)
          }
        },
        get settled () {
          return pendingDelivery.settled
        },
        waitForSettlement: () => settlement.promise,
      },
      ready: false,
      readyPromise: ready.promise,
      rejected: false,
      rejectionCallbacks,
      resolveReady: () => {
        ready.resolve(undefined)
      },
      settled: false,
    }
    let pending = this.pendingByTransaction.get(transactionId)
    pending ??= new Set<PendingTransactionMeterValueDelivery>()
    pending.add(pendingDelivery)
    this.pendingByTransaction.set(transactionId, pending)

    const markReady = (): void => {
      if (pendingDelivery.ready) return
      pendingDelivery.ready = true
      pendingDelivery.resolveReady()
    }
    return {
      markBuffered: markReady,
      settle: (definitivelyRejected = false) => {
        if (pendingDelivery.settled) return
        pendingDelivery.settled = true
        pendingDelivery.rejected = definitivelyRejected
        if (definitivelyRejected) {
          for (const callback of rejectionCallbacks) callback()
        }
        rejectionCallbacks.clear()
        settlement.resolve(definitivelyRejected)
        pending.delete(pendingDelivery)
        if (pending.size === 0) this.pendingByTransaction.delete(transactionId)
        markReady()
      },
    }
  }

  private async wait (transactionId: string): Promise<readonly TransactionMeterValueDependency[]> {
    const dependencies = new Set<TransactionMeterValueDependency>()
    for (;;) {
      const pending = this.pendingByTransaction.get(transactionId)
      if (pending == null || pending.size === 0) return [...dependencies]
      const snapshot = [...pending]
      await Promise.all(snapshot.map(delivery => delivery.readyPromise))
      for (const delivery of snapshot) {
        if (!delivery.settled) dependencies.add(delivery.dependency)
      }
      const current = this.pendingByTransaction.get(transactionId)
      if (current == null || [...current].every(delivery => delivery.ready)) {
        return [...dependencies]
      }
    }
  }
}
