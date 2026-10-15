import { log } from "builder-util"
import { ALL_PLATFORM_KEYS, BREAKING_CHANGES_URL, FILE_OPTION_KEYS, FILE_OPTIONS_ANCHOR } from "./legacyOptions.js"

const FILE_OPTIONS_URL = `${BREAKING_CHANGES_URL}#${FILE_OPTIONS_ANCHOR}`

export function isPlainObject(value: unknown): value is Record<string, any> {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

/**
 * Moves the v26 flat `files` / `extraResources` / `extraFiles` keys of one configuration object into `fileOptions`,
 * at the root and on every platform key, so that everything after config loading reads only `fileOptions`.
 *
 * The flat keys keep working in v27 and are removed in v28. Using them logs one deprecation warning per process.
 * When a flat key and its `fileOptions` counterpart are both set on the same object, the nested value wins and the
 * flat one is dropped with a warning. A `fileOptions` that is not an object is left alone (flat keys included) for
 * `checkLegacyConfiguration` to report.
 *
 * Mutates `config`. Idempotent: a normalized configuration has no flat keys left.
 */
export function normalizeFileOptions(config: Record<string, any>): void {
  const moved: string[] = []
  moveFlatFileOptions(config, "", moved)
  for (const platform of ALL_PLATFORM_KEYS) {
    if (isPlainObject(config[platform])) {
      moveFlatFileOptions(config[platform], `${platform}.`, moved)
    }
  }

  if (moved.length > 0) {
    log
      .once("v27-flat-file-options")
      .warn(
        `electron-builder v27 nests \`files\`, \`extraResources\` and \`extraFiles\` under \`fileOptions\`; your configuration still sets [${moved.join(", ")}]. ` +
          `Move them to ${moved.map(it => `\`${nestedPath(it)}\``).join(", ")}. ` +
          "The flat keys still work in v27 and are removed in v28. " +
          `Run \`electron-builder migrate-schema\` to update your configuration automatically. ${FILE_OPTIONS_URL}`
      )
  }
}

/** `mac.files` → `mac.fileOptions.files` */
function nestedPath(flatPath: string): string {
  const dot = flatPath.lastIndexOf(".")
  return dot === -1 ? `fileOptions.${flatPath}` : `${flatPath.substring(0, dot)}.fileOptions.${flatPath.substring(dot + 1)}`
}

function moveFlatFileOptions(holder: Record<string, any>, prefix: string, moved: string[]): void {
  const present = FILE_OPTION_KEYS.filter(key => holder[key] !== undefined)
  if (present.length === 0) {
    return
  }

  const existing = holder.fileOptions
  if (existing != null && !isPlainObject(existing)) {
    return
  }

  // A new object: `existing` may be shared with another configuration (a preset, a parent config).
  const fileOptions: Record<string, any> = { ...existing }
  for (const key of present) {
    const flatPath = `${prefix}${key}`
    if (fileOptions[key] === undefined) {
      fileOptions[key] = holder[key]
      moved.push(flatPath)
    } else {
      log
        .once(`v27-file-options-conflict:${flatPath}`)
        .warn(
          `electron-builder v27: \`${flatPath}\` and \`${nestedPath(flatPath)}\` are both set. \`${nestedPath(flatPath)}\` is used and \`${flatPath}\` is ignored. ` +
            `Remove \`${flatPath}\`, moving any patterns you still need into \`${nestedPath(flatPath)}\`. ${FILE_OPTIONS_URL}`
        )
    }
    delete holder[key]
  }
  holder.fileOptions = fileOptions
}
