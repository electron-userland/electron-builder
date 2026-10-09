import {
  Arch,
  asArray,
  AsyncTaskManager,
  derivePublicKeyPem,
  exists,
  InvalidConfigurationError,
  isEmptyOrSpaces,
  isPullRequest,
  log,
  safeStringifyJson,
  serializeToYaml,
} from "builder-util"
import {
  BitbucketOptions,
  CancellationToken,
  computeUpdateManifestKeyId,
  GenericServerOptions,
  getS3LikeProviderBaseUrl,
  GithubOptions,
  githubTagPrefix,
  githubUrl,
  GitlabOptions,
  KeygenOptions,
  normalizePublicKeyList,
  Nullish,
  PublishConfiguration,
  PublishProvider,
  SnapStoreOptions,
} from "builder-util-runtime"
import _debug from "debug"
import {
  BitbucketPublisher,
  getCiTag,
  GitHubPublisher,
  GitlabPublisher,
  KeygenPublisher,
  PublishContext,
  Publisher,
  PublishOptions,
  R2Publisher,
  S3Publisher,
  SnapStorePublisher,
  SpacesPublisher,
  UploadTask,
} from "electron-publish"
import { MultiProgress } from "electron-publish/internal"
import { readFile } from "fs/promises"
import _fsExtra from "fs-extra"
const { outputFile } = _fsExtra
import * as path from "path"
import { WriteStream as TtyWriteStream } from "tty"
import { AppInfo } from "../appInfo.js"
import { Configuration } from "../configuration.js"
import { Platform, Target, TargetSpecificOptions } from "../core.js"
import { ArtifactCreated, PlannedTargets } from "../packagerApi.js"
import { PlatformSpecificBuildOptions } from "../options/PlatformSpecificBuildOptions.js"
import { Packager } from "../packager.js"
import { PlatformPackager } from "../platformPackager.js"
import { WinPackager } from "../winPackager.js"
import { createUpdateInfoTasks, UpdateInfoFileTask, writeUpdateInfoFiles } from "./updateInfoBuilder.js"
import { resolveModule } from "../util/resolve.js"
import { parseUrl } from "../util/pathManager.js"
import { isPublishForPullRequest } from "../util/flags.js"

const publishForPrWarning =
  "There are serious security concerns with PUBLISH_FOR_PULL_REQUEST=true (see the  CircleCI documentation (https://circleci.com/docs/guides/integration/oss/#pass-secrets-to-builds-from-forked-pull-requests) for details)" +
  "\nIf you have SSH keys, sensitive env vars or AWS credentials stored in your project settings and untrusted forks can make pull requests against your repo, then this option isn't for you."

const debug = _debug("electron-builder:publish")

function checkOptions(publishPolicy: any) {
  if (publishPolicy != null && publishPolicy !== "onTag" && publishPolicy !== "onTagOrDraft" && publishPolicy !== "always" && publishPolicy !== "never") {
    if (typeof publishPolicy === "string") {
      throw new InvalidConfigurationError(
        `Expected one of "onTag", "onTagOrDraft", "always", "never", but got ${JSON.stringify(
          publishPolicy
        )}.\nPlease note that publish configuration should be specified under "config"`
      )
    }
  }
}

/** Emitted once per feed (the url without its query) per process — app-update.yml is written for every pack, and platforms may use different feeds. */
const feedQueryWarnedFeeds = new Set<string>()

/**
 * electron-updater 7 adds the query string of a generic feed url (typically a token), like the credential headers, only to
 * downloads on the feed's origin. An app whose latest*.yml points downloads at another origin that relies on that query gets
 * 401/403 at update time, inside a shipped app, with nothing at build time saying why — `migrate-schema` prints the same advisory,
 * but cannot be relied on to have been run. Only the query parameter names are logged, never the url or the values.
 *
 * @internal exported for tests
 */
export function warnAboutGenericFeedQuery(publishConfig: PublishConfiguration): void {
  const url = publishConfig.provider === "generic" ? (publishConfig as GenericServerOptions).url : null
  const queryStart = typeof url === "string" ? url.indexOf("?") : -1
  if (queryStart < 0) {
    return
  }
  const feed = url!.slice(0, queryStart)
  if (feedQueryWarnedFeeds.has(feed)) {
    return
  }
  feedQueryWarnedFeeds.add(feed)
  const queryParameters = [...new Set(new URLSearchParams(url!.slice(queryStart + 1).split("#")[0]).keys())]
  log.warn(
    {
      queryParameters: queryParameters.length === 0 ? "(none)" : queryParameters.join(", "),
      solution: "serve the update files from the feed origin (relative files[].url, the default) or use pre-signed URLs",
    },
    "the generic publish url has a query string. electron-updater 7 (electron-builder v27) adds it, and sends the credential headers from requestHeaders / addAuthHeader, " +
      "only to downloads on the feed's origin (scheme, host and port): a download url in latest*.yml on another origin is requested without them. " +
      "Nothing changes for the relative URLs electron-builder writes. " +
      "See https://www.electron.build/docs/migration/v27-breaking-changes#update-credentials-stay-on-the-feeds-origin"
  )
}

/** @internal exported for tests — re-arms the once-per-feed warning. */
export function resetGenericFeedQueryWarning(): void {
  feedQueryWarnedFeeds.clear()
}

/**
 * v26 published implicitly when it detected a CI tag; v27 requires an explicit `--publish` policy.
 * Without a signal, a tagged release pipeline goes green and uploads nothing — the build looks
 * identical to a successful publish. Only warns when the project actually looks like it wanted to
 * publish (a tag is present and a publish target is configured), so ordinary local builds stay quiet.
 */
