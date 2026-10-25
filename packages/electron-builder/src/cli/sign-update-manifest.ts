import type { Configuration } from "app-builder-lib"
import { checkUpdateSigningKeysTrusted, getConfig, normalizeExplicitPublicKeys, verifyUpdateManifestContent } from "app-builder-lib/internal"
import { InvalidConfigurationError, loadUpdateSigningKeys, log, parsePrivateKey, parseUpdateManifestYaml, resignUpdateManifestYaml } from "builder-util"
import { normalizePublicKeyList, parsePublicKey } from "builder-util-runtime"
import chalk from "chalk"
import { readFile, writeFile } from "fs/promises"
import * as path from "path"
import type { Argv } from "yargs"
import { normalizeOptions } from "../builder.js"

export const SIGN_UPDATE_MANIFEST_COMMAND = "sign-update-manifest <files..>"

/**
 * Options of `sign-update-manifest`, configured like `publish`: the keys come from the project's electron-builder configuration
 * (`-c` / `--config` picks the file, and `-c.updateManifest.signingKeyFile=...` style overrides apply on top) and the
 * environment variables the build reads, never from a key-material flag.
 * @internal
 */
export function configureSignUpdateManifestCommand(yargs: Argv) {
  return yargs
    .positional("files", {
      type: "string",
      array: true,
      description: "Path(s) to the latest*.yml manifest(s)",
    })
    .option("config", {
      alias: ["c"],
      description:
        "The path to an electron-builder config. Defaults to `electron-builder.yml` (or `json`, or `json5`, or `js`, or `ts`), see " +
        chalk.underline("https://www.electron.build/configuration") +
        ". Its updateManifest settings provide the signing key(s) and the trust list; override them with e.g. -c.updateManifest.signingKeyFile=<path>",
    })
    .option("verify", {
      type: "boolean",
      description:
        "Only verify the existing signatures against the trust list in updateManifest.publicKey, as electron-builder verify does; nothing is written and no signing key is loaded",
    })
}

export interface SignUpdateManifestOptions {
  /** The `latest*.yml` files to re-sign (or, with `verify`, to check). */
  readonly files: Array<string>
  /** `-c` / `--config`: a config file path, an inline configuration object, or both (an array), as for `build`. */
  readonly config?: string | Configuration | Array<string | Configuration> | null
  /** Check the existing signatures against `updateManifest.publicKey` instead of re-signing; nothing is written and no signing key is loaded. */
  readonly verify?: boolean
  /** The project directory the configuration is loaded from; the current directory, like `publish`. */
  readonly projectDir?: string
}

/** Maps parsed `sign-update-manifest` arguments to {@link SignUpdateManifestOptions}. @internal */
export function signUpdateManifestOptionsFromArgs(args: Record<string, unknown>): SignUpdateManifestOptions {
  return {
    files: (args.files as Array<string> | undefined) ?? [],
    config: args.config as SignUpdateManifestOptions["config"],
    verify: args.verify as boolean | undefined,
  }
}

export interface SignedUpdateManifest {
  readonly file: string
  readonly version: string
  readonly keyIds: Array<string>
}

export interface VerifiedUpdateManifest {
  readonly file: string
  /** The manifest's version, or null when it cannot be parsed. */
  readonly version: string | null
  /**
   * `verified`: signed by a key of the trust list. `failed`: not. `skipped`: not verified, but either `updateManifest` is `false`
   * or `updateManifest.allowSigningKeyOutsideTrustList` allows it for a cutover release — the statuses `electron-builder verify`
   * reports for the same manifest.
   */
  readonly status: "verified" | "failed" | "skipped"
  /** Id of the trusted key that verified the manifest, when `verified`. */
  readonly keyId?: string
  /** Why the manifest was not verified, when `failed` or `skipped`. */
  readonly reason?: string
}

type ManifestPlatform = "mac" | "win" | "linux"

/** `Platform.name` of each manifest platform, as the build names it in its messages. */
const BUILD_PLATFORM_NAMES: Record<ManifestPlatform, string> = { mac: "mac", win: "windows", linux: "linux" }

const KEY_SOURCES_HINT =
  "Set updateManifest.signingKeyFile (or updateManifest.signingKey) in the electron-builder configuration, override it with -c.updateManifest.signingKeyFile=<path>, " +
  "or set ELECTRON_BUILDER_UPDATE_SIGN_KEY (the PEM file, base64-encoded on one line) or ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE (path to the PEM file) — the same key(s) the build signs with. " +
  "See https://www.electron.build/features/signed-update-manifests#re-signing-a-published-manifest"

