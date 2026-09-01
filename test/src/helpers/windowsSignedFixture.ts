import { copyFile, writeFile } from "fs/promises"
import * as path from "path"
import { TmpDir } from "temp-file"
import { vi } from "vitest"
import { createSelfSignedCodeSigningIdentity } from "./selfSignedIdentity"

// Real-certificate Windows signing fixture for e2e tests of the executable signature verifier.
//
// It provisions ONE ephemeral self-signed code-signing certificate per test file (via the existing
// OpenSSL-based selfSignedIdentity helper), installs its public part into `Cert:\LocalMachine\Root` so that
// Get-AuthenticodeSignature reports `Valid` (Status 0), and signs per-test copies of a real system PE with
// Set-AuthenticodeSignature. Installing into the machine Root store requires elevation — GitHub-hosted
// Windows runners are admin and ephemeral, so store pollution is contained; on any provisioning failure
// (non-admin, no openssl, ...) getWindowsSignedFixture() resolves null so callers can dynamically skip.
// For local hygiene, cleanupWindowsSignedFixture() removes the installed certificate by thumbprint.
//
// Parallel-safety: certificate generation + store install are machine-global and therefore live behind a
// single lazily-initialized module-level idempotent promise (vitest runs a test file in one worker, so this
// is initialized at most once per file, whatever order tests run in). No test-visible mutable state is fed
// by hooks — each test signs its own executable copy inside its own per-test tmpDir.

export interface WindowsSignedFixture {
  /** Certificate Subject exactly as PowerShell/.NET reports it (RDN order may differ from the OpenSSL request order). */
  readonly subject: string
  /** The CN attribute alone, for CN-only publisherNames matching. */
  readonly commonName: string
  /** SHA-1 thumbprint of the certificate installed into LocalMachine\Root — used for cleanup. */
  readonly thumbprint: string
  /** Absolute path of the PFX (empty password) used by Set-AuthenticodeSignature. */
  readonly pfxPath: string
}

export const FIXTURE_COMMON_NAME = "Electron Builder Verifier Test"
export const FIXTURE_ADDITIONAL_DN_FIELDS = { O: "EB Test Org", C: "US" } as const

let fixturePromise: Promise<WindowsSignedFixture | null> | undefined
let fixtureTmpDir: TmpDir | undefined

// Doubles ASCII and Unicode single-quote variants (U+2018–U+201B) for embedding in a PowerShell
// single-quoted string — the same escaping rule windowsExecutableCodeSignatureVerifier.ts applies.
function psQuote(value: string): string {
  return `'${value.replace(/['\u2018\u2019\u201A\u201B]/g, "$&$&")}'`
}

// Runs a script with real PowerShell, bypassing the test file's vi.mock("child_process") — the mocks'
// implementations are cleared between tests (and before afterAll), so this must never go through them.
// PowerShell 5.1 compatible; -NonInteractive + -EncodedCommand, no prompts, throws on non-zero exit.
// Microsoft.PowerShell.Security (Set-AuthenticodeSignature) is imported explicitly by its $PSHOME path,
// mirroring the production verifier: PSModulePath is stripped from the env below, and without it module
// AUTO-loading fails on Windows Server 2025 runners ("the module could not be loaded", CouldNotAutoloadMatchingModule).
async function runPowerShell(script: string, timeout: number): Promise<string> {
  const { execFileSync } = await vi.importActual<typeof import("child_process")>("child_process")
  const fullScript = `$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; Import-Module "$PSHOME\\Modules\\Microsoft.PowerShell.Security"; $OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8; ${script}`
  const encodedCommand = Buffer.from(fullScript, "utf16le").toString("base64")
  const env = { ...process.env }
  delete env.PSModulePath
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-InputFormat", "None", "-EncodedCommand", encodedCommand], {
    shell: false,
    env,
    timeout,
  }).toString("utf8")
}

