/**
 * @file Recursive object-freezing utility.
 * @description Leaf module providing {@link deepFreeze}, a recursive,
 *   identity-preserving, idempotent deep `Object.freeze`. Consumed both by
 *   `./Constants.js` (to deep-freeze `DEFAULT_STATION_INFO`) and by the
 *   station-info invariants flyweight
 *   (`../charging-station/StationInfoInvariants.js`).
 *
 * IMPORTANT: this module MUST remain import-free. `./Constants.js` imports it
 *   directly (not through the `./index.js` barrel) and is itself imported by
 *   `./Utils.js`; any import added here that transitively reaches `Constants`
 *   or `Utils` would reintroduce a module-initialization cycle whose temporal
 *   dead zone crashes at load time (`DEFAULT_STATION_INFO` is a class-static
 *   field frozen during module evaluation).
 */

const deepFreezeInto = (object: unknown, seen: WeakSet<object>): void => {
  if (object == null || typeof object !== 'object' || seen.has(object)) {
    return
  }
  // Array-buffer views are opaque binary leaves: Object.freeze throws on a
  // non-empty typed array, and freezing a view cannot lock its backing buffer.
  if (ArrayBuffer.isView(object)) {
    return
  }
  // Mark before recursing so self-referential graphs terminate.
  seen.add(object)
  for (const key of Reflect.ownKeys(object)) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key)
    // Recurse into own data properties only (incl. symbol-keyed and
    // non-enumerable); accessor properties are never read — a getter's
    // transient return cannot be meaningfully frozen.
    if (descriptor != null && 'value' in descriptor) {
      deepFreezeInto(descriptor.value, seen)
    }
  }
  // Freeze after children so the whole reachable graph is frozen even when the
  // input node was already (shallow-)frozen.
  Object.freeze(object)
}

/**
 * Recursively freezes an object graph in place and returns the same reference.
 * Freezes every own data property (enumerable and non-enumerable, string- and
 * symbol-keyed) of the reachable graph, including the children of an already
 * (shallow-)frozen input; cycle-safe via a visited set. Accessor properties are
 * not traversed. A no-op for non-objects (primitives and `null` are returned
 * unchanged). Array-buffer views (typed arrays, `DataView`) are treated as
 * opaque leaves and left unfrozen. `Map`/`Set` objects are frozen, but their
 * entries are not traversed and `Object.freeze` does not prevent `set`/`add`/
 * `delete`/`clear`.
 * @param object - Value to deep-freeze.
 * @returns The same `object` reference, deeply frozen when it is an object.
 * @template T - Type of the value, preserved on return.
 */
export const deepFreeze = <T>(object: T): T => {
  deepFreezeInto(object, new WeakSet())
  return object
}
