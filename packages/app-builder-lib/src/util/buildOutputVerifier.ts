import { isPathWithin } from "builder-util"
import { asArray, matchPublisherName, normalizePublicKeyList, UpdateInfo } from "builder-util-runtime"
import { readdir, readFile, realpath, stat } from "fs/promises"
import { load } from "js-yaml"
import * as path from "path"
import { checkInstallerPackageSignature, validateStapledTicket, verifyMacCodeSignature } from "../codeSign/mac/macSignatureVerifier.js"
import {
  AuthenticodeSignatureStatus,
  authenticodeSignatureStatusName,
  AuthenticodeSignerReader,
  isAuthenticodeFileType,
  readAuthenticodeSigner,
} from "../codeSign/win/authenticodeSignature.js"
import type { Configuration } from "../configuration.js"
import { shouldSignWindowsFile } from "../options/winOptions.js"
import { updateManifestPlatform, verifyUpdateManifestContent } from "../publish/updateManifestVerifier.js"
import { hashFile } from "./hash.js"

/**
 * - `verified` — the check passed
 * - `failed` — the check ran and failed
 * - `unverifiable` — the check cannot run here (e.g. codesign off macOS, no trust list to verify a manifest against)
 * - `skipped` — the configuration opts out of what the check verifies (e.g. `mac.notarize: false`)
 */
export type VerificationStatus = "verified" | "failed" | "unverifiable" | "skipped"

export interface VerificationResult {
  readonly status: VerificationStatus
  /** What was checked, e.g. "update manifest signature". */
  readonly check: string
  /** The file or directory the check is about. */
  readonly file: string
  readonly message: string
}

export interface VerifyBuildOutputOptions {
  /** The output directory of the build (`directories.output`). */
  readonly outDir: string
  /** The configuration of the build that produced the output: its opt-outs are honored. */
  readonly config: Configuration
  /** Reads Windows Authenticode signatures; defaults to {@link readAuthenticodeSigner}. */
  readonly readSigner?: AuthenticodeSignerReader
}

type PlatformKey = "mac" | "win" | "linux"
type MacConfigKey = "mac" | "mas" | "masDev"

// The app output directories of the targets: `<platform><-arch, unless it is the default arch>`, with `-unpacked` for Windows and
// Linux (PlatformPackager.computeAppOutDir) and the MAS target name for MAS (MacPackager.packMasTargets)
const ARCH_SUFFIX = "(?:-(?:ia32|x64|armv7l|arm64|universal))?"
const MAC_APP_DIR = new RegExp(`^(mac|mas|mas-dev)${ARCH_SUFFIX}$`)
const UNPACKED_APP_DIR = new RegExp(`^(win|linux)${ARCH_SUFFIX}-unpacked$`)
const MAC_CONFIG_KEYS: Readonly<Record<string, ReadonlyArray<MacConfigKey>>> = { mac: ["mac"], mas: ["mac", "mas"], "mas-dev": ["mac", "mas", "masDev"] }

interface PackagedApp {
  readonly platform: PlatformKey
  /** The `.app` bundle, or the `*-unpacked` directory. */
  readonly path: string
  readonly isMas: boolean
  /** The configuration blocks of a macOS app, in the order they cascade (`mac`, then `mas`, then `masDev`); empty for other platforms. */
  readonly macConfigKeys: ReadonlyArray<MacConfigKey>
  readonly updateConfigFile: string
  /** The parsed `app-update.yml`, or null when the app has none (it does not auto-update) or it cannot be read. */
  readonly updateConfig: { readonly trustedKeys: Array<string>; readonly publisherNames: Array<string> | null } | null
  /** Why `app-update.yml` cannot be read, or null. */
  readonly updateConfigProblem: string | null
}

interface Manifest {
  readonly file: string
  readonly platform: PlatformKey
  readonly content: string
  readonly info: UpdateInfo
}

const NOT_MANIFESTS = new Set(["app-update.yml", "builder-debug.yml", "builder-effective-config.yaml"])

