import { getBinFromGithub } from "electron-builder-util/out/binDownload"

// 2 minutes
export const EXEC_TIMEOUT = {timeout: 120 * 1000}

export interface ToolInfo {
  path: string
  env?: any
}

export function computeEnv(oldValue: string | null | undefined, newValues: Array<string>): string {
  let parsedOldValue = oldValue ? oldValue.split(":") : []
  return newValues.concat(parsedOldValue).filter(it => it.length > 0).join(":")
}

export function computeToolEnv(libPath: Array<string>): any {
  // noinspection SpellCheckingInspection
  return Object.assign({}, process.env, {
    DYLD_LIBRARY_PATH: computeEnv(process.env.DYLD_LIBRARY_PATH, libPath)
  })
}

export function getLinuxToolsPath() {
  //noinspection SpellCheckingInspection
  return getBinFromGithub("linux-tools", "mac-10.12", "DowDogHsS6X4a5au4r8T8qYprf7hqjfzcU7DL5oiD43jhZMfkQOjmFFYC1s7Lp9ARXp+sm8OJhuwaqCHMVGZYg==")
}