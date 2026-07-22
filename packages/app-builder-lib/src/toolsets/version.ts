import { Nullish } from "builder-util-runtime"

/**
 * Resolve the unset/null/`"latest"` sentinel to the newest concrete version for a toolset.
 *
 * `"latest"` is the documented "null"-state for every {@link ToolsetConfig} property: an unset
 * property, `null`, `undefined`, and the literal `"latest"` all select the newest bundle.
 *
 * Callers must handle the {@link ToolsetCustom} (object) form before calling this — only the
 * string/null/"latest" union is normalized here.
 */
export function resolveToolsetVersion<T extends string>(value: T | "latest" | Nullish, latest: T): T {
  return value == null || value === "latest" ? latest : value
}
