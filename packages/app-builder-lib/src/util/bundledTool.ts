export interface ToolInfo {
  path: string
  env?: any
}

export function computeEnv(oldValue: string | null | undefined, newValues: Array<string>): string {
  const parsedOldValue = oldValue ? oldValue.split(":") : []
  return newValues.concat(parsedOldValue).filter(it => it.length > 0).join(":")
}

export function computeToolEnv(libPath: Array<string>): any {
  // noinspection SpellCheckingInspection
  return {
    ...process.env,
    DYLD_LIBRARY_PATH: computeEnv(process.env.DYLD_LIBRARY_PATH, libPath)
  }
}