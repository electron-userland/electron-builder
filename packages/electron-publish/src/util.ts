import { log } from "builder-util"

export const trimStringWithWarn = (str: string, maxLength: number, warnMessage: string): string => {
  if (str.length <= maxLength) {
    return str
  }
  log.warn({ length: str.length, maxLength }, warnMessage)
  return str.substring(0, maxLength)
}