/**
 * Verifies the built artifacts in an output directory, the checks `forceCodeSigning` makes during a build plus what can
 * only be seen afterwards:
 * - every update manifest (`latest*.yml`, found by its shape) is signed by a key in the trust list (`updateManifestPublicKey`)
 *   of every packaged app of its platform, and each file it lists matches an artifact (sha512 and size);
 * - macOS (on macOS only): every `.app` has a valid code signature and, outside the Mac App Store, a stapled notarization
 *   ticket; a `.pkg` is signed (and notarized); a DMG with `dmg.sign: true` is signed;
 * - Windows: every installer, package and app executable carries a valid Authenticode signature (whose hash only Windows
 *   can validate), and the update installers match the `publisherName` electron-updater verifies them against.
 *
 * Opt-outs in `config` (`updateManifest: false`, `mac.notarize: false`, `win.sign: false`, `signExts` exclusions, ...)
 * turn the affected checks into `skipped` results, whatever the host.
 */
export async function verifyBuildOutput(options: VerifyBuildOutputOptions): Promise<Array<VerificationResult>> {
  // absolute, so that every path handed to codesign, stapler or pkgutil starts with "/": a file name of the output (which is not
  // trusted) such as "-v.pkg" never reaches them as an option
  const outDir = path.resolve(options.outDir)
  const { config } = options
  const { apps, files } = await discover(outDir)
  const results: Array<VerificationResult> = []
  for (const app of apps) {
    if (app.updateConfigProblem != null) {
      results.push({ status: "failed", check: "app update configuration", file: app.updateConfigFile, message: app.updateConfigProblem })
    }
  }

  const manifests: Array<Manifest> = []
  for (const file of files.filter(it => /\.ya?ml$/.test(it) && !NOT_MANIFESTS.has(path.basename(it)))) {
    const manifest = await readManifest(file)
    if (manifest != null) {
      manifests.push(manifest)
    }
  }

  const hashes = new Map<string, Promise<string>>()
  const sha512Of = (file: string) => {
    let hash = hashes.get(file)
    if (hash == null) {
      hash = hashFile(file)
      hashes.set(file, hash)
    }
    return hash
  }
  // the local files the Windows manifests point electron-updater at: their signer must match the embedded publisherName
  const windowsUpdateInstallers = new Set<string>()

  for (const manifest of manifests) {
    results.push(...verifyManifestSignature(manifest, apps, options))
    for (const { result, artifact } of await verifyManifestFiles(manifest, files, outDir, sha512Of)) {
      results.push(result)
      if (artifact != null && manifest.platform === "win") {
        windowsUpdateInstallers.add(artifact)
      }
    }
  }

  results.push(...(await verifyMacArtifacts(apps, files, outDir, config)))
  results.push(...(await verifyWindowsArtifacts(apps, files, config, options.readSigner ?? readAuthenticodeSigner, windowsUpdateInstallers)))
  return results
}

// ─── discovery ────────────────────────────────────────────────────────────────

// How deep below a target folder files are collected: a further publish provider's manifest of a target with its own folder is
// one level down (<outDir>/nsis-web/<provider>/latest.yml, see createUpdateInfoTasks)
const MAX_TARGET_DIR_DEPTH = 2

/**
 * Collects the regular files of a target folder and of its subfolders, up to {@link MAX_TARGET_DIR_DEPTH} levels down. The output is not
 * trusted: a symlink is never followed, and a folder whose real path is not inside the output folder is not read.
 */
async function collectTargetFiles(dir: string, realOutDir: string, depth: number, files: Array<string>): Promise<void> {
  if (!isPathWithin(realOutDir, await realpath(dir))) {
    return
  }
  for (const child of await readdir(dir, { withFileTypes: true })) {
    if (child.name.startsWith(".")) {
      continue
    }
    const childPath = path.join(dir, child.name)
    // Dirent types come from lstat: a symlink is neither a file nor a directory here
    if (child.isFile()) {
      files.push(childPath)
    } else if (child.isDirectory() && depth < MAX_TARGET_DIR_DEPTH) {
      await collectTargetFiles(childPath, realOutDir, depth + 1, files)
    }
  }
}

