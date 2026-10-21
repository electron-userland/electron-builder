import { ExecFileOptions } from "child_process"
import { parseDn } from "./rfc2253Parser.js"

// Windows Authenticode signature helpers shared by electron-updater (verifying a downloaded update at runtime) and
// electron-builder (checking the signed installer at build time). Moved unchanged from electron-updater's
// windowsExecutableCodeSignatureVerifier.

export function preparePowerShellExec(command: string, timeout?: number) {
  // $PSHOME is a PS automatic variable pointing to the trusted PS installation directory.
  // Using the full path for Import-Module avoids relying on PSModulePath for module discovery,
  // which prevents a shadowing attack via user-writable PSModulePath entries.
  // $env:PSModulePath is also cleared inside the script as belt-and-suspenders.
  // https://github.com/electron-userland/electron-builder/issues/2421
  // https://github.com/electron-userland/electron-builder/issues/2535
  // https://github.com/electron-userland/electron-builder/issues/7127
  //
  // PSModulePath is stripped from the inherited env on the Node side so it is never
  // present when PowerShell starts. Windows environment variable names are case-insensitive,
  // but plain JS object keys are not — spreading process.env produces a plain object — so
  // every casing of the key must be removed, not just the canonical one.
  //
  // UTF-8 output encoding is configured inside PowerShell itself rather than via `chcp 65001`
  // (which required cmd.exe as the host). Both $OutputEncoding and [Console]::OutputEncoding
  // must be set so that ConvertTo-Json emits UTF-8 when stdout is captured by Node.
  // https://github.com/electron-userland/electron-builder/issues/8162
  // Suppress progress-stream output (CLIXML) before the first Import-Module so that
  // "Preparing modules for first use." records are never written to stderr, which would
  // otherwise be misidentified as a command error by the stderr check in verifySignature.
  const script = `$ProgressPreference = 'SilentlyContinue'; Import-Module "$PSHOME\\Modules\\Microsoft.PowerShell.Security"; $env:PSModulePath = ""; $OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8; ${command}`
  const encodedCommand = Buffer.from(script, "utf16le").toString("base64")
  const args = ["-NoProfile", "-NonInteractive", "-InputFormat", "None", "-EncodedCommand", encodedCommand]
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === "psmodulepath") {
      delete env[key]
    }
  }
  const options: ExecFileOptions = {
    shell: false,
    timeout,
    env,
  }
  return ["powershell.exe", args, options] as const
}

export function escapePowerShellSingleQuotes(unescapedPath: string): string {
  // Single quotes in the path are doubled for PS single-quoted strings ('don''t' → don't).
  // PowerShell also treats the Unicode single-quote variants U+2018–U+201B (‘ ’ ‚ ‛) as
  // string delimiters, so they must be doubled as well or a path like C:\Users\D’Andre
  // would terminate the string early ("The string is missing the terminator").
  // Other PS metacharacters ($, `, \) are literal inside single-quoted strings.
  return unescapedPath.replace(/['\u2018\u2019\u201A\u201B]/g, "$&$&")
}

// Returns true if any entry in publisherNames matches the signing certificate subject.
export function matchPublisherName(data: any, publisherNames: string[], logger: { warn(message?: any): void }): boolean {
  const subject = parseDn(data.SignerCertificate.Subject)
  for (const name of publisherNames) {
    const dn = parseDn(name)
    if (dn.size) {
      // if we have a full DN, compare all values
      const allKeys = Array.from(dn.keys())
      if (allKeys.every(key => dn.get(key) === subject.get(key))) {
        return true
      }
    } else if (name === subject.get("CN")!) {
      logger.warn(`Signature validated using only CN ${name}. Please add your full Distinguished Name (DN) to publisherNames configuration`)
      return true
    }
  }
  return false
}

export function parseAuthenticodeSignatureOutput(out: string): any {
  const data = JSON.parse(out)
  delete data.PrivateKey
  delete data.IsOSBinary
  delete data.SignatureType
  const signerCertificate = data.SignerCertificate
  if (signerCertificate != null) {
    delete signerCertificate.Archived
    delete signerCertificate.Extensions
    delete signerCertificate.Handle
    delete signerCertificate.HasPrivateKey
    // duplicates data.SignerCertificate (contains RawData)
    delete signerCertificate.SubjectName
  }
  return data
}
