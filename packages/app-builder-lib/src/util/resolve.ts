import { log } from "builder-util/out/log"
import debug from "debug"
import * as path from "path"
import { pathToFileURL } from "url"

export async function resolveModule<T>(type: string | undefined, name: string): Promise<T> {
  const extension = path.extname(name).toLowerCase()
  const isModuleType = type === "module"
  try {
    if (extension === ".mjs" || (extension === ".js" && isModuleType)) {
      const fileUrl = pathToFileURL(name).href
      return await eval("import ('" + fileUrl + "')")
    }
  } catch (error: any) {
    log.debug({ moduleName: name, message: error.message ?? error.stack }, "Unable to dynamically import , falling back to `require`")
  }
  try {
    return require(name)
  } catch (error: any) {
    log.error({ moduleName: name, message: error.message ?? error.stack }, "Unable to `require`")
    throw new Error(error.message ?? error.stack)
  }
}

export async function resolveFunction<T>(type: string | undefined, executor: T | string, name: string): Promise<T> {
  if (executor == null || typeof executor !== "string") {
    // is already function or explicitly ignored by user
    return executor
  }

  let p = executor as string
  if (p.startsWith(".")) {
    p = path.resolve(p)
  }

  try {
    p = require.resolve(p)
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
