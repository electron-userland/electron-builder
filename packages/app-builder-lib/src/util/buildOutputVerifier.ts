import { derivePublicKeyPem, loadUpdateSigningKeys, parsePrivateKey } from "builder-util"
import { asArray, matchPublisherName, normalizePublicKeyList, UpdateInfo } from "builder-util-runtime"
import { readdir, readFile, stat } from "fs/promises"
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
import { verifyUpdateManifestContent } from "../publish/updateManifestVerifier.js"
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
  /** The project directory, against which a relative `updateManifest.signingKeyFile` resolves. */
  readonly projectDir: string
  /** The configuration of the build that produced the output: its opt-outs are honored. */
  readonly config: Configuration
  /** Reads Windows Authenticode signatures; defaults to {@link readAuthenticodeSigner}. */
  readonly readSigner?: AuthenticodeSignerReader
}

type PlatformKey = "mac" | "win" | "linux"

interface PackagedApp {
  readonly platform: PlatformKey
  /** The `.app` bundle, or the `*-unpacked` directory. */
  readonly path: string
  readonly isMas: boolean
  readonly updateConfigFile: string
  /** The parsed `app-update.yml`, or null when the app has none (it does not auto-update). */
  readonly updateConfig: { readonly trustedKeys: Array<string>; readonly publisherNames: Array<string> | null } | null
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
  const { outDir, config } = options
  const { apps, files } = await discover(outDir)
  const results: Array<VerificationResult> = []

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

async function discover(outDir: string): Promise<{ apps: Array<PackagedApp>; files: Array<string> }> {
  const apps: Array<PackagedApp> = []
  const files: Array<string> = []
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

    if (/^(mac|mas)/.test(entry.name)) {
      const isMas = entry.name.startsWith("mas")
      for (const child of await readdir(entryPath, { withFileTypes: true })) {
        const childPath = path.join(entryPath, child.name)
        if (child.isDirectory() && child.name.endsWith(".app")) {
          apps.push(await readApp("mac", childPath, isMas, path.join(childPath, "Contents", "Resources", "app-update.yml")))
        } else if (child.isFile() && child.name.endsWith(".pkg")) {
          // the MAS installer is written next to the app
          files.push(childPath)
        }
      }
    } else if (/^(win|linux).*-unpacked$/.test(entry.name)) {
      const platform: PlatformKey = entry.name.startsWith("win") ? "win" : "linux"
      apps.push(await readApp(platform, entryPath, false, path.join(entryPath, "resources", "app-update.yml")))
    } else {
      // nsis-web/, squirrel-windows*/, and the manifests of a second publish provider (<outDir>/<provider>/)
      for (const child of await readdir(entryPath, { withFileTypes: true })) {
        if (child.isFile()) {
          files.push(path.join(entryPath, child.name))
        }
      }
    }
  }
  return { apps, files }
}

