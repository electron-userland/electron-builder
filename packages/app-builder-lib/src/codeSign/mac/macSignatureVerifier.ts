import { exec, Executables, InvalidConfigurationError } from "builder-util"
import { stripVTControlCharacters } from "util"

/**
 * Read-back checks of macOS signatures, shared by the `forceCodeSigning` build checks and `electron-builder verify`.
 * Each returns `null` when the check passes, or the tool's complaint; none throws on a bad signature. They run Apple's
 * tools, so they work on macOS only. Each tool is started by absolute path, from `toolsets.executables` or its default
 * location (see {@link Executables}); a tool that cannot be located is an `InvalidConfigurationError`, not a complaint.
 */

/** The option keywords of `codesign --strict=<options>`. */
const CODESIGN_STRICT_OPTIONS: Readonly<Record<string, string>> = { all: "all", symlinks: "symlinks", sideband: "sideband" }

/**
 * The `--strict` argument for `strictVerify`: `true` is `--strict`, `false` none, and a string a comma-separated list of
 * {@link CODESIGN_STRICT_OPTIONS}, which is rebuilt from those keywords so that no configuration text reaches the command line.
 */
function codesignStrictArgument(strict: boolean | string): string | null {
  if (strict === false) {
    return null
  }
  if (strict === true) {
    return "--strict"
  }
  const options = strict.split(",").map(it => {
    const keyword = it.trim()
    if (!Object.prototype.hasOwnProperty.call(CODESIGN_STRICT_OPTIONS, keyword)) {
      throw new InvalidConfigurationError(
        `mac.sign.strictVerify has ${JSON.stringify(strict)}, but codesign --strict accepts only true, false or a comma-separated list of ${Object.keys(CODESIGN_STRICT_OPTIONS).join(", ")}`
      )
    }
    return CODESIGN_STRICT_OPTIONS[keyword]
  })
  return `--strict=${options.join(",")}`
}

/**
 * `codesign --verify` of an app bundle (`deep`) or a single file such as a DMG. `strict` mirrors @electron/osx-sign's
 * `strictVerify`: `true` (the default) adds `--strict`, `false` leaves it out, and a list of option keywords is passed as
 * `--strict=<options>` (an unknown keyword is an `InvalidConfigurationError`). Any valid signature passes, including ad-hoc
 * and self-signed ones.
 */
export async function verifyMacCodeSignature(file: string, options: { readonly deep: boolean; readonly strict?: boolean | string | null }): Promise<string | null> {
  const args = ["--verify"]
  if (options.deep) {
    args.push("--deep")
  }
  const strict = codesignStrictArgument(options.strict ?? true)
  if (strict != null) {
    args.push(strict)
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