function warnIfImplicitPublishExpected(packager: Packager): void {
  const tag = getCiTag()
  if (tag == null) {
    return
  }
  const config = packager.config
  const hasPublishConfig =
    config.publish != null ||
    (["mac", "win", "linux"] as const).some(platform => {
      const platformConfig = config[platform] as { publish?: unknown } | Nullish
      return platformConfig != null && platformConfig.publish != null
    })
  if (!hasPublishConfig) {
    return
  }
  log.warn(
    { tag, solution: "pass --publish <always|onTag|onTagOrDraft|never>, or set the `publish` policy in your build configuration" },
    "a publish configuration and a CI tag are present, but no publish policy was given — nothing will be uploaded. " +
      "electron-builder v27 removed implicit publishing (v26 auto-published when it detected a CI tag). " +
      "See https://www.electron.build/docs/migration/v27-breaking-changes#implicit-publish-removed"
  )
}

export class PublishManager implements PublishContext {
  private readonly nameToPublisher = new Map<string, Promise<Publisher | null>>()

  private readonly taskManager: AsyncTaskManager

  readonly isPublish: boolean = false

  readonly progress = (process.stdout as TtyWriteStream).isTTY ? new MultiProgress() : null

  private readonly updateFileWriteTask: Array<UpdateInfoFileTask> = []

  constructor(
    private readonly packager: Packager,
    private readonly publishOptions: PublishOptions,
    readonly cancellationToken: CancellationToken = packager.cancellationToken
  ) {
    checkOptions(publishOptions.publish)

    this.taskManager = new AsyncTaskManager(cancellationToken)

    const forcePublishForPr = isPublishForPullRequest()
    if (!isPullRequest() || forcePublishForPr) {
      const publishPolicy = publishOptions.publish
      this.isPublish = publishPolicy != null && publishOptions.publish !== "never" && (publishPolicy !== "onTag" || getCiTag() != null)
      if (this.isPublish && forcePublishForPr) {
        log.warn(publishForPrWarning)
      }
      if (publishPolicy == null) {
        warnIfImplicitPublishExpected(packager)
      }
    } else if (publishOptions.publish !== "never") {
      log.info(
        {
          reason: "current build is a part of pull request",
          solution: `set env PUBLISH_FOR_PULL_REQUEST to true to force code signing\n${publishForPrWarning}`,
        },
        "publishing will be skipped"
      )
    }

    packager.onTargetsCreated(plan => this.requireSigningKeysForPlannedTargets(plan))

    packager.onAfterPack(async event => {
      const packager = event.packager
      if (event.electronPlatformName === "darwin") {
        if (!event.targets.some(it => it.name === "dmg" || it.name === "zip")) {
          return
        }
      } else if (packager.platform === Platform.WINDOWS) {
        if (!event.targets.some(it => isSuitableWindowsTarget(it))) {
          return
        }
      }

      // app-update.yml is written for every pack, from the publish settings of the pack's targets that emit a manifest
      // (see resolvePackAppUpdatePublishConfigs) - so a manifest signed under a target-level `publish` always ships with
      // the key that verifies it, except when the pack's targets disagree about the feed (an error when publishing, a
      // warning and no app-update.yml otherwise). The signing requirement (the error when publishing, the advisory
      // otherwise) only applies when a target emits a manifest - the same per-target resolution as the build-start
      // preflight. A snap-, flatpak- or mas-only pack has none (Linux and mas are not filtered above), nor has an
      // installer whose target-level `publish` is `null` or waived.
      const { publishConfigs, emitsManifest } = await resolvePackAppUpdatePublishConfigs(packager, event.targets, event.arch, this.isPublish)
      if (emitsManifest) {
        await packager.requireUpdateSigningKeys(this.isPublish)
      }
      const publishConfig = await createAppUpdateConfiguration(packager, publishConfigs, this.isPublish, false)
      if (publishConfig != null) {
        await writeAppUpdateYaml(packager.getResourcesDir(event.appOutDir), publishConfig)
      }
    })

    packager.onArtifactCreated(async event => {
      const publishConfiguration = event.publishConfig
      if (publishConfiguration == null) {
        this.taskManager.addTask(this.artifactCreatedWithoutExplicitPublishConfig(event))
      } else if (this.isPublish) {
        if (debug.enabled) {
          debug(`artifactCreated (isPublish: ${this.isPublish}): ${safeStringifyJson(event, new Set(["packager"]))},\n  publishConfig: ${safeStringifyJson(publishConfiguration)}`)
        }
        await this.scheduleUpload(publishConfiguration, event, this.getAppInfo(event.packager))
      }
    })
  }

  /**
   * Build-start preflight: enforces update-manifest signing for every target of every platform and arch that will
   * emit update info, before anything is packed. The per-artifact check in artifactCreatedWithoutExplicitPublishConfig
   * only stops that artifact's own upload; by then an earlier target (a portable exe, another arch, another platform)
   * may already be uploading. Same resolution as the per-artifact path - target-level `publish` first, `null` means
   * none, `publishAutoUpdate: false` on every provider waives it - which stays in place for targets that do not
   * declare `writesUpdateInfo`. Each planned platform x arch is one pack, so targets of a pack that disagree about the
   * app-update.yml feed fail here too, before anything is packed (also for a prepackaged app, which has no afterPack).
   */
  private async requireSigningKeysForPlannedTargets(plan: ReadonlyArray<PlannedTargets>): Promise<void> {
    if (!this.isPublish) {
      return
    }
    for (const { packager, arch, targets } of plan) {
      // resolving publish configs is async: a build cancelled meanwhile stops instead of failing on a missing key
      if (this.cancellationToken.cancelled) {
        return
      }
      const { emitsManifest } = await resolvePackAppUpdatePublishConfigs(packager, targets, arch, true)
      if (emitsManifest && !this.cancellationToken.cancelled) {
        await packager.requireUpdateSigningKeys(true)
      }
    }
  }

  private getAppInfo(platformPackager: PlatformPackager<any> | null) {
    return platformPackager == null ? this.packager.appInfo : platformPackager.appInfo
  }