async function discover(outDir: string): Promise<{ apps: Array<PackagedApp>; files: Array<string> }> {
  const apps: Array<PackagedApp> = []
  const files: Array<string> = []
  const realOutDir = await realpath(outDir)
  for (const entry of await readdir(outDir, { withFileTypes: true })) {
    const entryPath = path.join(outDir, entry.name)
    if (entry.name.startsWith(".")) {
      continue
    }
    if (entry.isFile()) {
      files.push(entryPath)
      continue
    }
    // universal builds pack each arch into a temporary `*-temp` dir first
    if (!entry.isDirectory() || entry.name.endsWith("-temp")) {
      continue
    }

    const macDir = MAC_APP_DIR.exec(entry.name)
    const unpackedDir = UNPACKED_APP_DIR.exec(entry.name)
    if (macDir != null) {
      const macConfigKeys = MAC_CONFIG_KEYS[macDir[1]] ?? ["mac"]
      const isMas = macDir[1] !== "mac"
      for (const child of await readdir(entryPath, { withFileTypes: true })) {
        const childPath = path.join(entryPath, child.name)
        if (child.isDirectory() && child.name.endsWith(".app")) {
          apps.push(await readApp("mac", childPath, isMas, macConfigKeys, path.join(childPath, "Contents", "Resources", "app-update.yml")))
        } else if (child.isFile() && child.name.endsWith(".pkg")) {
          // the MAS installer is written next to the app
          files.push(childPath)
        }
      }
    } else if (unpackedDir != null) {
      const platform: PlatformKey = unpackedDir[1] === "win" ? "win" : "linux"
      apps.push(await readApp(platform, entryPath, false, [], path.join(entryPath, "resources", "app-update.yml")))
    } else {
      // nsis-web/, squirrel-windows*/, and the manifests of a further publish provider (<outDir>/<provider>/, <outDir>/nsis-web/<provider>/)
      await collectTargetFiles(entryPath, realOutDir, 0, files)
    }
  }
  return { apps, files }
}

async function readApp(platform: PlatformKey, appPath: string, isMas: boolean, macConfigKeys: ReadonlyArray<MacConfigKey>, updateConfigFile: string): Promise<PackagedApp> {
  const app = { platform, path: appPath, isMas, macConfigKeys, updateConfigFile }
  const problem = (updateConfigProblem: string): PackagedApp => ({ ...app, updateConfig: null, updateConfigProblem })
  let content: string
  try {
    // The output can be downloaded artifacts, which are not trusted: app-update.yml is read only as a regular file inside the app,
    // never through a symlink to another file on this machine (whose content a YAML error would print)
    const [appRealPath, configRealPath] = await Promise.all([realpath(appPath), realpath(updateConfigFile)])
    if (!isPathWithin(appRealPath, configRealPath)) {
      return problem("app-update.yml is a symlink that leads out of the app")
    }
    if (!(await stat(configRealPath)).isFile()) {
      return problem("app-update.yml is not a file")
    }
    content = await readFile(configRealPath, "utf8")
  } catch (e: any) {
    // ENOTDIR: a "resources" (or "Resources") that is a file, so there is no app-update.yml either
    if (e.code === "ENOENT" || e.code === "ENOTDIR") {
      return { ...app, updateConfig: null, updateConfigProblem: null }
    }
    throw e
  }
  let parsed: unknown
  try {
    parsed = load(content)
  } catch (e: any) {
    // the reason only: the message of a YAML error quotes the content
    return problem(`app-update.yml is not valid YAML (${e.reason ?? "cannot be parsed"})`)
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return problem("app-update.yml is not a YAML mapping")
  }
  const updateConfig = parsed as Record<string, unknown>
  const publisherNames =
    updateConfig.verifyUpdateCodeSignature === false || updateConfig.publisherName == null
      ? null
      : asArray(updateConfig.publisherName).filter((it): it is string => typeof it === "string")
  return {
    ...app,
    updateConfig: { trustedKeys: normalizePublicKeyList(updateConfig.updateManifestPublicKey as Parameters<typeof normalizePublicKeyList>[0]), publisherNames },
    updateConfigProblem: null,
  }
}