async function createFixture(): Promise<WindowsSignedFixture> {
  fixtureTmpDir = new TmpDir("windows-signed-fixture")
  // Empty p12 password: matches the existing Windows signing identity convention (see SelfSignedIdentityOptions)
  // and avoids any chance of an interactive password prompt on the PowerShell side.
  const identity = await createSelfSignedCodeSigningIdentity(FIXTURE_COMMON_NAME, fixtureTmpDir, {
    password: "",
    additionalDnFields: FIXTURE_ADDITIONAL_DN_FIELDS,
  })
  const dir = await fixtureTmpDir.createTempDir({ prefix: "windows-signed-fixture" })
  const pfxPath = path.join(dir, "verifier-test.pfx")
  await writeFile(pfxPath, Buffer.from(identity.p12Base64, "base64"))

  // Install the PUBLIC certificate into LocalMachine\Root (self-signed, so Root accepts it) and echo
  // "<thumbprint>|<subject>". X509Certificate2::new never prompts (unlike Get-PfxCertificate).
  const out = await runPowerShell(
    `$pfx = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(${psQuote(pfxPath)}, '', 'Exportable'); ` +
      `$publicCert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($pfx.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)); ` +
      `$store = [System.Security.Cryptography.X509Certificates.X509Store]::new([System.Security.Cryptography.X509Certificates.StoreName]::Root, [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine); ` +
      `$store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite); ` +
      `$store.Add($publicCert); ` +
      `$store.Close(); ` +
      `[Console]::Out.Write($pfx.Thumbprint + '|' + $pfx.Subject)`,
    60_000
  )
  const separatorIndex = out.indexOf("|")
  if (separatorIndex <= 0) {
    throw new Error(`unexpected certificate install output: ${out}`)
  }
  return {
    subject: out.substring(separatorIndex + 1).trim(),
    commonName: FIXTURE_COMMON_NAME,
    thumbprint: out.substring(0, separatorIndex).trim(),
    pfxPath,
  }
}

/**
 * Resolves the (machine-global, lazily provisioned) signing fixture, or null when provisioning failed —
 * callers should `context.skip()` on null, mirroring the existing notepad/symlink dynamic-skip guards.
 */
export function getWindowsSignedFixture(): Promise<WindowsSignedFixture | null> {
  if (fixturePromise == null) {
    fixturePromise = createFixture().catch(error => {
      console.warn(`skipping real-certificate verifier e2e tests — cannot provision signing fixture: ${error.message ?? error}`)
      return null
    })
  }
  return fixturePromise
}

/**
 * Copies a real, known-good system PE (cmd.exe — Set-AuthenticodeSignature refuses non-PE files) to
 * `directory/<name>` and Authenticode-signs the copy with the fixture certificate. Throws when signing does
 * not produce a `Valid` signature: once the fixture provisioned successfully, a signing failure is a real bug.
 */
export async function createSignedExecutable(fixture: WindowsSignedFixture, directory: string, name = "signed-update.exe"): Promise<string> {
  const targetPath = path.join(directory, name)
  await copyFile(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "cmd.exe"), targetPath)
  await runPowerShell(
    `$pfx = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(${psQuote(fixture.pfxPath)}, '', 'Exportable'); ` +
      `$result = Set-AuthenticodeSignature -LiteralPath ${psQuote(targetPath)} -Certificate $pfx -HashAlgorithm SHA256; ` +
      `if ($result.Status -ne 'Valid') { throw ('signing failed: ' + $result.Status + ' ' + $result.StatusMessage) }`,
    60_000
  )
  return targetPath
}

/**
 * Removes the fixture certificate from LocalMachine\Root by thumbprint and deletes the PFX. Failures are
 * only warned about — the store entry is ephemeral on CI, and teardown must not fail the suite.
 */
export async function cleanupWindowsSignedFixture(): Promise<void> {
  if (fixturePromise == null) {
    return
  }
  const fixture = await fixturePromise
  fixturePromise = undefined
  try {
    if (fixture != null) {
      await runPowerShell(
        `$store = [System.Security.Cryptography.X509Certificates.X509Store]::new([System.Security.Cryptography.X509Certificates.StoreName]::Root, [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine); ` +
          `$store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite); ` +
          `foreach ($cert in $store.Certificates.Find([System.Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint, ${psQuote(fixture.thumbprint)}, $false)) { $store.Remove($cert) }; ` +
          `$store.Close()`,
        60_000
      )
    }
  } catch (error: any) {
    console.warn(`failed to remove fixture certificate from LocalMachine\\Root: ${error.message ?? error}`)
  } finally {
    try {
      await fixtureTmpDir?.cleanup()
    } catch (error: any) {
      console.warn(`failed to clean up fixture temp dir: ${error.message ?? error}`)
    }
    fixtureTmpDir = undefined
  }
}