  async getGlobalPublishConfigurations(): Promise<Array<PublishConfiguration> | null> {
    const publishers = this.packager.config.publish
    return await resolvePublishConfigurations(publishers, null, null, true, this.packager)
  }

  async scheduleUpload(publishConfig: PublishConfiguration, event: UploadTask, appInfo: AppInfo): Promise<void> {
    if (publishConfig.provider === "generic") {
      return
    }

    const publisher = await this.getOrCreatePublisher(publishConfig, appInfo)
    if (publisher == null) {
      log.debug(
        {
          file: log.filePath(event.file),
          reason: "publisher is null",
          publishConfig: safeStringifyJson(publishConfig),
        },
        "not published"
      )
      return
    }

    const providerName = publisher.providerName
    if (this.publishOptions.publish === "onTagOrDraft" && getCiTag() == null && providerName !== "bitbucket" && providerName !== "github") {
      log.info({ file: log.filePath(event.file), reason: "current build is not for a git tag", publishPolicy: "onTagOrDraft" }, `not published to ${providerName}`)
      return
    }

    if (publishConfig.timeout) {
      event.timeout = publishConfig.timeout
    }

    this.taskManager.addTask(publisher.upload(event))
  }

  private async artifactCreatedWithoutExplicitPublishConfig(event: ArtifactCreated) {
    const platformPackager = event.packager
    const target = event.target
    const publishConfigs = await getPublishConfigs(platformPackager, target == null ? null : target.options, event.arch, this.isPublish)

    if (debug.enabled) {
      debug(`artifactCreated (isPublish: ${this.isPublish}): ${safeStringifyJson(event, new Set(["packager"]))},\n  publishConfigs: ${safeStringifyJson(publishConfigs)}`)
    }

    const eventFile = event.file
    if (publishConfigs == null) {
      if (this.isPublish) {
        log.debug({ file: eventFile, reason: "no publish configs" }, "not published")
      }
      return
    }

    const writesUpdateInfo =
      event.isWriteUpdateInfo === true && target != null && eventFile != null && (platformPackager.platform !== Platform.WINDOWS || isSuitableWindowsTarget(target))

    if (this.isPublish) {
      // Enforce the signing requirement before this artifact is uploaded, not only in writeUpdateInfoFiles, which runs
      // after every upload has been awaited. The build-start preflight and onAfterPack already fail early for targets
      // that declare `writesUpdateInfo`; this also covers a custom target that emits update info without declaring it.
      if (writesUpdateInfo) {
        const updateInfoConfigs = await getPublishConfigsForUpdateInfo(platformPackager, publishConfigs, event.arch)
        if (updateInfoConfigs?.some(it => it.publishAutoUpdate !== false)) {
          await platformPackager.requireUpdateSigningKeys(true)
        }
      }

      for (const publishConfig of publishConfigs) {
        if (this.cancellationToken.cancelled) {
          log.debug({ file: event.file, reason: "cancelled" }, "not published")
          break
        }

        await this.scheduleUpload(publishConfig, event, this.getAppInfo(platformPackager))
      }
    }

    if (writesUpdateInfo && !this.cancellationToken.cancelled) {
      this.taskManager.addTask(createUpdateInfoTasks(event, publishConfigs).then(it => this.updateFileWriteTask.push(...it)))
    }
  }

  private getOrCreatePublisher(publishConfig: PublishConfiguration, appInfo: AppInfo): Promise<Publisher | null> {
    // to not include token into cache key
    const providerCacheKey = safeStringifyJson(publishConfig)
    let publisher = this.nameToPublisher.get(providerCacheKey)
    if (publisher == null) {
      publisher = createPublisher(this, appInfo.version, publishConfig, this.publishOptions, this.packager).then(it => {
        if (it != null) {
          log.info({ publisher: it.toString() }, "publishing")
        }
        return it
      })
      // cache the pending promise synchronously — concurrent scheduleUpload calls must share one publisher (and thus one release) instead of racing to create duplicates
      this.nameToPublisher.set(providerCacheKey, publisher)
      // on failure, evict so that a subsequent call can retry (the rejection still propagates to the caller)
      publisher.catch(() => this.nameToPublisher.delete(providerCacheKey))
    }
    return publisher
  }

  // noinspection JSUnusedGlobalSymbols
  cancelTasks() {
    this.taskManager.cancelTasks()
    this.nameToPublisher.clear()
  }

  async awaitTasks(): Promise<void> {
    await this.taskManager.awaitTasks()

    const updateInfoFileTasks = this.updateFileWriteTask
    if (this.cancellationToken.cancelled || updateInfoFileTasks.length === 0) {
      return
    }

    await writeUpdateInfoFiles(updateInfoFileTasks, this.packager, this.isPublish)
    await this.taskManager.awaitTasks()
  }
}

/**
 * The `app-update.yml` config for a single target with the given target-specific options (`null` for none): the
 * target's own publish settings when it emits a manifest under them, otherwise the platform/root ones - the rule of
 * {@link getPackAppUpdatePublishConfiguration} for a pack of one target.
 */
export async function getAppUpdatePublishConfiguration(
  packager: PlatformPackager<any>,
  targetSpecificOptions: TargetSpecificOptions | Nullish,
  arch: Arch,
  /**
   * Whether this is the publish path. Gates both publish-credential resolution and the update-manifest signing
   * requirement. The Linux targets that write `app-update.yml` into the package pass `false`, since for them
   * "validation will be done on publish step" - and that is exactly when signing is enforced too.
   */
  isPublish: boolean,
  /**
   * Set when the caller has already applied the signing requirement for the targets this config is embedded for;
   * the configs resolved here then only decide the embedded trust list, and neither enforce nor warn.
   */
  signingRequirementApplied = false
): Promise<PublishConfiguration | null> {
  const own = await getEmittingUpdateInfoPublishConfigs(packager, targetSpecificOptions, arch, isPublish)
  const publishConfigs = own ?? (await getPlatformUpdateInfoPublishConfigs(packager, arch, isPublish))
  return await createAppUpdateConfiguration(packager, publishConfigs, isPublish, own != null && !signingRequirementApplied)
}

