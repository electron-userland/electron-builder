import type { Configuration } from "app-builder-lib"
import {
  checkUpdateSigningKeysTrusted,
  compareListedFilesInOutput,
  getConfig,
  listedFileFolders,
  normalizeExplicitPublicKeys,
  updateManifestPlatform,
  verifyUpdateManifestContent,
} from "app-builder-lib/internal"
import { InvalidConfigurationError, isPathWithin, loadUpdateSigningKeys, log, parsePrivateKey, parseUpdateManifestYaml, resignUpdateManifest } from "builder-util"
import { hashFile, normalizePublicKeyList, parsePublicKey, UpdateInfo } from "builder-util-runtime"
import chalk from "chalk"
import { constants as fsConstants } from "fs"
import { lstat, open, readdir, readFile, stat } from "fs/promises"
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
    .option("rehash", {
      type: "boolean",
      description:
        "Before signing, take the sha512 and size of every listed file from the local file (next to the manifest or in the build output folder, as electron-builder verify finds it), for files a release step changed after the build (for example signed them again)",
    })
    .conflicts("rehash", "verify")
}

export interface SignUpdateManifestOptions {
  /** The `latest*.yml` files to re-sign (or, with `verify`, to check). */
  readonly files: Array<string>
  /** `-c` / `--config`: a config file path, an inline configuration object, or both (an array), as for `build`. */
  readonly config?: string | Configuration | Array<string | Configuration> | null
  /** Check the existing signatures against `updateManifest.publicKey` instead of re-signing; nothing is written and no signing key is loaded. */
  readonly verify?: boolean
  /**
   * Before signing, take the sha512 and size of every `files` entry from the local file, found next to the manifest or in the build output
   * folder as `electron-builder verify` finds it, which must then hold every listed file. Without it, a listed file found there that does
   * not match its entry fails the command.
   */
  readonly rehash?: boolean
  /** The project directory the configuration is loaded from; the current directory, like `publish`. */
  readonly projectDir?: string
}

/** Maps parsed `sign-update-manifest` arguments to {@link SignUpdateManifestOptions}. @internal */
export function signUpdateManifestOptionsFromArgs(args: Record<string, unknown>): SignUpdateManifestOptions {
  return {
    files: (args.files as Array<string> | undefined) ?? [],
    config: args.config as SignUpdateManifestOptions["config"],
    verify: args.verify as boolean | undefined,
    rehash: args.rehash as boolean | undefined,
  }
}

