import { release as osRelease } from "os"

/** The Darwin kernel release of a macOS host (`os.release()`, e.g. `"24.1.0"` on macOS 15.1). */
export function getDarwinRelease(): string {
  return osRelease()
}

let glibcVersion: string | null | undefined

/**
 * The glibc version the running Node.js process is linked against at runtime (e.g. `"2.39"`), or `null` when the host is not
 * Linux or its libc is not glibc (musl on Alpine, …), or the version cannot be determined.
 */
export function getGlibcRuntimeVersion(): string | null {
  if (glibcVersion === undefined) {
    glibcVersion = readGlibcRuntimeVersion()
  }
  return glibcVersion
}

function readGlibcRuntimeVersion(): string | null {
  // `excludeNetwork` (Node.js 20.13 / 22.0) is missing from the @types/node in use
  const report: (NodeJS.ProcessReport & { excludeNetwork?: boolean }) | undefined = process.platform === "linux" ? process.report : undefined
  if (report == null) {
    return null
  }
  const excludeNetwork = report.excludeNetwork
  try {
    // the reverse DNS lookups for the process's open sockets are the slow part of a diagnostic report, and the header needs none of it
    report.excludeNetwork = true
    const header = (report.getReport() as { header?: { glibcVersionRuntime?: unknown } }).header
    const version = header?.glibcVersionRuntime
    return typeof version === "string" && version.length > 0 ? version : null
  } catch {
    return null
  } finally {
    report.excludeNetwork = excludeNetwork
  }
}
