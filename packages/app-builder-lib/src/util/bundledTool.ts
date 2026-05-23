import { Nullish } from "builder-util-runtime"

export interface ToolInfo {
  path: string
  env?: any
  /** On Windows: if set, invoke via `powershell.exe -EncodedCommand` to avoid CMD argument mangling with paths */
  psScript?: string
}

export function computeEnv(oldValue: string | Nullish, newValues: Array<string>): string {
  const parsedOldValue = oldValue ? oldValue.split(":") : []
  return newValues
    .concat(parsedOldValue)
    .filter(it => it.length > 0)
    .join(":")
}

export function computeToolEnv(libPath: Array<string>): any {
  // noinspection SpellCheckingInspection
  return {
    ...process.env,
    DYLD_LIBRARY_PATH: computeEnv(process.env.DYLD_LIBRARY_PATH, libPath),
  }
}
