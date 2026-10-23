/** The list entry that stands for a built-in default list, e.g. `"fileOptions": { "excludedExts": ["default", "map"] }`. */
export const DEFAULT_KEYWORD = "default"

/**
 * Returns `list` with every `"default"` entry replaced, at its position, by the entries of `defaults`. Any other entry (a string or a
 * descriptor object) is kept as it is. Always returns a new array and does not deduplicate.
 *
 * Unlike `replaceDefault`, every `"default"` entry is expanded and neither input array is returned.
 */
export function expandDefaultKeyword<T>(list: ReadonlyArray<T>, defaults: ReadonlyArray<T>): Array<T> {
  const result: Array<T> = []
  for (const item of list) {
    if (item === DEFAULT_KEYWORD) {
      result.push(...defaults)
    } else {
      result.push(item)
    }
  }
  return result
}

/**
 * Resolves a list in which `"default"` stands for `defaults` and an entry starting with `!` removes that value from the result, wherever
 * it is listed. Duplicates are dropped; the first occurrence keeps its position.
 *
 * `unusedRemovals` holds the removed values that are not otherwise listed, for the caller to warn about. Entries are not validated:
 * `"!default"` removes a literal `"default"` value, so a caller that does not allow it must reject it first.
 */
export function resolveDefaultKeywordList(list: ReadonlyArray<string>, defaults: ReadonlyArray<string>): { result: Array<string>; unusedRemovals: Array<string> } {
  const removed = new Set(list.filter(it => it.startsWith("!")).map(it => it.substring(1)))
  const kept = list.filter(it => !it.startsWith("!"))
  const included = new Set(expandDefaultKeyword(kept, defaults))
  return {
    result: [...included].filter(it => !removed.has(it)),
    unusedRemovals: [...removed].filter(it => !included.has(it)),
  }
}