/**
 * The `app-update.yml` config of a packed app dir, which every target built from it ships: see
 * {@link resolvePackAppUpdatePublishConfigs}. Used by the targets that (re)write the file themselves (AppImage,
 * deb/rpm/pacman), so they embed the same feed as PublishManager's afterPack handler - or, for a prepackaged app, any
 * feed at all - and do not race each other with different content.
 */
export async function getPackAppUpdatePublishConfiguration(
  packager: PlatformPackager<any>,
  targets: ReadonlyArray<Target>,
  arch: Arch,
  isPublish: boolean
): Promise<PublishConfiguration | null> {
  const { publishConfigs, emitsManifest } = await resolvePackAppUpdatePublishConfigs(packager, targets, arch, isPublish)
  return await createAppUpdateConfiguration(packager, publishConfigs, isPublish, emitsManifest)
}

/**
 * The publish configs whose first provider becomes the `app-update.yml` shared by all targets of one pack (for a
 * manifest-emitting target, the first provider that receives its manifest - see getEmittingUpdateInfoPublishConfigs):
 *
 * - the targets that emit a manifest (`writesUpdateInfo`, and on Windows an electron-updater-aware one) under their
 *   own effective publish settings - target-level `publish` first, then platform, then root - decide it;
 * - if several do, their first providers must be the same feed ({@link appUpdateFeedIdentity}: publish-only options
 *   may differ): one app dir holds one `app-update.yml`, so otherwise some installs would poll a feed that never
 *   receives their manifest. That is a configuration error;
 * - with none (a snap-only pack, or `nsis.publish: null`), it comes from the platform/root settings, as before -
 *   including the GitHub fallback from repository info when no level configures `publish` at all.
 *
 * `emitsManifest` tells whether any target of the pack emits one, i.e. whether the signing requirement applies.
 */
async function resolvePackAppUpdatePublishConfigs(
  packager: PlatformPackager<any>,
  targets: ReadonlyArray<Target>,
  arch: Arch,
  isPublish: boolean
): Promise<{ publishConfigs: Array<PublishConfiguration> | null; emitsManifest: boolean }> {
  const writers: Array<{ target: Target; publishConfigs: Array<PublishConfiguration> }> = []
  for (const target of targets) {
    const publishConfigs = await getTargetManifestPublishConfigs(packager, target, arch, isPublish)
    if (publishConfigs != null) {
      writers.push({ target, publishConfigs })
    }
  }
  if (writers.length === 0) {
    return { publishConfigs: await getPlatformUpdateInfoPublishConfigs(packager, arch, isPublish), emitsManifest: false }
  }

  const embedded = appUpdateFeedIdentity(writers[0].publishConfigs[0])
  if (writers.some(it => appUpdateFeedIdentity(it.publishConfigs[0]) !== embedded)) {
    reportConflictingAppUpdateFeeds(packager, writers, arch, isPublish)
    // not publishing: no app-update.yml, the same package the error would have prevented - picking one of the feeds
    // would silently ship installs that poll a feed without their manifest
    return { publishConfigs: null, emitsManifest: true }
  }
  return { publishConfigs: writers[0].publishConfigs, emitsManifest: true }
}

// keyed by platform packager (one per platform and build): afterPack and the targets writing app-update.yml themselves
// resolve the same pack, and every arch usually repeats the same conflict - report each one once
const reportedFeedConflicts = new WeakMap<PlatformPackager<any>, Set<string>>()

/**
 * Targets of one pack resolve different app-update.yml feeds: an InvalidConfigurationError when publishing, otherwise
 * a warning that says so, so the misconfiguration surfaces before a release is built with it.
 */
function reportConflictingAppUpdateFeeds(
  packager: PlatformPackager<any>,
  writers: ReadonlyArray<{ target: Target; publishConfigs: Array<PublishConfiguration> }>,
  arch: Arch,
  isPublish: boolean
): void {
  const targets = writers.map(it => `"${it.target.name}"`).join(", ")
  const feeds = writers.map(it => `${it.target.name} -> ${it.publishConfigs[0]?.provider ?? "none"}`).join(", ")
  const problem =
    `targets ${targets} are built from the same ${packager.platform.name} ${Arch[arch]} app, which holds a single app-update.yml, ` +
    `but their publish settings resolve to different auto-update feeds (${feeds}; the first provider of each that receives the manifest is embedded)`
  const solution = `configure \`publish\` once at the platform level (\`${packager.platform.buildConfigurationKey}.publish\`) and remove the target-level overrides, or point their first providers at the same feed`
  if (isPublish) {
    throw new InvalidConfigurationError(`${problem}. To fix it, ${solution}.`)
  }

  let reported = reportedFeedConflicts.get(packager)
  if (reported == null) {
    reported = new Set<string>()
    reportedFeedConflicts.set(packager, reported)
  }
  if (reported.has(feeds)) {
    return
  }
  reported.add(feeds)
  log.warn(
    { solution },
    `${problem}. No app-update.yml is written, so installed apps get neither an update feed nor the update-manifest public key. ` +
      "Publishing this configuration fails with an InvalidConfigurationError."
  )
}

// Options that only the publisher reads (the upload itself), never electron-updater, so they cannot make two otherwise
// identical first providers different feeds. Everything else is compared - including fields of custom providers and
// options such as `requestHeaders`, `token` or `private` that change how or whether the updater can read the feed.
const PUBLISH_ONLY_OPTIONS = new Set(["publishAutoUpdate", "timeout"])
const S3_PUBLISH_ONLY_OPTIONS = new Set(["acl", "storageClass", "encryption"])