/**
 * Backs `electron-builder sign-update-manifest`: re-signs existing `latest*.yml` files in place with the update signing
 * key(s), so a published manifest can be edited (`stagingPercentage`, a URL...) without rebuilding. With `verify` it only
 * checks the signatures already in the files against `updateManifest.publicKey`, exactly as `electron-builder verify` checks a
 * manifest, and throws if any fails. Signing keys are resolved from the project configuration and the environment as the build resolves them;
 * key material is never logged.
 * @internal
 */
export async function signUpdateManifest(options: SignUpdateManifestOptions): Promise<Array<SignedUpdateManifest> | Array<VerifiedUpdateManifest>> {
  const files = (options.files ?? []).filter(it => typeof it === "string" && it.trim().length > 0).map(it => path.resolve(it))
  if (files.length === 0) {
    throw new InvalidConfigurationError("No update manifest given: pass one or more latest*.yml paths")
  }
  const projectDir = path.resolve(options.projectDir ?? process.cwd())
  const config = await loadProjectConfig(projectDir, options.config)
  const settings = new ManifestSigningSettings(config, projectDir)
  return options.verify === true ? verifyUpdateManifests(files, settings) : resignUpdateManifests(files, settings)
}

/**
 * Resolves the configuration like `publish` and `build` do: the `-c` value is normalized by the build's own option
 * normalization (a file path, inline `-c.<key>=value` overrides, or both, with `"false"`/`"null"` coerced for `updateManifest`),
 * then a file path is loaded by `getConfig` with the inline overrides merged on top, as Packager.validateConfig does.
 */
async function loadProjectConfig(projectDir: string, configOption: SignUpdateManifestOptions["config"]): Promise<Configuration> {
  let configFromOptions = normalizeOptions({ config: (configOption ?? undefined) as any }).config
  let configPath: string | null = null
  if (typeof configFromOptions === "string") {
    configPath = configFromOptions
    configFromOptions = null
  } else if (configFromOptions != null && typeof configFromOptions.extends === "string" && configFromOptions.extends.includes(".")) {
    configFromOptions = { ...configFromOptions }
    configPath = configFromOptions.extends as string
    delete configFromOptions.extends
  }
  return getConfig(projectDir, configPath, configFromOptions ?? null)
}

/** The platform whose build writes a manifest of this name: `<channel>-mac.yml`, `<channel>-linux[-<arch>].yml`, else Windows (`<channel>.yml`). */
function manifestPlatform(file: string): ManifestPlatform {
  const name = path.basename(file).toLowerCase()
  if (/-mac\.ya?ml$/.test(name)) {
    return "mac"
  }
  if (/-linux(-[a-z0-9_]+)?\.ya?ml$/.test(name)) {
    return "linux"
  }
  return "win"
}

/** Per-platform signing keys and trust list, resolved from `<platform>.updateManifest ?? updateManifest` like PlatformPackager.updateManifestOptions. */
class ManifestSigningSettings {
  private readonly signingKeys = new Map<ManifestPlatform, Array<string>>()

  constructor(
    private readonly config: Configuration,
    private readonly projectDir: string
  ) {}

  private options(platform: ManifestPlatform): { value: Configuration["updateManifest"]; field: string } {
    const platformValue = (this.config as any)[platform]?.updateManifest
    return platformValue != null ? { value: platformValue, field: `${platform}.updateManifest` } : { value: this.config.updateManifest ?? null, field: "updateManifest" }
  }

  /** The configured signing key(s) (PEM) for `platform`; an InvalidConfigurationError when there are none or signing is opted out of. */
  requireSigningKeys(platform: ManifestPlatform, file: string): Array<string> {
    let keys = this.signingKeys.get(platform)
    if (keys == null) {
      const { value, field } = this.options(platform)
      if (value === false) {
        throw new InvalidConfigurationError(
          `Cannot sign ${file}: ${field} is false (signing is opted out of for ${platform}), so no signing key is used. Remove the opt-out to sign.`
        )
      }
      // same resolution as the build: config signingKey, config signingKeyFile (project-relative), then the environment variables
      keys = loadUpdateSigningKeys(value, this.projectDir)
      if (keys.length === 0) {
        throw new InvalidConfigurationError(`Cannot sign ${file}: no Ed25519 signing key was found for ${platform}. ${KEY_SOURCES_HINT}`)
      }
      // the publishing build's own check: an explicit updateManifest.publicKey must hold one of the signing keys, unless
      // allowSigningKeyOutsideTrustList marks a cutover release; without a publicKey the build derives the trust list from the keys
      checkUpdateSigningKeysTrusted(BUILD_PLATFORM_NAMES[platform], value ?? null, keys.map(parsePrivateKey), normalizeExplicitPublicKeys(value?.publicKey), true)
      this.signingKeys.set(platform, keys)
    }
    return keys
  }

