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

/**
 * Deeply readonly view of an object graph frozen by {@link deepFreeze}.
 * Runtime-opaque mutable containers keep their original type because
 * `Object.freeze` cannot make their internal slots or backing storage immutable.
 */
export type DeepReadonly<T> = T extends abstract new (...arguments_: never[]) => unknown
  ? T
  : T extends (...arguments_: never[]) => unknown
    ? T
    : T extends ArrayBuffer | ArrayBufferView | Date | RegExp | SharedArrayBuffer
      ? T
      : T extends ReadonlyMap<infer _Key, infer _Value>
        ? T
        : T extends ReadonlySet<infer _Value>
          ? T
          : T extends WeakMap<infer _Key extends object, infer _Value>
            ? T
            : T extends WeakSet<infer _Value extends object>
              ? T
              : T extends readonly unknown[]
                ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
                : T extends object
                  ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
                  : T

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
 * `delete`/`clear`. These opaque mutable containers retain their mutable
 * TypeScript type; plain objects and arrays are returned as
 * {@link DeepReadonly} graphs.
 * @param object - Value to deep-freeze.
 * @returns The same `object` reference with a deeply readonly type for the
 *   object and array shapes that are deeply frozen.
 * @template T - Type of the value, preserved on return.
 */
export const deepFreeze = <T>(object: T): DeepReadonly<T> => {
  deepFreezeInto(object, new WeakSet())
  return object as DeepReadonly<T>
}
