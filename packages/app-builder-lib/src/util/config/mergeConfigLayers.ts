import { isValidKey, Nullish } from "builder-util-runtime"

/**
 * Merges configuration layers, earliest first, into a new object with the rules `deepAssign` uses: a later plain object is merged
 * key by key into an earlier one, two arrays are concatenated without duplicates, an explicit `null` overrides and `undefined` is
 * skipped.
 *
 * Unlike `deepAssign`, it never writes into a layer: every plain object in the result is a new object, so merging a later layer
 * cannot change an earlier one (e.g. `mas.sign` cannot leak into `mac.sign`). Arrays are copied too, but their elements are not.
 * And any value that is not a plain object or an array (a function, a class instance such as a `RegExp`, a primitive) replaces the
 * earlier value instead of being merged into it, so a later layer's hook or signer function wins.
 *
 * Used for the configuration cascades: `extends` → configuration file → programmatic / `-c` configuration, platform → target,
 * mac → mas → masDev, nsis → nsisWeb / portable and linux → snap core.
 */
export function mergeConfigLayers<T>(...layers: Array<object | Nullish>): T {
  const result: Record<string, any> = {}
  for (const layer of layers) {
    if (layer != null) {
      mergeInto(result, layer)
    }
  }
  return result as T
}

function isPlainConfigObject(value: unknown): value is Record<string, any> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

// `target` and every plain object in it were created by this module, so writing into them never changes a layer
function mergeInto(target: Record<string, any>, source: Record<string, any>): void {
  for (const key of Object.keys(source)) {
    const value = source[key]
    // https://github.com/electron-userland/electron-builder/pull/562
    if (!isValidKey(key) || value === undefined) {
      continue
    }

    const previous = target[key]
    if (isPlainConfigObject(value)) {
      const merged = isPlainConfigObject(previous) ? previous : {}
      mergeInto(merged, value)
      target[key] = merged
    } else if (Array.isArray(value)) {
      target[key] = Array.isArray(previous) ? Array.from(new Set(previous.concat(value))) : [...value]
    } else {
      target[key] = value
    }
  }
}