async function readManifest(file: string): Promise<Manifest | null> {
  const content = await readFile(file, "utf8")
  let info: any
  try {
    info = load(content)
  } catch {
    return null
  }
  if (info == null || typeof info !== "object" || typeof info.version !== "string" || !Array.isArray(info.files)) {
    return null
  }
  return { file, platform: updateManifestPlatform(file), content, info }
}

/** A platform-level value wins over the root one, as in the build (`PlatformPackager.updateManifestOptions`). */
function platformOption(config: Configuration, platform: PlatformKey, key: string): any {
  return (config as any)[platform]?.[key] ?? (config as any)[key]
}

// ─── update manifests ─────────────────────────────────────────────────────────

function verifyManifestSignature(manifest: Manifest, apps: Array<PackagedApp>, options: VerifyBuildOutputOptions): Array<VerificationResult> {
  const check = "update manifest signature"
  const result = (status: VerificationStatus, message: string): VerificationResult => ({ status, check, file: manifest.file, message })
  const updateManifest = platformOption(options.config, manifest.platform, "updateManifest")
  if (updateManifest === false) {
    return [result("skipped", "updateManifest is false in the configuration, so the manifest is not signed")]
  }

  // Only public keys are used: verify never loads a signing (private) key, from the configuration or the environment.
  // A deliberate cutover release is signed with a key outside the trust list it embeds (updateManifest.allowSigningKeyOutsideTrustList),
  // whose public key verify does not have.
  const cutover = (reason: string): VerificationResult =>
    result("skipped", `${reason}, which updateManifest.allowSigningKeyOutsideTrustList allows for a cutover release signed with a key outside the trust list`)

  const trustingApps: Array<{ app: PackagedApp; trustedKeys: Array<string> }> = []
  for (const app of apps) {
    if (app.platform === manifest.platform && !app.isMas && app.updateConfig != null) {
      trustingApps.push({ app, trustedKeys: app.updateConfig.trustedKeys })
    }
  }
  if (trustingApps.length === 0) {
    const keys = updateManifest?.publicKey == null ? [] : normalizePublicKeyList(updateManifest.publicKey)
    if (keys.length === 0) {
      return [
        result(
          "unverifiable",
          "no packaged app embeds a trust list (app-update.yml), and updateManifest.publicKey is not set in the configuration: set it to the public keys to verify the manifest with"
        ),
      ]
    }
    const verification = verifyUpdateManifestContent(manifest.content, keys)
    if (verification.ok) {
      return [result("verified", `signed by ${verification.keyId}, a key in the configuration (no packaged app was found to read the trust list from)`)]
    }
    return [
      updateManifest?.allowSigningKeyOutsideTrustList === true
        ? cutover(`not signed by a key of updateManifest.publicKey (${verification.reason})`)
        : result("failed", verification.reason),
    ]
  }

  return trustingApps.map(({ app, trustedKeys }) => {
    if (trustedKeys.length === 0) {
      return result("failed", `${path.relative(options.outDir, app.updateConfigFile)} embeds no updateManifestPublicKey, so installs of this build accept any update manifest`)
    }
    const verification = verifyUpdateManifestContent(manifest.content, trustedKeys)
    if (verification.ok) {
      return result("verified", `signed by ${verification.keyId}, which ${path.relative(options.outDir, app.updateConfigFile)} trusts`)
    }
    const reason = `not accepted by the trust list of ${path.relative(options.outDir, app.updateConfigFile)} (${verification.reason})`
    return updateManifest?.allowSigningKeyOutsideTrustList === true ? cutover(reason) : result("failed", reason)
  })
}

