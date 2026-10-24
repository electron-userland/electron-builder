// vi.mock calls are hoisted to the top by vitest's transformer.
// They must appear before any imports that depend on them.
import { afterAll, afterEach, expect, vi, type TestContext } from "vitest"

vi.mock("child_process", async importOriginal => {
  const mod = await importOriginal<typeof import("child_process")>()
  return { ...mod, execFile: vi.fn() }
})

import { readAuthenticodeSignerWithPowerShell } from "app-builder-lib/src/codeSign/win/authenticodeSignature"
import { execFile } from "child_process"
import type { Logger } from "electron-updater/src/types"
import { verifySignature } from "electron-updater/src/windowsExecutableCodeSignatureVerifier"
import * as fs from "fs/promises"
import * as path from "path"
import { cleanupWindowsSignedFixture, createSignedExecutable, getWindowsSignedFixture } from "../helpers/windowsSignedFixture"

// PowerShell runs in Constrained Language Mode under AppLocker / WDAC script enforcement, where e.g. assigning
// [Console]::OutputEncoding fails (https://github.com/electron-userland/electron-builder/issues/6917) — the error on stderr
// would reject every update. These tests run the production script with the session switched to Constrained Language Mode
// first: the language checks enforced CLM applies to the -EncodedCommand text all read the session language mode. A
// machine-wide __PSLockdownPolicy (the only other way without a real policy) would affect every PowerShell on the runner.
// Not reproduced: file trust (the in-box modules imported by the script are trusted under a real policy anyway).
const CLM = "$ExecutionContext.SessionState.LanguageMode = 'ConstrainedLanguage'; "
// 😀 is a surrogate pair, ’ is a PowerShell quote character
const NON_ASCII = "İlker Pálfi 你好 😀 D’Andre"
// non-ASCII only by a character that case-folds to ASCII ("İ" to "i"): a case-insensitive -match would print it unescaped
const FOLDABLE_ONLY = "İlker"

function inConstrainedLanguage(args: ReadonlyArray<string>): Array<string> {
  const index = args.indexOf("-EncodedCommand")
  const script = Buffer.from(args[index + 1], "base64").toString("utf16le")
  return [...args.slice(0, index + 1), Buffer.from(CLM + script, "utf16le").toString("base64"), ...args.slice(index + 2)]
}

async function setup() {
  vi.clearAllMocks()
  const real = await vi.importActual<typeof import("child_process")>("child_process")
  // only the PowerShell scripts: the fixture's openssl calls (builder-util exec) go through the same mock
  vi.mocked(execFile).mockImplementation(((file: string, args: Array<string>, options: any, callback: any) =>
    real.execFile(file, args.includes("-EncodedCommand") ? inConstrainedLanguage(args) : args, options, callback)) as any)
  const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  return { logger, real }
}

async function unsignedFileInNonAsciiDirectory(parent: string, directoryName = NON_ASCII): Promise<string> {
  const dir = path.join(parent, directoryName)
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, "update.exe")
  await fs.writeFile(file, Buffer.from("not a PE"))
  return file
}

describe.ifWindows("Windows update signature verifier in PowerShell Constrained Language Mode (e2e)", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })
  afterAll(() => cleanupWindowsSignedFixture())

  test("canary: switching the session language mode enforces Constrained Language Mode on this runner", { timeout: 90_000 }, async () => {
    const { real } = await setup()
    const script = CLM + "try { [Console]::Title = 'x' } catch { $_.FullyQualifiedErrorId }; $ExecutionContext.SessionState.LanguageMode"
    const powershell = path.join(process.env.SystemRoot!, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    const args = ["-NoProfile", "-NonInteractive", "-InputFormat", "None", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")]
    const stdout = await new Promise<string>((resolve, reject) => {
      real.execFile(powershell, args, { encoding: "utf8" }, (error, out) => (error == null ? resolve(out) : reject(error)))
    })
    expect(stdout.split(/\r?\n/).filter(it => it.length > 0)).toEqual(["PropertySetterNotSupportedInConstrainedLanguage", "ConstrainedLanguage"])
  })

  test.for([NON_ASCII, FOLDABLE_ONLY])(
    "an unsigned file in the directory %s is a failure result (not a stderr rejection), reporting its path losslessly",
    { timeout: 90_000 },
    async (directoryName, { tmpDir }) => {
      const { logger } = await setup()
      const file = await unsignedFileInNonAsciiDirectory(await tmpDir.createTempDir(), directoryName)
      const result = await verifySignature(["CN=Any Publisher"], file, logger)
      expect(result.response).toBe("failure")
      const message = result.response === "failure" ? result.message : ""
      const info = JSON.parse(message.substring(message.indexOf("raw info: ") + "raw info: ".length))
      expect(path.normalize(info.Path)).toBe(path.normalize(file))
    }
  )

  // A cmdlet error is caught by the script: written to stderr escaped like the output, with exit code 1.
  test("a cmdlet error (missing file) rejects with exit code 1 and ASCII-only error text", { timeout: 90_000 }, async ({ tmpDir }) => {
    const { logger } = await setup()
    // the error text names the path, whose non-ASCII characters must arrive escaped
    const missing = path.join(path.dirname(await unsignedFileInNonAsciiDirectory(await tmpDir.createTempDir())), "missing.exe")
    const error: any = await verifySignature(["CN=Any Publisher"], missing, logger).then(
      () => null,
      (e: any) => e
    )
    expect(error?.code).toBe("ERR_UPDATER_SIGNATURE_UNVERIFIABLE")
    expect(error.message).toContain("Get-AuthenticodeSignature failed with exit code 1")
    expect([...error.message].every((c: string) => c.charCodeAt(0) < 128)).toBe(true)
    // the build-time check reads the signer with the same script
    expect(await readAuthenticodeSignerWithPowerShell(missing)).toMatchObject({ type: "unreadable", reason: expect.stringContaining("exited with code 1") })
  })

  test("a really-signed exe in a non-ASCII directory verifies (Valid + LiteralPath + DN match)", { timeout: 120_000 }, async (context: TestContext) => {
    const { logger } = await setup()
    const fixture = await getWindowsSignedFixture()
    if (fixture == null) {
      context.skip()
      return
    }
    const dir = path.join(await context.tmpDir.createTempDir(), NON_ASCII)
    await fs.mkdir(dir, { recursive: true })
    const exe = await createSignedExecutable(fixture, dir)
    expect(await verifySignature([fixture.subject], exe, logger)).toEqual({ response: "success" })
    // the build-time check reads the signer with the same script
    expect(await readAuthenticodeSignerWithPowerShell(exe)).toMatchObject({ type: "signed", subject: fixture.subject })
  })
})