async function readApp(platform: PlatformKey, appPath: string, isMas: boolean, updateConfigFile: string): Promise<PackagedApp> {
  let content: string
  try {
    content = await readFile(updateConfigFile, "utf8")
  } catch (e: any) {
    if (e.code === "ENOENT") {
      return { platform, path: appPath, isMas, updateConfigFile, updateConfig: null }
    }
    throw e
  }
  const parsed: any = load(content) ?? {}
  const publisherNames =
    parsed.verifyUpdateCodeSignature === false || parsed.publisherName == null ? null : asArray(parsed.publisherName).filter((it): it is string => typeof it === "string")
  return { platform, path: appPath, isMas, updateConfigFile, updateConfig: { trustedKeys: normalizePublicKeyList(parsed.updateManifestPublicKey), publisherNames } }
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
  const name = path.basename(file)
  const platform: PlatformKey = /-mac\.ya?ml$/.test(name) ? "mac" : /-linux(-[^.]+)?\.ya?ml$/.test(name) ? "linux" : "win"
  return { file, platform, content, info }
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

  const signingKeys = (): Array<string> => loadUpdateSigningKeys(updateManifest ?? undefined, options.projectDir).map(it => derivePublicKeyPem(parsePrivateKey(it)))
  // a deliberate cutover release is signed with a key outside the trust list it embeds (updateManifest.allowSigningKeyOutsideTrustList)
  const verifyCutover = (reason: string): VerificationResult => {
    const keys = signingKeys()
    if (keys.length === 0) {
      return result("skipped", `${reason}, which updateManifest.allowSigningKeyOutsideTrustList allows for a cutover release; no signing key is configured here to verify it with`)
    }
    const verification = verifyUpdateManifestContent(manifest.content, keys)
    return verification.ok
      ? result("verified", `${reason}; it verifies with the configured signing key ${verification.keyId} (updateManifest.allowSigningKeyOutsideTrustList)`)
      : result("failed", `${reason}, and it does not verify with the configured signing keys either: ${verification.reason}`)
  }

  const trustingApps = apps.filter(it => it.platform === manifest.platform && !it.isMas && it.updateConfig != null)
  if (trustingApps.length === 0) {
    const explicitKeys = updateManifest?.publicKey == null ? [] : normalizePublicKeyList(updateManifest.publicKey)
    const keys = explicitKeys.length > 0 ? explicitKeys : signingKeys()
    if (keys.length === 0) {
      return [
        result(
          "unverifiable",
          "no packaged app embeds a trust list (app-update.yml), and the configuration has no updateManifest.publicKey or signing key to verify the manifest with"
        ),
      ]
    }
    const verification = verifyUpdateManifestContent(manifest.content, keys)
    if (verification.ok) {
      return [result("verified", `signed by ${verification.keyId}, a key in the configuration (no packaged app was found to read the trust list from)`)]
    }
    return [
      updateManifest?.allowSigningKeyOutsideTrustList === true
        ? verifyCutover(`not signed by a key of updateManifest.publicKey (${verification.reason})`)
        : result("failed", verification.reason),
    ]
  }

  return trustingApps.map(app => {
    const trustedKeys = app.updateConfig!.trustedKeys
    if (trustedKeys.length === 0) {
      return result("failed", `${path.relative(options.outDir, app.updateConfigFile)} embeds no updateManifestPublicKey, so installs of this build accept any update manifest`)
    }
    const verification = verifyUpdateManifestContent(manifest.content, trustedKeys)
    if (verification.ok) {
      return result("verified", `signed by ${verification.keyId}, which ${path.relative(options.outDir, app.updateConfigFile)} trusts`)
    }
    const reason = `not accepted by the trust list of ${path.relative(options.outDir, app.updateConfigFile)} (${verification.reason})`
    return updateManifest?.allowSigningKeyOutsideTrustList === true ? verifyCutover(reason) : result("failed", reason)
  })
}

async function verifyManifestFiles(
  manifest: Manifest,
  files: Array<string>,
  outDir: string,
  sha512Of: (file: string) => Promise<string>
): Promise<Array<{ result: VerificationResult; artifact: string | null }>> {
  const check = "update manifest file"
  const dirs = new Set([path.dirname(manifest.file), outDir])
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

async function verifyMacArtifacts(apps: Array<PackagedApp>, files: Array<string>, outDir: string, config: Configuration): Promise<Array<VerificationResult>> {
  const macApps = apps.filter(it => it.platform === "mac")
  const pkgs = files.filter(it => it.endsWith(".pkg"))
  const dmgs = config.dmg?.sign === true ? files.filter(it => it.endsWith(".dmg") && path.dirname(it) === outDir) : []
  const sign = config.mac?.sign
  const signingDisabled = sign === null || (sign != null && typeof sign === "object" && sign.identity === null)
  const strict = sign != null && typeof sign === "object" ? sign.strictVerify : undefined
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

  const signingOptOut = signingDisabled ? "mac.sign (or its identity) is null in the configuration" : null
  const notarizeOptOut = notarizeDisabled ? "mac.notarize is false in the configuration" : null
  for (const app of macApps) {
    await run("code signature", app.path, signingOptOut, () => verifyMacCodeSignature(app.path, { deep: true, strict }))
    if (!app.isMas) {
      await run("notarization ticket", app.path, signingOptOut ?? notarizeOptOut, () => validateStapledTicket(app.path))
    }
  }
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
  const publisherNameSets = apps.filter(it => it.platform === "win" && it.updateConfig?.publisherNames != null).map(it => it.updateConfig!.publisherNames!)
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