export interface SignedUpdateManifest {
  readonly file: string
  readonly version: string
  readonly keyIds: Array<string>
  /** The listed files whose sha512 and size `rehash` took from the local file, by url. */
  readonly rehashed: Array<string>
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

type ManifestPlatform = ReturnType<typeof updateManifestPlatform>
const MANIFEST_PLATFORMS: ReadonlyArray<ManifestPlatform> = ["mac", "win", "linux"]

/** A deep copy of an `updateManifest` value from the command line, which later configuration merging cannot change. */
function snapshotOf(value: unknown): unknown {
  return value == null || typeof value !== "object" ? value : structuredClone(value)
}

/** `Platform.name` of each manifest platform, as the build names it in its messages. */
const BUILD_PLATFORM_NAMES: Record<ManifestPlatform, string> = { mac: "mac", win: "windows", linux: "linux" }

const RESIGN_DOCS = "https://www.electron.build/docs/features/signed-update-manifests#re-signing-a-published-manifest"

const KEY_SOURCES_HINT =
  "Set updateManifest.signingKeyFile (or updateManifest.signingKey) in the electron-builder configuration, override it with -c.updateManifest.signingKeyFile=<path>, " +
  "or set ELECTRON_BUILDER_UPDATE_SIGN_KEY (the PEM file, base64-encoded on one line) or ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE (path to the PEM file) — the same key(s) the build signs with. " +
  `See ${RESIGN_DOCS}`

/**
 * Backs `electron-builder sign-update-manifest`: re-signs existing `latest*.yml` files in place with the update signing
 * key(s), so a published manifest can be edited (`stagingPercentage`, a URL...) without rebuilding. With `verify` it only
 * checks the signatures already in the files against `updateManifest.publicKey`, exactly as `electron-builder verify` checks a
 * manifest, and throws if any fails. Signing keys are resolved from the project configuration and the environment as the build resolves them;
 * key material is never logged.
 * @internal
 */
export async function signUpdateManifest(options: SignUpdateManifestOptions): Promise<Array<SignedUpdateManifest> | Array<VerifiedUpdateManifest>> {
  // first, before anything reads the -c value: normalizeOptions and getConfig merge its objects into one another in place
  const commandLine = new CommandLineOverrides(options.config)
  const files = (options.files ?? []).filter(it => typeof it === "string" && it.trim().length > 0).map(it => path.resolve(it))
  if (files.length === 0) {
    throw new InvalidConfigurationError("No update manifest given: pass one or more latest*.yml paths")
  }
  const projectDir = path.resolve(options.projectDir ?? process.cwd())
  const config = await loadProjectConfig(projectDir, options.config)
  const settings = new ManifestSigningSettings(config, projectDir, commandLine)
  return options.verify === true ? verifyUpdateManifests(files, settings) : resignUpdateManifests(files, settings, options.rehash === true)
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

/**
 * The `updateManifest` values passed inline with `-c.<key>=value`, read from the raw `-c` value rather than the merged configuration:
 * merging lets a configured platform block shadow a root override and concatenates a repeated override with a configured list, so a
 * trust list given on the command line could otherwise end up holding keys the operator did not pass. Construct it before the `-c`
 * value is handed to normalizeOptions / getConfig: they deep-assign its objects into one another in place, so by then the first of
 * several `-c.updateManifest.publicKey=` objects already holds the last value. The `updateManifest` blocks are deep-copied here.
 */
class CommandLineOverrides {
  private readonly items: Array<Record<string, any>>

  constructor(configOption: SignUpdateManifestOptions["config"]) {
    // a file path plus inline overrides (or repeated overrides with a file) arrive as an array, one object per flag
    const values = Array.isArray(configOption) ? configOption : [configOption]
    this.items = values
      .filter((it): it is Record<string, any> => it != null && typeof it === "object" && !Array.isArray(it))
      .map(item => {
        // only the updateManifest blocks are kept: plain data (strings, lists, booleans), unlike a programmatic config's hooks
        const snapshot: Record<string, any> = { updateManifest: snapshotOf(item.updateManifest) }
        for (const platform of MANIFEST_PLATFORMS) {
          snapshot[platform] = { updateManifest: snapshotOf(item[platform]?.updateManifest) }
        }
        return snapshot
      })
  }

  private values(block: (item: Record<string, any>) => unknown, key: string): Array<unknown> {
    const result: Array<unknown> = []
    for (const item of this.items) {
      const value = block(item)
      if (value != null && typeof value === "object" && !Array.isArray(value) && (value as any)[key] != null) {
        result.push((value as any)[key])
      }
    }
    return result
  }

  /**
   * The trust list given on the command line for `platform`'s manifests: every `-c.<platform>.updateManifest.publicKey` when there is
   * one, otherwise every `-c.updateManifest.publicKey` (also when the configuration has a platform block), or null when neither was passed.
   */
  trustList(platform: ManifestPlatform): { keys: Array<string>; field: string } | null {
    for (const [field, block] of [
      [`${platform}.updateManifest`, (item: Record<string, any>) => item[platform]?.updateManifest],
      ["updateManifest", (item: Record<string, any>) => item.updateManifest],
    ] as const) {
      const values = this.values(block, "publicKey")
      if (values.length > 0) {
        return { keys: values.flatMap(it => normalizePublicKeyList(it as string | Array<string>)), field }
      }
    }
    return null
  }

  /** `allowSigningKeyOutsideTrustList` given on the command line for `platform` (the platform override first), or null. */
  allowSigningKeyOutsideTrustList(platform: ManifestPlatform): boolean | null {
    for (const block of [(item: Record<string, any>) => item[platform]?.updateManifest, (item: Record<string, any>) => item.updateManifest]) {
      const values = this.values(block, "allowSigningKeyOutsideTrustList")
      if (values.length > 0) {
        const last = values[values.length - 1]
        return last === true || last === "true"
      }
    }
    return null
  }
}

/** Per-platform signing keys and trust list, resolved from `<platform>.updateManifest ?? updateManifest` like PlatformPackager.updateManifestOptions. */
class ManifestSigningSettings {
  private readonly signingKeys = new Map<ManifestPlatform, Array<string>>()

  constructor(
    private readonly config: Configuration,
    private readonly projectDir: string,
    private readonly commandLine: CommandLineOverrides
  ) {}

  /**
   * The build output folder the files `manifestFile` lists are looked for in, as `electron-builder verify` looks for them:
   * `directories.output` (`dist` by default) when the manifest is inside it, so the artifacts of a further provider's
   * `dist/<provider>/latest.yml` are found in `dist/`; otherwise (a manifest copied elsewhere, or an output folder named with a macro,
   * which is not expanded here) the manifest's own folder.
   */
  outputFolder(manifestFile: string): string {
    // getConfig sets the default
    const output = this.config.directories?.output
    if (typeof output === "string") {
      const outDir = path.resolve(this.projectDir, output)
      if (isPathWithin(outDir, path.dirname(manifestFile))) {
        return outDir
      }
    }
    return path.dirname(manifestFile)
  }

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
    // A trust list given on the command line is used exactly as passed (see CommandLineOverrides); otherwise the effective
    // configuration block's publicKey, as electron-builder verify reads it.
    const override = this.commandLine.trustList(platform)
    const trustedKeys = override == null ? normalizePublicKeyList(value?.publicKey) : override.keys
    const source = override == null ? `${field}.publicKey` : `-c.${override.field}.publicKey`
    if (trustedKeys.length === 0) {
      throw new InvalidConfigurationError(
        `Cannot verify ${file}: ${source} ${override == null ? "is not set" : "holds no key"}. --verify checks against the public keys of updateManifest.publicKey (as electron-builder verify does) ` +
          "and never loads a signing key: set it in the configuration or pass -c.updateManifest.publicKey=<PEM>"
      )
    }
    trustedKeys.forEach((key, index) => {
      try {
        parsePublicKey(key)
      } catch (e: any) {
        // the entry may be a private key pasted by mistake: name the field only, never the value
        throw new InvalidConfigurationError(`${source} #${index + 1} is not a valid Ed25519 public key (the value is not shown): ${e.message || e}`)
      }
    })
    // The cutover allowance turns a failure into "skipped", as electron-builder verify does for the configured trust list. A trust list
    // given on the command line is an explicit request to check against those keys, so the configured allowance does not apply to it:
    // the check must fail when the manifest is not signed by them. Only an allowance given on the command line as well still applies.
    const allowCutover = override == null ? value?.allowSigningKeyOutsideTrustList === true : this.commandLine.allowSigningKeyOutsideTrustList(platform) === true
    return { optedOut: false, trustedKeys, allowCutover }
  }
}

async function resignUpdateManifests(files: Array<string>, settings: ManifestSigningSettings, rehash: boolean): Promise<Array<SignedUpdateManifest>> {
  // sign every file before writing any, so a manifest that cannot be signed leaves all of them untouched
  const signed: Array<{ file: string; result: ReturnType<typeof resignUpdateManifest>; rehashed: Array<string> }> = []
  for (const file of files) {
    const keys = settings.requireSigningKeys(updateManifestPlatform(file), file)
    await requireRegularFile(file)
    const { info, rehashed } = await checkListedFiles(parseUpdateManifestYaml(await readFile(file, "utf8"), file), file, settings.outputFolder(file), rehash)
    signed.push({ file, result: resignUpdateManifest(info, keys, file), rehashed })
  }
  for (const { file, result } of signed) {
    await writeManifestInPlace(file, result.content)
  }

  return signed.map(({ file, result, rehashed }) => {
    const keyIds = result.signatures.map(it => it.keyId)
    log.info({ file, version: result.info.version, keyIds, ...(rehashed.length > 0 ? { rehashed } : {}) }, "update manifest signed")
    return { file, version: result.info.version, keyIds, rehashed }
  })
}

/**
 * Refuses a manifest that is not a regular file, before anything is signed: it is rewritten in place, so a symlink (not followed here)
 * would have its target overwritten — a target that may be outside the project, for a manifest in a copied or downloaded tree.
 */
async function requireRegularFile(file: string): Promise<void> {
  const stats = await lstat(file)
  if (!stats.isFile()) {
    throw new InvalidConfigurationError(
      `Cannot sign ${file}: ${stats.isSymbolicLink() ? "it is a symlink, and the manifest is rewritten in place, which would overwrite the link's target. Sign the file itself" : "it is not a regular file"}.`
    )
  }
}

/**
 * Overwrites a manifest checked by {@link requireRegularFile}. Opened without following a symlink (O_NOFOLLOW, where the platform has it),
 * so a manifest replaced by a symlink after the check fails to open (ELOOP) rather than overwriting the link's target.
 */
async function writeManifestInPlace(file: string, content: string): Promise<void> {
  const handle = await open(file, fsConstants.O_WRONLY | fsConstants.O_TRUNC | (fsConstants.O_NOFOLLOW ?? 0))
  try {
    await handle.writeFile(content)
  } finally {
    await handle.close()
  }
}

/** The regular files of the folders, in order; a symlink is not followed, and a folder that cannot be read has none. */
async function regularFilesIn(dirs: ReadonlyArray<string>): Promise<Array<string>> {
  const files: Array<string> = []
  for (const dir of dirs) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    files.push(...entries.filter(it => it.isFile()).map(it => path.join(dir, it.name)))
  }
  return files
}