/**
 * What makes two first providers the same app-update.yml feed: the provider and every option that decides where, or
 * how, electron-updater reads the manifest (url, bucket, region, path, owner, repo, channel, ...). Publish-only options
 * and unset (nullish) values are left out, and key order does not matter - so `publishAutoUpdate: true` against an
 * absent flag is the same feed, a different url or bucket is not.
 */
function appUpdateFeedIdentity(config: PublishConfiguration | Nullish): string {
  if (config == null) {
    return "null"
  }
  const isS3Like = config.provider === "s3" || config.provider === "spaces" || config.provider === "r2"
  const identity = Object.fromEntries(
    Object.entries(config).filter(([key, value]) => value != null && !PUBLISH_ONLY_OPTIONS.has(key) && !(isS3Like && S3_PUBLISH_ONLY_OPTIONS.has(key)))
  )
  // key order does not make two configs different feeds
  return JSON.stringify(identity, (_key, value) =>
    value != null && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map(key => [key, value[key]])
        )
      : value
  )
}

async function getPlatformUpdateInfoPublishConfigs(packager: PlatformPackager<any>, arch: Arch, isPublish: boolean): Promise<Array<PublishConfiguration> | null> {
  return await getPublishConfigsForUpdateInfo(packager, await getPublishConfigs(packager, null, arch, isPublish), arch)
}

/**
 * The embedded `app-update.yml` config (first provider, updater cache dir, Windows publisher name, manifest trust
 * list) for already-resolved publish configs. `requireSigning` applies the update-manifest signing requirement
 * (error when publishing, advisory otherwise) before the trust list is derived.
 */
async function createAppUpdateConfiguration(
  packager: PlatformPackager<any>,
  publishConfigs: Array<PublishConfiguration> | null,
  isPublish: boolean,
  requireSigning: boolean
): Promise<PublishConfiguration | null> {
  if (publishConfigs == null || publishConfigs.length === 0) {
    return null
  }

  const publishConfig = {
    ...publishConfigs[0],
    updaterCacheDirName: packager.appInfo.updaterCacheDirName,
  }
  warnAboutGenericFeedQuery(publishConfig)

  if (packager.platform === Platform.WINDOWS && publishConfig.publisherName == null) {
    const winPackager = packager as WinPackager
    const publisherName = winPackager.isForceCodeSigningVerification ? await (await winPackager.signingManager.value).computedPublisherName.value : undefined
    if (publisherName != null) {
      publishConfig.publisherName = publisherName
    }
  }

  // Embed the update-manifest trust list so the updater can verify signed manifests. An explicit
  // `publicKey` list wins as-is; otherwise the public half of every configured signing key is derived
  // so the user only manages the secrets. One key is written as a plain string (byte-identical to the
  // single-key format), several as a YAML list.
  const updateManifestConfig = packager.updateManifestOptions
  // `updateManifestPublicKey` is only ever assigned right below, on this fresh copy, so a value that is
  // already present can only have come from the user's `publish` configuration. Rejecting it (rather than
  // taking it as-is) keeps the trust list on the single validated path and stops a stale hand-copied key
  // from silently shadowing the derived one.
  if (publishConfig.updateManifestPublicKey != null) {
    throw new InvalidConfigurationError("publish.updateManifestPublicKey is managed by electron-builder and must not be set; configure updateManifest.publicKey instead")
  }
  // The very same keys updateInfoBuilder signs `latest*.yml` with, so env-var-only signing
  // (no `updateManifest` config block) embeds the matching public keys too, and the two sides
  // cannot disagree about whether signing is enabled.
  // Whether the requirement applies was decided by the caller from the manifest-emitting targets (a publish target
  // with `publishAutoUpdate: false` on every provider emits none, so it is waived there) - the trust list is still
  // embedded if keys happen to be configured. Only app-update.yml is limited to the first provider:
  // createUpdateInfoTasks writes a manifest for every configured one, so the waiver must hold for all of them.
  const signingKeys = requireSigning ? await packager.requireUpdateSigningKeys(isPublish) : await packager.updateSigningKeys.value
  // `false` is the opt-out and carries no config object to read `publicKey` from
  const explicitKeys = updateManifestConfig === false ? [] : normalizeExplicitPublicKeys(updateManifestConfig?.publicKey)
  const trustedKeys = explicitKeys.length > 0 ? explicitKeys : signingKeys.map(derivePublicKeyPem)
  if (trustedKeys.length > 0) {
    publishConfig.updateManifestPublicKey = trustedKeys.length === 1 ? trustedKeys[0] : trustedKeys
  }
  if (signingKeys.length > 0 && explicitKeys.length > 0) {
    const trustedIds = new Set(trustedKeys.map(computeUpdateManifestKeyId))
    if (!signingKeys.some(key => trustedIds.has(computeUpdateManifestKeyId(key)))) {
      log.warn(
        { platform: packager.platform.name, trustedKeys: trustedKeys.length },
        "none of the update-manifest signing keys is in updateManifest.publicKey: installs of this release will not be able to verify manifests signed with the current key(s). " +
          "Intended only for a deliberate bridge release; otherwise add the current public key to updateManifest.publicKey."
      )
    }
  }
  return publishConfig
}

/**
 * Normalizes the configured `updateManifest.publicKey` (string, multi-PEM string, or array) into distinct,
 * validated Ed25519 public keys, preserving order. Duplicates and non-Ed25519 keys are configuration errors.
 */
