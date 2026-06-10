import { InvalidConfigurationError, log } from "builder-util"
import debug from "debug"
import { realpath } from "fs/promises"
import { createRequire } from "node:module"
import * as path from "path"

const _require = createRequire(import.meta.url)
const _requireResolve = _require.resolve
const _dynamicImportMaybe: (modulePath: string) => Promise<any> = _require("../../helpers/dynamic-import.cjs").dynamicImportMaybe

export async function resolveModule<T>(type: string | undefined, name: string): Promise<T> {
  try {
    return _dynamicImportMaybe(name)
  } catch (error: any) {
    log.error({ moduleName: name, message: error.message ?? error.stack }, "Unable to dynamically `import` or `require`")
    throw error
  }
}

export async function resolveFunction<T>(type: string | undefined, executor: T | string, name: string, rootSearchDir: string): Promise<T> {
  if (executor == null || typeof executor !== "string") {
    // is already function or explicitly ignored by user
    return executor
  }

  let p = executor as string
  if (p.startsWith(".")) {
    p = path.resolve(p)
    let realP = p
    let realRoot = rootSearchDir
    try {
      realP = await realpath(p)
      realRoot = await realpath(rootSearchDir)
    } catch {
      // path may not exist yet; fall back to lexical check
    }
    const relative = path.relative(realRoot, realP)
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new InvalidConfigurationError(`Hook module path "${executor}" resolves outside the workspace root ("${rootSearchDir}")`)
    }
  }

  try {
    p = _requireResolve(p)
  } catch (e: any) {
    debug(e)
    p = path.resolve(p)
  }

  const m: any = await resolveModule(type, p)
  const namedExport = m[name]
  if (namedExport == null) {
    return m.default || m
  } else {
    return namedExport
  }
}