  /**
   * What `--verify` checks `platform`'s manifests against, the same source `electron-builder verify` uses when no packaged app is at hand:
   * the `publicKey` of `<platform>.updateManifest ?? updateManifest` (the platform block wins as a whole, as in the build). Like `verify`, it never loads a signing (private)
   * key, so a release whose trust list is derived from its signing keys needs the public keys set here to be verified.
   */
  verificationPolicy(platform: ManifestPlatform, file: string): { optedOut: true } | { optedOut: false; trustedKeys: Array<string>; allowCutover: boolean } {
    const { value, field } = this.options(platform)
    if (value === false) {
      return { optedOut: true }
    }
    const trustedKeys = normalizePublicKeyList(value?.publicKey)
    if (trustedKeys.length === 0) {
      throw new InvalidConfigurationError(
        `Cannot verify ${file}: ${field}.publicKey is not set. --verify checks against the public keys of ${field}.publicKey (as electron-builder verify does) ` +
          "and never loads a signing key: set it in the configuration or pass -c.updateManifest.publicKey=<PEM>"
      )
    }
    trustedKeys.forEach((key, index) => {
      try {
        parsePublicKey(key)
      } catch (e: any) {
        // the entry may be a private key pasted by mistake: name the field only, never the value
        throw new InvalidConfigurationError(`${field}.publicKey #${index + 1} is not a valid Ed25519 public key (the value is not shown): ${e.message || e}`)
      }
    })
    return { optedOut: false, trustedKeys, allowCutover: value?.allowSigningKeyOutsideTrustList === true }
  }
}

async function resignUpdateManifests(files: Array<string>, settings: ManifestSigningSettings): Promise<Array<SignedUpdateManifest>> {
  // sign every file before writing any, so a manifest that cannot be signed leaves all of them untouched
  const signed: Array<{ file: string; result: ReturnType<typeof resignUpdateManifestYaml> }> = []
  for (const file of files) {
    const keys = settings.requireSigningKeys(manifestPlatform(file), file)
    signed.push({ file, result: resignUpdateManifestYaml(await readFile(file, "utf8"), keys, file) })
  }
  for (const { file, result } of signed) {
    await writeFile(file, result.content)
  }

  return signed.map(({ file, result }) => {
    const keyIds = result.signatures.map(it => it.keyId)
    log.info({ file, version: result.info.version, keyIds }, "update manifest signed")
    return { file, version: result.info.version, keyIds }
  })
}

function readVersion(content: string, file: string): string | null {
  try {
    const version = parseUpdateManifestYaml(content, file).version
    return typeof version === "string" ? version : null
  } catch {
    return null
  }
}

/**
 * Verifies each manifest with `verifyUpdateManifestContent`, the check `electron-builder verify` runs, and maps the outcome the same way:
 * `updateManifest: false` is skipped, and a manifest no trusted key validates is skipped rather than failed when
 * `updateManifest.allowSigningKeyOutsideTrustList` marks the release as a deliberate cutover.
 */
async function verifyUpdateManifests(files: Array<string>, settings: ManifestSigningSettings): Promise<Array<VerifiedUpdateManifest>> {
  const results: Array<VerifiedUpdateManifest> = []
  for (const file of files) {
    const policy = settings.verificationPolicy(manifestPlatform(file), file)
    const content = await readFile(file, "utf8")
    const version = readVersion(content, file)
    if (policy.optedOut) {
      results.push({ file, version, status: "skipped", reason: "updateManifest is false in the configuration, so the manifest is not signed" })
      continue
    }
    const verification = verifyUpdateManifestContent(content, policy.trustedKeys)
    if (verification.ok) {
      results.push({ file, version, status: "verified", keyId: verification.keyId })
    } else if (policy.allowCutover) {
      results.push({
        file,
        version,
        status: "skipped",
        reason: `not signed by a key of updateManifest.publicKey (${verification.reason}), which updateManifest.allowSigningKeyOutsideTrustList allows for a cutover release signed with a key outside the trust list`,
      })
    } else {
      results.push({ file, version, status: "failed", reason: verification.reason })
    }
  }

  for (const { file, version, status, keyId, reason } of results) {
    if (status === "verified") {
      log.info({ file, version, keyId }, "update manifest signature verified")
    } else if (status === "skipped") {
      log.warn({ file, version, reason }, "update manifest signature not verified (skipped)")
    } else {
      log.error({ file, version, reason }, "update manifest signature not verified")
    }
  }
  const failed = results.filter(it => it.status === "failed")
  if (failed.length > 0) {
    throw new InvalidConfigurationError(
      `${failed.length} of ${results.length} update manifest(s) failed signature verification: ${failed.map(it => `${it.file} (${it.reason})`).join(", ")}`
    )
  }
  return results
}