/**
 * Checks the files `info` lists against the local files, by the size and sha512 electron-updater checks a download against (its full
 * download stops past the declared size, and a file whose sha512 differs is rejected), so that a manifest is never signed for files it does
 * not describe. Listed files are looked for as `electron-builder verify` looks for them (compareListedFilesInOutput): in the manifest's
 * folder, its target folder and `outDir`, by name or by GitHub safe name. Rehashed files are only read. A listed file that is not found
 * is refused when those folders hold other files of the release, and is left unchecked (with a warning) only when they hold none, as for a
 * manifest edited away from the build output. With `rehash`, every `files` entry must be found and takes its sha512 and size from the file, as the build
 * computes them, along with the deprecated top-level `sha512` (and Windows `sha2`) when `path` names it; an nsis-web `packages` entry
 * declares the size of the block map embedded in its package, which cannot be recomputed here, so it must still match.
 */
async function checkListedFiles(info: UpdateInfo, manifestFile: string, outDir: string, rehash: boolean): Promise<{ info: UpdateInfo; rehashed: Array<string> }> {
  // the manifest is not trusted to have the declared shape: validateSignedManifestShape reports a missing or malformed list when it is signed
  const fileEntries: unknown = info.files
  if (!Array.isArray(fileEntries)) {
    return { info, rehashed: [] }
  }
  const localFiles = await regularFilesIn(listedFileFolders(manifestFile, outDir))
  const hashes = new Map<string, Promise<string | null>>()
  const compared = await compareListedFilesInOutput(info, manifestFile, outDir, localFiles, hashes)
  const updated: Record<string, any> = { ...info, files: [...fileEntries] }
  const rehashed: Array<string> = []
  const unchecked: Array<string> = []
  const folders = listedFileFolders(manifestFile, outDir).join(" or ")
  // A listed file that is not found is only left unchecked when the searched folders hold none of the release's files (an edit such as
  // stagingPercentage, signed away from the build output). When they hold another listed file, or a file of the same type, it was renamed
  // (a GitHub name the build generated for a productName GitHub does not allow) or removed, and could be a changed file signed unchecked.
  const anyFound = compared.some(it => it.comparison.status !== "not found")
  const releaseFiles = localFiles.filter(it => !/\.(ya?ml|blockmap)$/.test(it))
  const holdsReleaseFiles = (location: string | null) => {
    const extension = location == null ? "" : path.posix.extname(location.split(/[?#]/, 1)[0])
    return anyFound || (extension !== "" && releaseFiles.some(it => path.extname(it) === extension))
  }

  for (const [index, { entry, comparison }] of compared.entries()) {
    const name = entry.location ?? `#${index + 1}`
    if (comparison.status === "not found") {
      if (rehash && entry.field === "files") {
        throw new InvalidConfigurationError(
          `Cannot sign ${manifestFile} with --rehash: the listed file ${name} is not a regular file in ${folders}, so its sha512 and size cannot be taken from it. ` +
            `Put the files the manifest lists there under their listed names (the build output folder, directories.output, is searched when the manifest is inside it), or sign without --rehash. See ${RESIGN_DOCS}`
        )
      }
      if (holdsReleaseFiles(entry.location)) {
        throw new InvalidConfigurationError(
          `Cannot sign ${manifestFile}: no file in ${folders} is named as its ${entry.field} entry ${name} or has its sha512 and size, although they hold other files of the release, so it cannot be checked. ` +
            "Put the file there under the listed name. A GitHub manifest can list a name the build generated, for a productName with characters GitHub does not allow: " +
            "give the local file that listed name, the name it is uploaded under. " +
            `See ${RESIGN_DOCS}`
        )
      }
      unchecked.push(name)
      continue
    }
    if (!rehash || entry.field !== "files") {
      if (comparison.status === "mismatch") {
        const remedy =
          entry.field === "files"
            ? "When a release step changed the file after the build (for example signed it again), pass --rehash to take its sha512 and size from the file; otherwise restore the file the manifest was built with."
            : "An nsis-web package declares the size of the block map embedded in it, which cannot be recomputed here: rebuild the package and its manifest."
        throw new InvalidConfigurationError(
          `Cannot sign ${manifestFile}: ${path.relative(path.dirname(manifestFile), comparison.file)} does not match its ${entry.field} entry (${comparison.mismatched.join(", ")}). ` +
            `electron-updater stops a full download past the declared size and rejects a file whose sha512 differs, so installs would reject this update. ${remedy} See ${RESIGN_DOCS}`
        )
      }
      continue
    }
    if (comparison.status === "matches") {
      continue
    }
    const file = comparison.file
    // memoized by compareListedFiles for an entry that declares a sha512
    const sha512 = (await hashes.get(file)) ?? (await hashFile(file))
    const { size } = await stat(file)
    updated.files[index] = { ...(fileEntries[index] as Record<string, unknown>), sha512, size }
    if (updated.path === entry.location && typeof updated.sha512 === "string") {
      updated.sha512 = sha512
      if (typeof updated.sha2 === "string") {
        updated.sha2 = await hashFile(file, "sha256", "hex")
      }
    }
    rehashed.push(name)
    if (localFiles.includes(`${file}.blockmap`)) {
      log.warn(
        { file: log.filePath(file) },
        "the file changed after its .blockmap was written: differential updates to this release fall back to a full download until the block map is generated from this file"
      )
    }
  }
  if (unchecked.length > 0) {
    log.warn(
      { file: log.filePath(manifestFile), unchecked },
      `the files the manifest lists are not in ${folders}, so their sha512 and size were not checked: upload the manifest only with the files it was built for`
    )
  }
  return { info: updated as UpdateInfo, rehashed }
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
    const policy = settings.verificationPolicy(updateManifestPlatform(file), file)
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
