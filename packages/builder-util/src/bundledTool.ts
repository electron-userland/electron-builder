import { getBinFromGithub } from "./binDownload"

// 2 minutes
export const EXEC_TIMEOUT = {timeout: 120 * 1000}

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

export function getLinuxToolsPath() {
  //noinspection SpellCheckingInspection
  return getBinFromGithub("linux-tools", "mac-10.12.3", "SQ8fqIRVXuQVWnVgaMTDWyf2TLAJjJYw3tRSqQJECmgF6qdM7Kogfa6KD49RbGzzMYIFca9Uw3MdsxzOPRWcYw==")
}