function normalizeExplicitPublicKeys(value: string | Array<string> | null | undefined): Array<string> {
  const keys = normalizePublicKeyList(value)
  const seen = new Map<string, number>()
  keys.forEach((key, index) => {
    let keyId: string
    try {
      keyId = computeUpdateManifestKeyId(key)
    } catch (e: any) {
      throw new InvalidConfigurationError(`updateManifest.publicKey #${index + 1} is not a valid Ed25519 public key: ${e.message || e}`)
    }
    const previous = seen.get(keyId)
    if (previous != null) {
      throw new InvalidConfigurationError(`updateManifest.publicKey #${index + 1} duplicates entry #${previous + 1} (key id ${keyId}). List each trusted key once.`)
    }
    seen.set(keyId, index)
  })
  return keys
}

export async function writeAppUpdateYaml(resourcesDir: string, publishConfig: PublishConfiguration): Promise<void> {
  await outputFile(path.join(resourcesDir, "app-update.yml"), serializeToYaml(publishConfig))
}

export async function getPublishConfigsForUpdateInfo(
  packager: PlatformPackager<any>,
  publishConfigs: Array<PublishConfiguration> | null,
  arch: Arch | null
): Promise<Array<PublishConfiguration> | null> {
  if (publishConfigs === null) {
    return null
  }

  if (publishConfigs.length === 0) {
    log.debug(null, "getPublishConfigsForUpdateInfo: no publishConfigs, detect using repository info")
    // https://github.com/electron-userland/electron-builder/issues/925#issuecomment-261732378
    // default publish config is github, file should be generated regardless of publish state (user can test installer locally or manage the release process manually)
    const repositoryInfo = await packager.repositoryInfo
    debug(`getPublishConfigsForUpdateInfo: ${safeStringifyJson(repositoryInfo)}`)
    if (repositoryInfo != null && repositoryInfo.type === "github") {
      const resolvedPublishConfig = await getResolvedPublishConfig(packager, { provider: repositoryInfo.type }, arch, false)
      if (resolvedPublishConfig != null) {
        debug(`getPublishConfigsForUpdateInfo: resolve to publish config ${safeStringifyJson(resolvedPublishConfig)}`)
        return [resolvedPublishConfig]
      }
    }
  }
  return publishConfigs
}

async function resolveReleaseBody(packager: Packager): Promise<string | null> {
  const releaseInfo = packager.config.releaseInfo
  if (releaseInfo?.releaseNotes) {
    return releaseInfo.releaseNotes
  }
  if (releaseInfo?.releaseNotesFile) {
    try {
      return await readFile(path.resolve(packager.projectDir, releaseInfo.releaseNotesFile), "utf-8")
    } catch (e: any) {
      log.warn({ file: releaseInfo.releaseNotesFile, error: e.message }, "cannot read release notes file")
      return null
    }
  }
  try {
    return await readFile(path.resolve(packager.projectDir, "release-notes.md"), "utf-8")
  } catch {
    return null
  }
}

export async function createPublisher(
  context: PublishContext,
  version: string,
  publishConfig: PublishConfiguration,
  options: PublishOptions,
  packager: Packager
): Promise<Publisher | null> {
  if (debug.enabled) {
    debug(`Create publisher: ${safeStringifyJson(publishConfig)}`)
  }

  const provider = publishConfig.provider
  switch (provider) {
    case "github": {
      const releaseBody = await resolveReleaseBody(packager)
      const releaseName = packager.config.releaseInfo?.releaseName ?? null
      return new GitHubPublisher(context, publishConfig as GithubOptions, version, options, releaseBody, releaseName)
    }

    case "gitlab": {
      const releaseBody = await resolveReleaseBody(packager)
      const releaseName = packager.config.releaseInfo?.releaseName ?? null
      return new GitlabPublisher(context, publishConfig as GitlabOptions, version, releaseBody, releaseName)
    }

    case "keygen":
      return new KeygenPublisher(context, publishConfig as KeygenOptions, version)

    case "snapStore":
      return new SnapStorePublisher(context, publishConfig as SnapStoreOptions, { cscLink: packager.config.snapcraft?.cscLink, resourcesDir: packager.buildResourcesDir })

    case "generic":
      return null

    default: {
      const clazz = await requireProviderClass(provider, packager)
      return clazz == null ? null : new clazz(context, publishConfig)
    }
  }
}

async function requireProviderClass(provider: string, packager: { buildResourcesDir: string; appInfo: AppInfo }): Promise<any | null> {
  switch (provider) {
    case "github":
      return GitHubPublisher

    case "gitlab":
      return GitlabPublisher

    case "generic":
      return null

    case "keygen":
      return KeygenPublisher

    case "s3":
      return S3Publisher

    case "snapStore":
      return SnapStorePublisher

    case "spaces":
      return SpacesPublisher

    case "r2":
      return R2Publisher

    case "bitbucket":
      return BitbucketPublisher

    default: {
      const extensions = ["mjs", "js", "cjs"]
      const template = `electron-publisher-${provider}`
      const name = (ext: string) => `${template}.${ext}`

      const validPublisherFiles = extensions.map(ext => path.join(packager.buildResourcesDir, name(ext)))
      for (const potentialFile of validPublisherFiles) {
        if (await exists(potentialFile)) {
          const module: any = await resolveModule(packager.appInfo.type, potentialFile)
          return module.default || module
        }
      }
      log.error({ path: log.filePath(packager.buildResourcesDir), template, extensionsChecked: extensions }, "unable to find publish provider in build resources")
      throw new InvalidConfigurationError(`Cannot find module for publisher "${provider}" with any extension: ${extensions.join(", ")}`)
    }
  }
}