async function verifyManifestFiles(
  manifest: Manifest,
  files: Array<string>,
  outDir: string,
  sha512Of: (file: string) => Promise<string>
): Promise<Array<{ result: VerificationResult; artifact: string | null }>> {
  const check = "update manifest file"
  // the artifacts of a target with its own folder (nsis-web/) are there, also for the manifest of a further provider (nsis-web/<provider>/)
  const parts = path.relative(outDir, manifest.file).split(path.sep)
  const targetDir = parts.length > 1 ? path.join(outDir, parts[0]) : outDir
  const dirs = new Set([path.dirname(manifest.file), targetDir, outDir])
  const candidates = files.filter(it => dirs.has(path.dirname(it)) && !/\.(ya?ml|blockmap)$/.test(it))
  const verified: Array<{ result: VerificationResult; artifact: string | null }> = []
  for (const entry of manifest.info.files as Array<any>) {
    const name = typeof entry?.url === "string" ? entry.url : "(no url)"
    if (typeof entry?.sha512 !== "string") {
      verified.push({ result: { status: "failed", check, file: manifest.file, message: `files entry ${name} has no sha512` }, artifact: null })
      continue
    }
    // matched by hash, not by name: a GitHub manifest lists the safe artifact name, which can differ from the local file name
    let artifact: string | null = null
    for (const candidate of candidates) {
      if (typeof entry.size === "number" && (await stat(candidate)).size !== entry.size) {
        continue
      }
      if ((await sha512Of(candidate)) === entry.sha512) {
        artifact = candidate
        break
      }
    }
    verified.push({
      result:
        artifact == null
          ? {
              status: "failed",
              check,
              file: manifest.file,
              message: `no artifact matches the sha512${typeof entry.size === "number" ? " and size" : ""} of ${name}: it is missing, or it was changed after the manifest was written`,
            }
          : { status: "verified", check, file: manifest.file, message: `${name} matches ${path.relative(outDir, artifact)}` },
      artifact,
    })
  }
  return verified
}

// ─── macOS ────────────────────────────────────────────────────────────────────

/**
 * The `sign` option of a macOS app, cascaded over its configuration blocks as the build does (a later block wins, and sign objects
 * are merged): whether it opts out of signing (`sign: null` or `sign.identity: null`), and its `strictVerify`.
 */
function macSigning(config: Configuration, keys: ReadonlyArray<MacConfigKey>): { signingOptOut: string | null; strict: boolean | string | null | undefined } {
  let sign: unknown = undefined
  let where = "mac.sign"
  for (const key of keys) {
    const value: unknown = config[key]?.sign
    if (value === undefined) {
      continue
    }
    where = `${key}.sign`
    sign = isPlainSignObject(value) && isPlainSignObject(sign) ? { ...sign, ...value } : value
  }
  if (sign === null || (isPlainSignObject(sign) && sign.identity === null)) {
    return { signingOptOut: `${where} (or its identity) is null in the configuration`, strict: undefined }
  }
  const strict = isPlainSignObject(sign) ? sign.strictVerify : undefined
  return { signingOptOut: null, strict: typeof strict === "boolean" || typeof strict === "string" ? strict : undefined }
}

