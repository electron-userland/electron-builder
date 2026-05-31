import { ExecError, statOrNull } from "builder-util"
import type { Defines } from "./Defines"

/**
 * Validates makensis stdout/stderr after a zero-exit run.
 *
 * NSIS can emit "Error:" lines on stderr and still exit 0 (e.g. disk-full
 * scenarios where the OS silently drops writes). Also checks the
 * "Install data: <written> / <expected> bytes" progress line for truncation.
 */
export function checkMakensisOutput(stdout: string, stderr: string, skipInstallDataCheck = false): void {
  const errorLines = stderr
    .split("\n")
    .map(l => l.trim())
    .filter(l => /^Error:/i.test(l))

  if (errorLines.length > 0) {
    throw new ExecError("makensis", 0, stdout, stderr)
  }

  if (!skipInstallDataCheck) {
    const match = /^Install data:\s*(\d+)\s*\/\s*(\d+)/im.exec(stdout)
    if (match != null) {
      const written = parseInt(match[1], 10)
      const expected = parseInt(match[2], 10)
      if (written < expected) {
        throw new Error(`makensis wrote ${written} of ${expected} install-data bytes — output may be truncated (check available disk space)`)
      }
    }
  }
}

/**
 * Verifies the generated installer is at least as large as the sum of the
 * embedded archive(s). An installer smaller than its payload is definitively
 * truncated regardless of the makensis exit code.
 *
 * Only runs when APP_64/APP_32/APP_ARM64 defines are present (i.e. normal,
 * non-portable installers). Skipped for the intermediate uninstaller build.
 */
export async function verifyInstallerSize(outFile: string, defines: Defines): Promise<void> {
  let archiveSize = 0
  for (const key of ["APP_64", "APP_32", "APP_ARM64"] as const) {
    const p = defines[key]
    if (typeof p === "string") {
      const s = await statOrNull(p)
      if (s != null) {
        archiveSize += s.size
      }
    }
  }

  if (archiveSize === 0) {
    return
  }

  const outStat = await statOrNull(outFile)
  const actualSize = outStat?.size ?? 0
  if (actualSize < archiveSize) {
    throw new Error(
      `Generated installer (${actualSize} bytes) is smaller than the embedded archive(s) (${archiveSize} bytes) — ` +
        `output may be incomplete. Check available disk space and try again.`
    )
  }
}