export function computeDownloadUrl(publishConfiguration: PublishConfiguration, fileName: string | null, packager: PlatformPackager<any>) {
  if (publishConfiguration.provider === "generic") {
    const baseUrlString = (publishConfiguration as GenericServerOptions).url
    if (fileName == null) {
      return baseUrlString
    }

    const baseUrl = parseUrl(baseUrlString)
    const u = new URL(baseUrl?.href ?? baseUrlString)
    u.pathname = path.posix.resolve(u.pathname || "/", encodeURI(fileName))
    return u.href
  }

  let baseUrl
  if (publishConfiguration.provider === "github") {
    const gh = publishConfiguration as GithubOptions
    baseUrl = `${githubUrl(gh)}/${gh.owner}/${gh.repo}/releases/download/${githubTagPrefix(gh)}${packager.appInfo.version}`
  } else {
    baseUrl = getS3LikeProviderBaseUrl(publishConfiguration)
  }

  if (fileName == null) {
    return baseUrl
  }
  return `${baseUrl}/${encodeURI(fileName)}`
}

export async function getPublishConfigs(
  platformPackager: PlatformPackager<any>,
  targetSpecificOptions: PlatformSpecificBuildOptions | Nullish,
  arch: Arch | null,
  errorIfCannot: boolean
): Promise<Array<PublishConfiguration> | null> {
  let publishers

  // check build.nsis (target)
  if (targetSpecificOptions != null) {
    publishers = targetSpecificOptions.publish
    // if explicitly set to null - do not publish
    if (publishers === null) {
      return null
    }
  }

  // check build.win (platform)
  if (publishers == null) {
    publishers = platformPackager.platformOptions.publish
    if (publishers === null) {
      return null
    }
  }

  if (publishers == null) {
    publishers = platformPackager.config.publish
    if (publishers === null) {
      return null
    }
  }
  return await resolvePublishConfigurations(publishers, platformPackager, arch, errorIfCannot)
}

async function resolvePublishConfigurations(
  publishers: any,
  platformPackager: PlatformPackager<any> | null,
  arch: Arch | null,
  errorIfCannot: boolean,
  fallbackPackager?: Packager
): Promise<Array<PublishConfiguration> | null> {
  if (publishers == null) {
    let serviceName: PublishProvider | null = null
    if (!isEmptyOrSpaces(process.env.GH_TOKEN) || !isEmptyOrSpaces(process.env.GITHUB_TOKEN)) {
      serviceName = "github"
    } else if (!isEmptyOrSpaces(process.env.GITLAB_TOKEN)) {
      serviceName = "gitlab"
    } else if (!isEmptyOrSpaces(process.env.KEYGEN_TOKEN)) {
      serviceName = "keygen"
    } else if (!isEmptyOrSpaces(process.env.BITBUCKET_TOKEN)) {
      serviceName = "bitbucket"
    } else if (!isEmptyOrSpaces(process.env.BT_TOKEN)) {
      throw new Error(
        "Bintray has been sunset and is no longer supported by electron-builder. Ref: https://jfrog.com/blog/into-the-sunset-bintray-jcenter-gocenter-and-chartcenter/"
      )
    }

    if (serviceName != null) {
      log.debug(null, `detect ${serviceName} as publish provider`)
      return [(await getResolvedPublishConfig(platformPackager, { provider: serviceName }, arch, errorIfCannot, fallbackPackager))!]
    }
  }

  if (publishers == null) {
    return []
  }

  debug(`Explicit publish provider: ${safeStringifyJson(publishers)}`)
  return (await Promise.all(
    asArray(publishers).map(it => getResolvedPublishConfig(platformPackager, typeof it === "string" ? { provider: it } : it, arch, errorIfCannot, fallbackPackager))
  )) as PublishConfiguration[]
}

/**
 * The update-info publish configs `target` emits an auto-update manifest for under its own effective publish settings,
 * else `null`: target-level `publish` first, `null` means none, and `publishAutoUpdate: false` on every provider means
 * no manifest.
 */
async function getTargetManifestPublishConfigs(packager: PlatformPackager<any>, target: Target, arch: Arch, errorIfCannot: boolean): Promise<Array<PublishConfiguration> | null> {
  if (!target.writesUpdateInfo || (packager.platform === Platform.WINDOWS && !isSuitableWindowsTarget(target))) {
    return null
  }
  return await getEmittingUpdateInfoPublishConfigs(packager, target.options, arch, errorIfCannot)
}

/**
 * The update-info publish configs that receive a manifest, resolved for the given target-specific options (target,
 * then platform, then root; GitHub from repository info when none configures `publish`), or `null` when they emit
 * none: `publish: null`, or `publishAutoUpdate: false` on every provider. Providers with `publishAutoUpdate: false`
 * are left out - writeUpdateInfoFiles writes no `latest*.yml` for them - so the first provider, the one embedded in
 * app-update.yml, is always one the manifest is uploaded to.
 */
async function getEmittingUpdateInfoPublishConfigs(
  packager: PlatformPackager<any>,
  targetSpecificOptions: PlatformSpecificBuildOptions | Nullish,
  arch: Arch,
  errorIfCannot: boolean
): Promise<Array<PublishConfiguration> | null> {
  const updateInfoConfigs = await getPublishConfigsForUpdateInfo(packager, await getPublishConfigs(packager, targetSpecificOptions, arch, errorIfCannot), arch)
  const emitting = updateInfoConfigs?.filter(it => it.publishAutoUpdate !== false) ?? []
  return emitting.length === 0 ? null : emitting
}

function isSuitableWindowsTarget(target: Target) {
  if (target.name === "appx" && target.options != null && (target.options as any).electronUpdaterAware) {
    return true
  }
  return target.name === "nsis" || target.name.startsWith("nsis-")
}

function expandPublishConfig(options: any, platformPackager: PlatformPackager<any> | null, arch: Arch | null): void {
  for (const name of Object.keys(options)) {
    const value = options[name]
    if (typeof value === "string") {
      const archValue = arch == null ? null : Arch[arch]
      const expanded = platformPackager == null ? value : platformPackager.expandMacro(value, archValue)
      if (expanded !== value) {
        options[name] = expanded
      }
    }
  }
}

