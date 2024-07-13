import { exec, log, retry } from "builder-util"

export async function hdiUtil(args: string[]) {
  return retry(
    () => exec("hdiutil", args),
    5,
    1000,
    2000,
    0,
    (error: any) => {
      log.error({ args, code: error.code, error: (error.message || error).toString() }, "unable to execute hdiutil")
      return true
    }
  )
}