function isPlainSignObject(value: unknown): value is { readonly identity?: unknown; readonly strictVerify?: unknown } {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

async function verifyMacArtifacts(apps: Array<PackagedApp>, files: Array<string>, outDir: string, config: Configuration): Promise<Array<VerificationResult>> {
  const macApps = apps.filter(it => it.platform === "mac")
  const pkgs = files.filter(it => it.endsWith(".pkg"))
  const dmgs = config.dmg?.sign === true ? files.filter(it => it.endsWith(".dmg") && path.dirname(it) === outDir) : []
  const notarizeDisabled = config.mac?.notarize === false
  const results: Array<VerificationResult> = []

  const run = async (check: string, file: string, optOut: string | null, task: () => Promise<string | null>) => {
    if (optOut != null) {
      results.push({ status: "skipped", check, file, message: optOut })
    } else if (process.platform !== "darwin") {
      results.push({ status: "unverifiable", check, file, message: `needs Apple's tools, which run on macOS only (this host is ${process.platform})` })
    } else {
      const problem = await task()
      results.push(problem == null ? { status: "verified", check, file, message: "valid" } : { status: "failed", check, file, message: problem })
    }
  }

  const notarizeOptOut = notarizeDisabled ? "mac.notarize is false in the configuration" : null
  for (const app of macApps) {
    // a MAS app is signed with its mas (and masDev) configuration, which cascades over mac
    const { signingOptOut, strict } = macSigning(config, app.macConfigKeys)
    await run("code signature", app.path, signingOptOut, () => verifyMacCodeSignature(app.path, { deep: true, strict }))
    if (!app.isMas) {
      await run("notarization ticket", app.path, signingOptOut ?? notarizeOptOut, () => validateStapledTicket(app.path))
    }
  }
  const signingOptOut = macSigning(config, ["mac"]).signingOptOut
  for (const pkg of pkgs) {
    await run("installer signature", pkg, null, () => checkInstallerPackageSignature(pkg))
    // the MAS installer (next to the app, in mas*/) goes to the App Store unnotarized
    if (path.dirname(pkg) === outDir) {
      await run("notarization ticket", pkg, notarizeOptOut, () => validateStapledTicket(pkg))
    }
  }
  for (const dmg of dmgs) {
    await run("code signature", dmg, signingOptOut, () => verifyMacCodeSignature(dmg, { deep: false }))
  }
  return results
}

// ─── Windows ──────────────────────────────────────────────────────────────────

async function verifyWindowsArtifacts(
  apps: Array<PackagedApp>,
  files: Array<string>,
  config: Configuration,
  readSigner: AuthenticodeSignerReader,
  updateInstallers: Set<string>
): Promise<Array<VerificationResult>> {
  const check = "Authenticode signature"
  const appExecutables: Array<string> = []
  for (const app of apps.filter(it => it.platform === "win")) {
    for (const entry of await readdir(app.path, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".exe")) {
        appExecutables.push(path.join(app.path, entry.name))
      }
    }
  }
  const targets = [...files.filter(it => isAuthenticodeFileType(it)), ...appExecutables]
  const publisherNameSets: Array<Array<string>> = []
  for (const app of apps) {
    const publisherNames = app.platform === "win" ? app.updateConfig?.publisherNames : null
    if (publisherNames != null) {
      publisherNameSets.push(publisherNames)
    }
  }
  const signingDisabled = config.win?.sign === false || config.win?.sign === null
  const results: Array<VerificationResult> = []

  for (const file of targets) {
    if (signingDisabled) {
      results.push({ status: "skipped", check, file, message: "win.sign is false in the configuration" })
      continue
    }
    if (!shouldSignWindowsFile(file, config.win?.signExts, true)) {
      results.push({ status: "skipped", check, file, message: "excluded from signing by win.signExts" })
      continue
    }

    const signer = await readSigner(file)
    if (signer.type === "unsigned") {
      results.push({ status: "failed", check, file, message: `carries no Authenticode signature (${signer.reason})` })
      continue
    }
    if (signer.type === "unreadable") {
      results.push({ status: "unverifiable", check, file, message: `the signature cannot be read on this host (${signer.reason})` })
      continue
    }
    if (signer.status === AuthenticodeSignatureStatus.HashMismatch) {
      results.push({ status: "failed", check, file, message: "the signature does not match the file (HashMismatch: it was modified after signing)" })
      continue
    }
    results.push(
      signer.status == null
        ? { status: "unverifiable", check, file, message: `signed by ${signer.subject}, but the signature hash can only be validated on Windows` }
        : { status: "verified", check, file, message: `signed by ${signer.subject} (${authenticodeSignatureStatusName(signer.status)})` }
    )

    if (updateInstallers.has(file)) {
      // matchPublisherName takes the parsed Get-AuthenticodeSignature output, as electron-updater passes it
      const signature = { SignerCertificate: { Subject: signer.subject } }
      for (const publisherNames of publisherNameSets) {
        results.push(
          matchPublisherName(signature, publisherNames)
            ? { status: "verified", check: "update publisher", file, message: `the signer matches publisherName ${publisherNames.join(" | ")}` }
            : {
                status: "failed",
                check: "update publisher",
                file,
                message: `the signer ${signer.subject} does not match publisherName ${publisherNames.join(" | ")} in app-update.yml, so electron-updater would reject this update`,
              }
        )
      }
    }
  }
  return results
}
