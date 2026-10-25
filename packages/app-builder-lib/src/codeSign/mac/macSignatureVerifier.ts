import { exec, Executables } from "builder-util"
import { stripVTControlCharacters } from "util"

/**
 * Read-back checks of macOS signatures, shared by the `forceCodeSigning` build checks and `electron-builder verify`.
 * Each returns `null` when the check passes, or the tool's complaint; none throws on a bad signature. They run Apple's
 * tools, so they work on macOS only. Each tool is started by absolute path, from `toolsets.executables` or its default
 * location (see {@link Executables}); a tool that cannot be located is an `InvalidConfigurationError`, not a complaint.
 */

/**
 * `codesign --verify` of an app bundle (`deep`) or a single file such as a DMG. `strict` mirrors @electron/osx-sign's
 * `strictVerify`: `true` (the default) adds `--strict`, `false` leaves it out, a string is passed as `--strict=<value>`.
 * Any valid signature passes, including ad-hoc and self-signed ones.
 */
export async function verifyMacCodeSignature(file: string, options: { readonly deep: boolean; readonly strict?: boolean | string | null }): Promise<string | null> {
  const args = ["--verify"]
  if (options.deep) {
    args.push("--deep")
  }
  const strict = options.strict ?? true
  if (strict !== false) {
    args.push(strict === true ? "--strict" : `--strict=${strict}`)
  }
  args.push("--verbose=2", file)
  return await toolProblem(Executables.resolve("codesign"), args)
}

/** `stapler validate`: whether a valid notarization ticket is stapled to the app, pkg or DMG. */
export async function validateStapledTicket(file: string): Promise<string | null> {
  return await toolProblem(await Executables.stapler(), ["validate", file])
}

/**
 * `pkgutil --check-signature` of an installer package. Any signature counts, including one by an untrusted or expired
 * certificate; only a package without a signature, or with an invalid or revoked one, fails.
 */
export async function checkInstallerPackageSignature(pkg: string): Promise<string | null> {
  const pkgutil = Executables.resolve("pkgutil")
  let output: string
  try {
    output = await exec(pkgutil, ["--check-signature", pkg], undefined, false)
  } catch (e: any) {
    // pkgutil exits non-zero for some signed statuses too, so the decision is made on its Status line
    output = errorText(e)
  }
  return pkgutilSignatureProblem(output)
}

/**
 * The problem reported by `pkgutil --check-signature` output, or `null` when the package is signed. Decided on the
 * `Status:` line: "no signature", "invalid" and "revoked" fail, any other signed status passes.
 */
export function pkgutilSignatureProblem(output: string): string | null {
  const status = /Status:\s*(.+)/.exec(output)?.[1]?.trim()
  if (status == null) {
    return `pkgutil --check-signature reported no signature status: ${output.trim()}`
  }
  if (!status.startsWith("signed") || /\b(invalid|revoked)\b/i.test(status)) {
    return `pkgutil --check-signature: ${status}`
  }
  return null
}

async function toolProblem(file: string, args: Array<string>): Promise<string | null> {
  try {
    await exec(file, args, undefined, false)
    return null
  } catch (e: any) {
    return errorText(e)
  }
}

/** The message of a failed `exec` (which embeds the tool's output) without terminal colors. */
function errorText(e: any): string {
  return stripVTControlCharacters(String(e?.message ?? e)).trim()
}
