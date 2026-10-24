import type { Configuration } from "app-builder-lib"
import { getConfig } from "app-builder-lib/internal"
import { derivePublicKeyPem, InvalidConfigurationError, loadUpdateSigningKeys, log, parseUpdateManifestYaml, resignUpdateManifestYaml } from "builder-util"
import { collectManifestSignatures, normalizePublicKeyList, parsePublicKey, UpdateInfo, verifyManifestSignatures } from "builder-util-runtime"
import chalk from "chalk"
import { KeyObject } from "crypto"
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
      description: "Only verify the existing signatures against the configured trust list; nothing is written",
    })
}

export interface SignUpdateManifestOptions {
  /** The `latest*.yml` files to re-sign (or, with `verify`, to check). */
  readonly files: Array<string>
  /** `-c` / `--config`: a config file path, an inline configuration object, or both (an array), as for `build`. */
  readonly config?: string | Configuration | Array<string | Configuration> | null
  /** Check the existing signatures against the configured trust list instead of re-signing; nothing is written. */
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
  readonly version: string
  readonly ok: boolean
  /** Id of the trusted key that verified the manifest, when `ok`. */
  readonly keyId?: string
  /** Why the manifest did not verify, when not `ok`. */
  readonly reason?: string
}

type ManifestPlatform = "mac" | "win" | "linux"

const KEY_SOURCES_HINT =
  "Set updateManifest.signingKeyFile (or updateManifest.signingKey) in the electron-builder configuration, override it with -c.updateManifest.signingKeyFile=<path>, " +
  "or set ELECTRON_BUILDER_UPDATE_SIGN_KEY (the PEM file, base64-encoded on one line) or ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE (path to the PEM file) — the same key(s) the build signs with. " +
  "See https://www.electron.build/features/signed-update-manifests#re-signing-a-published-manifest"

/**
 * Backs `electron-builder sign-update-manifest`: re-signs existing `latest*.yml` files in place with the update signing
 * key(s), so a published manifest can be edited (`stagingPercentage`, a URL...) without rebuilding. With `verify` it only
 * checks the signatures already in the files against the trust list the build would embed, and throws if any fails.
 * Keys and trust list are resolved from the project configuration and the environment exactly as the build resolves them;
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
      this.signingKeys.set(platform, keys)
    }
    if (keys.length === 0) {
      throw new InvalidConfigurationError(`Cannot sign ${file}: no Ed25519 signing key was found for ${platform}. ${KEY_SOURCES_HINT}`)
    }
    return keys
  }

  /**
   * The trust list the build embeds into `app-update.yml` for `platform` (PublishManager): an explicit `updateManifest.publicKey`
   * list as-is, otherwise the public half of every configured signing key.
   */
  trustedKeys(platform: ManifestPlatform, file: string): Array<KeyObject> {
    const { value, field } = this.options(platform)
    if (value === false) {
      throw new InvalidConfigurationError(`Cannot verify ${file}: ${field} is false (signing is opted out of for ${platform}), so the build embeds no trust list`)
    }
    const explicit = normalizePublicKeyList(value?.publicKey)
    if (explicit.length > 0) {
      return explicit.map((key, index) => {
        try {
          return parsePublicKey(key)
        } catch (e: any) {
          // the entry may be a private key pasted by mistake: name the field only, never the value
          throw new InvalidConfigurationError(`${field}.publicKey #${index + 1} is not a valid Ed25519 public key (the value is not shown): ${e.message || e}`)
        }
      })
    }
    const keys = loadUpdateSigningKeys(value, this.projectDir)
    if (keys.length === 0) {
      throw new InvalidConfigurationError(
        `Cannot verify ${file}: no trust list for ${platform}. Set ${field}.publicKey, or provide the signing key(s) the build derives it from. ${KEY_SOURCES_HINT}`
      )
    }
    return keys.map(it => parsePublicKey(derivePublicKeyPem(it)))
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

async function verifyUpdateManifests(files: Array<string>, settings: ManifestSigningSettings): Promise<Array<VerifiedUpdateManifest>> {
  const results: Array<VerifiedUpdateManifest> = []
  for (const file of files) {
    const publicKeys = settings.trustedKeys(manifestPlatform(file), file)
    const info: UpdateInfo = parseUpdateManifestYaml(await readFile(file, "utf8"), file)
    if (collectManifestSignatures(info).length === 0) {
      results.push({ file, version: info.version, ok: false, reason: "not signed" })
      continue
    }
    const { ok, keyId, reason } = verifyManifestSignatures(info, publicKeys)
    results.push({ file, version: info.version, ok, keyId, reason: ok ? undefined : (reason ?? "no signature matches a trusted key") })
  }

  for (const result of results) {
    if (result.ok) {
      log.info({ file: result.file, version: result.version, keyId: result.keyId }, "update manifest signature verified")
    } else {
      log.error({ file: result.file, version: result.version, reason: result.reason }, "update manifest signature not verified")
    }
  }
  const failed = results.filter(it => !it.ok)
  if (failed.length > 0) {
    throw new InvalidConfigurationError(
      `${failed.length} of ${results.length} update manifest(s) failed signature verification: ${failed.map(it => `${it.file} (${it.reason})`).join(", ")}`
    )
  }
  return results
}
