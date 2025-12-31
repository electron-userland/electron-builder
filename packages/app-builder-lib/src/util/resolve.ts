import { log } from "builder-util/out/log"
import debug from "debug"
import * as path from "path"
import * as requireMaybe from "../../helpers/dynamic-import"
import { resolveFromProject } from "./projectModuleResolver"

export async function resolveModule<T>(type: string | undefined, name: string): Promise<T> {
  try {
    return requireMaybe.dynamicImportMaybe(name)
  } catch (error: any) {
    log.error({ moduleName: name, message: error.message ?? error.stack }, "Unable to dynamically `import` or `require`")
    throw error
  }
}

export async function resolveFunction<T>(type: string | undefined, executor: T | string, name: string, projectDir?: string): Promise<T> {
  if (executor == null || typeof executor !== "string") {
    // is already function or explicitly ignored by user
    return executor
  }

  let p = executor as string
  if (p.startsWith(".")) {
    p = path.resolve(projectDir || process.cwd(), p)
  }

  try {
    // First try project context resolution (for pnpm compatibility)
    if (projectDir && !path.isAbsolute(p)) {
      const resolved = resolveFromProject({
        projectDir,
        moduleSpecifier: p,
        optional: true,
      })
      if (resolved !== null) {
        p = resolved
      }
    }

    // Fallback to standard resolution
    if (!path.isAbsolute(p)) {
      p = require.resolve(p)
    }
  } catch (e: any) {
    debug(e)
    p = path.resolve(projectDir || process.cwd(), p)
  }

  const m: any = await resolveModule(type, p)
  const namedExport = m[name]
  if (namedExport == null) {
    return m.default || m
  } else {
    return namedExport
  }
}

// Re-export for convenience
export { resolveFromProject, moduleExistsInProject } from "./projectModuleResolver"
