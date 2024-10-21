import { exec, log, retry } from "builder-util"

export async function hdiUtil(args: string[]) {
  return retry(
    () => exec("hdiutil", args),
    5,
    5000,
    2000,
    0,
    (delay: number, error: Error) => {
      log.error({ args, error: (error.message || error).toString() }, `unable to execute hdiutil, another attempt in ${delay / 1000} seconds`)
      return true
    }
  )
}