function isDetectUpdateChannel(platformSpecificConfiguration: PlatformSpecificBuildOptions | null, configuration: Configuration) {
  const value = platformSpecificConfiguration == null ? null : platformSpecificConfiguration.detectUpdateChannel
  return value == null ? configuration.detectUpdateChannel !== false : value
}

// keyed by the build's CancellationToken (one instance per Packager) so that a build reports a given feed once - getResolvedPublishConfig
// is called per target and arch - without leaking state between programmatic builds running in the same process
const reportedInferredUpdateFeeds = new WeakMap<CancellationToken, Set<string>>()

/** @internal */
export function parseGithubRepoShorthand(repo: string): { owner: string; repo: string } | null {
  const separator = repo.indexOf("/")
  return separator > 0 ? { owner: repo.substring(0, separator), repo: repo.substring(separator + 1) } : null
}

// the inferred repository becomes the publish/update destination and, for auto-update-capable targets, is written
// verbatim into app-update.yml inside every shipped build as its permanent update feed - so the developer has to be
// told which repository they are committing to. A repository taken from package.json "repository" is deliberate
// configuration (info); one picked up from the CI environment or .git/config is not (warn).
function logInferredUpdateFeed(
  buildId: CancellationToken,
  provider: PublishProvider,
  owner: string,
  project: string,
  source: string | undefined,
  inferredFields: Array<string>
): void {
  let reported = reportedInferredUpdateFeeds.get(buildId)
  if (reported == null) {
    reported = new Set<string>()
    reportedInferredUpdateFeeds.set(buildId, reported)
  }

  const feed = `${provider}:${owner}/${project}`
  if (reported.has(feed)) {
    return
  }
  reported.add(feed)

  const fields = {
    reason: `${inferredFields.join(" and ")} not specified in the publish configuration`,
    source: source ?? "unknown",
    provider,
    owner,
    ...(provider === "bitbucket" ? { slug: project } : { repo: project }),
  }
  const message =
    "update feed inferred from repository info; it will be used as the publish/update destination (written to app-update.yml in auto-update-capable targets) - specify it explicitly to be sure it stays under your control"
  if (source === "package.json") {
    log.info(fields, message)
  } else {
    log.warn(fields, message)
  }
}

async function getResolvedPublishConfig(
  platformPackager: PlatformPackager<any> | null,
  options: PublishConfiguration,
  arch: Arch | null,
  errorIfCannot: boolean,
  fallbackPackager?: Packager
): Promise<PublishConfiguration | GithubOptions | BitbucketOptions | GitlabOptions | null> {
  options = { ...options }
  expandPublishConfig(options, platformPackager, arch)

  const ctx = platformPackager ?? fallbackPackager!
  let channelFromAppVersion: string | null = null
  if ((options as GenericServerOptions).channel == null && isDetectUpdateChannel(platformPackager == null ? null : platformPackager.platformOptions, ctx.config)) {
    channelFromAppVersion = ctx.appInfo.channel
  }

  const provider = options.provider
  if (provider === "generic") {
    const o = options as GenericServerOptions
    if (o.url == null) {
      throw new InvalidConfigurationError(`Please specify "url" for "generic" update server`)
    }

    if (channelFromAppVersion != null) {
      ;(o as any).channel = channelFromAppVersion
    }
    return options
  }

  const providerClass = await requireProviderClass(options.provider, ctx)
  if (providerClass != null && providerClass.checkAndResolveOptions != null) {
    await providerClass.checkAndResolveOptions(options, channelFromAppVersion, errorIfCannot)
    return options
  }

  if (provider === "keygen") {
    return {
      ...options,
      platform: platformPackager?.platform.name,
    } as KeygenOptions
  }

  const isGithub = provider === "github"
  if (!isGithub && provider !== "bitbucket") {
    return options
  }

  let owner = isGithub ? (options as GithubOptions).owner : (options as BitbucketOptions).owner
  let project = isGithub ? (options as GithubOptions).repo : (options as BitbucketOptions).slug

  if (isGithub && owner == null && project != null) {
    const shorthand = parseGithubRepoShorthand(project)
    if (shorthand != null) {
      owner = shorthand.owner
      project = shorthand.repo
    }
  }

  async function getInfo() {
    const info = await ctx.repositoryInfo
    if (info != null) {
      return info
    }

    const message = `Cannot detect repository by .git/config. Please specify "repository" in the package.json (https://docs.npmjs.com/files/package.json#repository).\nPlease see https://electron.build/publish`
    if (errorIfCannot) {
      throw new Error(message)
    } else {
      log.warn(message)
      return null
    }
  }

  if (!owner || !project) {
    log.debug({ reason: "owner or project is not specified explicitly", provider, owner, project }, "calling getInfo")
    const info = await getInfo()
    if (info == null) {
      return null
    }

    const inferredFields: Array<string> = []
    if (!owner) {
      owner = info.user
      inferredFields.push("owner")
    }
    if (!project) {
      project = info.project
      inferredFields.push(isGithub ? "repo" : "slug")
    }

    logInferredUpdateFeed(ctx.cancellationToken, provider, owner, project, info.source, inferredFields)
  }

  if (isGithub) {
    if ((options as GithubOptions).token != null && !(options as GithubOptions).private) {
      log.warn('"token" specified in the github publish options. It should be used only for [setFeedURL](module:electron-updater/out/AppUpdater.AppUpdater+setFeedURL).')
    }
    //tslint:disable-next-line:no-object-literal-type-assertion
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- required by the TS 5.1 that typescript-json-schema bundles (pnpm generate:schema)
    return { owner, repo: project, ...options } as GithubOptions
  } else {
    //tslint:disable-next-line:no-object-literal-type-assertion
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- required by the TS 5.1 that typescript-json-schema bundles (pnpm generate:schema)
    return { owner, slug: project, ...options } as BitbucketOptions
  }
}
