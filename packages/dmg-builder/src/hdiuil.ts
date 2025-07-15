import { exec, log, retry } from "builder-util"

/**
 * Table of hdiutil error codes that are transient and can be retried.
 * These codes are typically related to resource availability or temporary issues.
 *
| Code    | Meaning                          | Why Retry?                                           |
| ------- | -------------------------------- | ---------------------------------------------------- |
| `1`     | Generic error                    | Can occur from brief race conditions or temp issues. |
| `16`    | **Resource busy**                | Volume is in use — wait and retry often works.       |
| `35`    | **Operation timed out**          | System delay or timeout — retry after a short delay. |
| `256`   | Volume in use or unmount failure | Same as 16 — usually resolves after retry.           |
| `49153` | Volume not mounted yet           | Attach may be too fast — retry after delay.          |
| `-5341` | Disk image too small             | Retry *after fixing* with a larger `-size`.          |
| `-5342` | Specified size too small         | Same as above — retry if size is corrected.          |
 *
 */
export const hdiutilTransientExitCodes = new Set([1, 16, 35, 256, 49153])

export function explainHdiutilError(errorCode: number): string {
  const code = errorCode.toString()
  const messages: Record<string, string> = {
    "0": "Success: The hdiutil command completed without error.",
    "1": "Generic error: The operation failed, but the reason is not specific. Check command syntax or permissions.",
    "2": "No such file or directory: Check if the specified path exists.",
    "6": "Disk image to resize is not currently attached or not recognized as a valid block device by macOS.",
    "8": "Exec format error: The file might not be a valid disk image.",
    "16": "Resource busy: The volume is in use. Try closing files or processes and retry.",
    "22": "Invalid argument: One or more arguments passed to hdiutil are incorrect.",
    "35": "Operation timed out: The system was too slow or unresponsive. Try again.",
    "36": "I/O error: There was a problem reading or writing to disk. Check disk health.",
    "100": "Image-related error: The disk image may be corrupted or invalid.",
    "256": "Volume is busy or could not be unmounted. Try again after closing files.",
    "49153": "Volume not mounted yet: The image may not have been fully attached.",
    "-5341": "Disk image too small: hdiutil could not fit the contents. Increase the image size.",
    "-5342": "Specified size too small: Disk image creation failed due to insufficient size.",
  }

  return messages[code] ?? `Unknown error (code ${code}): Refer to hdiutil documentation or run with -verbose for details by rerunning with env var DEBUG_DEMB=true.`
}

const shouldRetry = (args: string[]) => (error: any) => {
  const code = error.code ?? -1
  const stderr = error.stderr?.toString() || ""
  const stdout = error.stdout?.toString() || ""
  const output = `${stdout} ${stderr}`.trim()

  const willRetry = hdiutilTransientExitCodes.has(code.toString())
  log.warn({ willRetry, args, code, output }, `hdiutil error: ${explainHdiutilError(code)}`)

  return willRetry
}

export function hdiUtil(args: string[]): Promise<string | null> {
  return retry(() => exec("hdiutil", args), {
    retries: 5,
    interval: 5000,
    backoff: 2000,
    shouldRetry: shouldRetry(args),
  })
}
