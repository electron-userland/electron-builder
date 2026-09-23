import { afterEach, describe, test } from "vitest"
import { isRetriableInstallError } from "app-builder-lib/src/util/installOrRebuild.js"

// isRetriableInstallError reads process.platform at call time, so we toggle it per test rather than
// re-importing the module.
const originalPlatform = process.platform

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: p, configurable: true })
}

afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
})

describe("isRetriableInstallError", () => {
  test("retries transient network errors on any platform", ({ expect }) => {
    setPlatform("linux")
    for (const code of ["ENOTFOUND", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED"]) {
      expect(isRetriableInstallError(`npm error ${code} request to registry failed`)).toBe(true)
    }
  })

  test("retries the Windows cmd.exe batch-file race (spurious exit after a successful install)", ({ expect }) => {
    setPlatform("win32")
    // Verbatim shape of the ExecError thrown from the failing CI run: npm completed ("up to date,
    // audited 1 package"), but cmd.exe still exited 1 with "The batch file cannot be found.".
    const ciMessage = [
      "C:\\hostedtoolcache\\windows\\node\\22.22.3\\x64\\npm.CMD process failed ERR_ELECTRON_BUILDER_CANNOT_EXECUTE",
      "Exit code:\n1",
      "Output:\n\nup to date, audited 1 package in 439ms\n\nfound 0 vulnerabilities",
      "Error output:\nThe batch file cannot be found.",
    ].join("\n")
    expect(isRetriableInstallError(ciMessage)).toBe(true)
  })

  test("does NOT match the batch-file message off Windows (win32-guarded)", ({ expect }) => {
    setPlatform("darwin")
    expect(isRetriableInstallError("The batch file cannot be found.")).toBe(false)
    setPlatform("linux")
    expect(isRetriableInstallError("The batch file cannot be found.")).toBe(false)
  })

  test("fails fast on a real install error (no added retry latency)", ({ expect }) => {
    setPlatform("win32")
    expect(isRetriableInstallError("npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/foo")).toBe(false)
    expect(isRetriableInstallError("npm error ERESOLVE unable to resolve dependency tree")).toBe(false)
    expect(isRetriableInstallError("EACCES: permission denied")).toBe(false)
  })

  test("empty message is not retriable", ({ expect }) => {
    setPlatform("win32")
    expect(isRetriableInstallError("")).toBe(false)
  })
})
