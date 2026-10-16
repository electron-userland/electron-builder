import { notarize, type NotarizeOptions, type NotaryToolKeychainCredentials } from "@electron/notarize"
import type { PerFileSignOptions, SigningDistributionType, SignOptions } from "@electron/osx-sign"
import { Arch, InvalidConfigurationError, log, MAX_FILE_REQUESTS, spawnAndWriteWithOutput, statOrNull, walk } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { open, type FileHandle } from "fs/promises"
import * as path from "path"
import { CertType, findIdentity, Identity, reportError } from "../../codeSign/mac/macCodeSign.js"
import { SigningResult } from "../../codeSign/signResult.js"
import type { MacPackager } from "../../macPackager.js"
import { ElectronSignOptions, MasConfiguration } from "../../options/macOptions.js"
import { parsePlistFile, savePlistFile, PlistObject, PlistValue } from "../../util/mac/plist.js"
import { getTemplatePath } from "../../util/pathManager.js"
import asyncPool from "tiny-async-pool"

export type MasPlatformType = "mas" | "mas-dev"
export type PlatformType = MasPlatformType | "mac"

const DISABLE_LIBRARY_VALIDATION = "com.apple.security.cs.disable-library-validation"
const APP_SANDBOX = "com.apple.security.app-sandbox"

export class MacTargetHelper {
  constructor(private packager: MacPackager) {}

  /** Ad-hoc signing (`sign.identity: "-"`) produces a signature with no Team ID. */
  static isAdHocIdentity(identity: Identity | Nullish): boolean {
    return identity?.name === "-"
  }

  handleNullIdentity(): SigningResult {
    if (this.packager.forceCodeSigning) {
      throw new InvalidConfigurationError("identity explicitly is set to null, but forceCodeSigning is set to true")
    }
    // The meaning of `mac.sign: null` flipped in v27. In v26 `sign` was only a custom-signer hook, so
    // null meant "no custom signer" and the app was still signed normally; now it means "do not sign".
    // A v26 config carried over unchanged therefore ships an UNSIGNED app with no other signal.
    log.warn(
      {
        reason: "identity explicitly is set to null",
        solution: "remove `sign: null` to sign normally, or set `mac.sign.identity` — keep it only if you intend to ship an unsigned app",
      },
      'skipped macOS code signing. Note this changed in v27: `mac.sign: null` now means "do not sign", whereas in v26 it only meant "no custom signer" and the app was still signed. ' +
        "See https://www.electron.build/docs/migration/v27-breaking-changes#macos-signing-macsign"
    )
    return "skipped:disabled"
  }

  async findSigningIdentity(
    targetPlatform: PlatformType,
    qualifier: string | undefined,
    keychainFile: string | Nullish,
    hasCustomSign: boolean,
    signOpts: ElectronSignOptions | null | undefined
  ): Promise<Identity | null> {
    const isMas = MacTargetHelper.isMasTarget(targetPlatform)
    const certificateTypes = MacTargetHelper.getCertificateTypes(targetPlatform, MacTargetHelper.resolveSigningType(targetPlatform, signOpts?.type))

    let identity: Identity | null = null
    for (const certificateType of certificateTypes) {
      identity = await findIdentity(certificateType, qualifier, keychainFile)
      if (identity != null) {
        break
      }
    }

    if (identity == null) {
      const noIdentity = !hasCustomSign
      if (qualifier === "-") {
        if (MacTargetHelper.isHardenedRuntimeEnabledForSigning(targetPlatform, signOpts?.hardenedRuntime) && !(await this.isLibraryValidationDisabled(targetPlatform, signOpts))) {
          log.warn(
            null,
            `ad-hoc signing with hardenedRuntime enabled requires the ${DISABLE_LIBRARY_VALIDATION} entitlement ` +
              "in both the app entitlements (build/entitlements.mac.plist or mac.sign.entitlements) and the inherit entitlements " +
              "(build/entitlements.mac.inherit.plist or mac.sign.entitlementsInherit) to prevent app launch failures due to library validation, " +
              "but at least one of your entitlements files does not grant it. " +
              "See https://electron.build/docs/features/code-signing for details."
          )
        }
        identity = new Identity("-", undefined)
      } else if (noIdentity) {
        await reportError(isMas, certificateTypes, qualifier, keychainFile, this.packager.forceCodeSigning)
        return null
      }
    }

    return identity
  }

  /**
   * Resolves the app and inherit entitlements files for an ad-hoc build — same precedence as `getAppEntitlements()` and
   * `getInheritEntitlements()` — and returns whether both grant `com.apple.security.cs.disable-library-validation`.
   *
   * An ad-hoc signature carries no Team ID, so every process in the bundle — the app and each helper — fails library
   * validation when it loads the Electron framework unless its own entitlements disable it. A user-supplied inherit
   * plist (e.g. a production `build/entitlements.mac.inherit.plist`) without the key therefore breaks the helpers even
   * when the app entitlements grant it, which is why both files are checked.
   *
   * Fails open: returns false (so callers still warn) when either file cannot be read or parsed, or when no file
   * resolves at all (`@electron/osx-sign`'s defaults never grant the key). An explicit `sign.entitlements` /
   * `sign.entitlementsInherit` path that does not exist is a configuration error and throws, like any other missing
   * build resource.
   */
  async isLibraryValidationDisabled(targetPlatform: PlatformType, signOpts: ElectronSignOptions | Nullish): Promise<boolean> {
    const [appEntitlements, inheritEntitlements] = await Promise.all([
      this.getAppEntitlements(targetPlatform, signOpts, true /* adHoc */),
      this.getInheritEntitlements(targetPlatform, signOpts, true /* adHoc */),
    ])
    return (await this.grantsDisableLibraryValidation(appEntitlements)) && (await this.grantsDisableLibraryValidation(inheritEntitlements))
  }

  private async grantsDisableLibraryValidation(file: string | null): Promise<boolean> {
    return (await this.entitlementsValue(file, DISABLE_LIBRARY_VALIDATION)) === true
  }

  /**
   * The value the entitlements file assigns to `key`, or `undefined` when the key is absent or the file cannot be
   * read or parsed. Returns the raw value rather than a boolean because callers disagree on the predicate: an
   * opt-out we act on ourselves is required to be literally `true`, while a key we are predicting
   * `@electron/osx-sign` will act on has to use osx-sign's own truthiness test.
   */
  private async entitlementsValue(file: string | null, key: string): Promise<PlistValue | undefined> {
    if (file == null) {
      // no user-supplied file and no bundled default — @electron/osx-sign's defaults never grant the key
      return undefined
    }
    try {
      const entitlements = await parsePlistFile<PlistObject>(file)
      return entitlements[key]
    } catch (e: any) {
      log.debug({ file, key, error: e.message }, "cannot read entitlements")
      return undefined
    }
  }

  /**
   * Resolves the entitlements file for the app bundle itself.
   *
   * Precedence: explicit `sign.entitlements` → `build/entitlements.{mac,mas}.plist` → a bundled default.
   * The explicit path is resolved like every other build resource (build resources dir, then project dir) and
   * must exist. Returns `null` when no default applies, which lets `@electron/osx-sign` fall back to its own
   * Chromium-derived defaults (`default.mas.plist` for MAS).
   */
  async getAppEntitlements(targetPlatform: PlatformType, signOpts: ElectronSignOptions | Nullish, adHoc: boolean): Promise<string | null> {
    const isMas = MacTargetHelper.isMasTarget(targetPlatform)
    // an explicit `sign.entitlements` resolves like every other build resource (build resources dir, then project dir);
    // `null`/empty behave like unset so the `build/entitlements.{mac,mas}.plist` convention still applies
    const entitlements = await this.packager.getResource(signOpts?.entitlements || undefined, `entitlements.${isMas ? "mas" : "mac"}.plist`)
    if (entitlements != null) {
      return entitlements
    }
    if (isMas) {
      // @electron/osx-sign's default.mas.plist enables the App Sandbox, which a MAS build cannot ship without
      return null
    }
    return getTemplatePath(adHoc ? "entitlements.mac.adhoc.plist" : "entitlements.mac.plist")
  }

  /**
   * Resolves the entitlements file for the nested binaries (helpers, frameworks, unpacked executables) that
   * inherit the app's signature.
   *
   * Precedence: explicit `sign.entitlementsInherit` → `build/entitlements.{mac,mas}.inherit.plist` → `null`,
   * which hands the file to `@electron/osx-sign`'s per-file defaults, modelled on Chromium's own entitlements
   * (the explicit path is resolved like every other build resource — build resources dir, then project dir — and must exist):
   * - renderer and GPU helpers: `allow-jit` only
   * - plugin helper: `allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`
   * - everything else (frameworks, `.node` modules, unpacked executables): `default.darwin.plist`, i.e. `allow-jit`
   *   plus Chromium's `device.*` / `personal-information.*` entitlements
   * Nested binaries therefore do not inherit the app's entitlements, and apart from the plugin helper none of these
   * defaults grant `disable-library-validation` or `allow-unsigned-executable-memory`.
   */
  async getInheritEntitlements(targetPlatform: PlatformType, signOpts: ElectronSignOptions | Nullish, adHoc: boolean): Promise<string | null> {
    const isMas = MacTargetHelper.isMasTarget(targetPlatform)
    // an explicit `sign.entitlementsInherit` resolves like every other build resource (build resources dir, then project dir);
    // `null`/empty behave like unset so the `build/entitlements.{mac,mas}.inherit.plist` convention still applies
    const entitlements = await this.packager.getResource(signOpts?.entitlementsInherit || undefined, `entitlements.${isMas ? "mas" : "mac"}.inherit.plist`)
    if (entitlements != null) {
      return entitlements
    }
    // an ad-hoc signature has no Team ID, so every process in the bundle — not just the main one — needs
    // library validation disabled or it cannot load the Electron framework
    return adHoc && !isMas ? getTemplatePath("entitlements.mac.adhoc.plist") : null
  }

  /**
   * Picks the string handed to `@electron/osx-sign` as `identity`. Two consumers inside osx-sign want different
   * forms of the same certificate, which is why this line has flipped twice before:
   *
   * - `codesign --sign <identity>` needs a *unique* reference. A common name can match several valid certificates
   *   (the same name issued twice with different expiry dates), and `codesign` then fails with
   *   `... : ambiguous (matches "X" and "X" ...)` — `--keychain` does not disambiguate it. Only the SHA-1 hash is
   *   unique. https://github.com/electron-userland/electron-builder/issues/10237
   * - osx-sign's entitlements automation scrapes the Team ID out of the identity *name* with `/^.+\((.+?)\)$/` to
   *   fill in `ElectronTeamID`, and throws `Could not automatically determine ElectronTeamID from identity` when
   *   that fails. A bare hash has no `(TEAMID)` suffix.
   *   https://github.com/electron-userland/electron-builder/issues/7995
   *
   * So we pass the hash and, when that automation is going to run, hand it the Team ID through the one channel it
   * already prefers over the identity name: `ElectronTeamID` in the app's `Info.plist`. Writing that key is exactly
   * what osx-sign would have done itself, from the same source. It reaches the regex only when the App Sandbox is
   * enabled (see `isSandboxed`), no `provisioningProfile` is configured, and `Info.plist` carries no
   * `ElectronTeamID` — so those cases skip the write and pass the hash straight through.
   *
   * Falls back to the name whenever the hash cannot be made to work (no hash at all, ad-hoc, a self-signed name
   * with no `(TEAMID)`, an unreadable `Info.plist`), which leaves the previous behavior — and the previous error
   * message — untouched for those cases.
   *
   * All of this is osx-sign-specific, so a custom signer (`sign` as a function or module path) gets the bare hash
   * and an untouched `Info.plist`: `@electron/osx-sign` never runs, so there is no automation to feed.
   */
  async resolveSignIdentity(appPath: string, identity: Identity, signOpts: ElectronSignOptions | Nullish, targetPlatform: PlatformType, hasCustomSign = false): Promise<string> {
    // ad-hoc ("-") and any name-only identity have nothing to disambiguate with
    if (!identity.hash || MacTargetHelper.isAdHocIdentity(identity)) {
      return identity.name
    }

    // a custom signer replaces @electron/osx-sign entirely. Hand over the unique hash — the form `codesign`
    // needs — and mutate nothing on its behalf. This must stay above every branch below, so a delegated signer
    // never lands in one of their `identity.name` fallbacks.
    if (hasCustomSign) {
      return identity.hash
    }

    // osx-sign's entitlements automation is off, or it takes the Team ID from the profile instead of the identity
    if (signOpts?.preAutoEntitlements === false || signOpts?.provisioningProfile) {
      return identity.hash
    }

    if (!(await this.isSandboxed(appPath, signOpts, targetPlatform))) {
      return identity.hash
    }

    const infoPlistFile = path.join(appPath, "Contents", "Info.plist")
    try {
      const info = await parsePlistFile<PlistObject>(infoPlistFile)
      if (info.ElectronTeamID) {
        // osx-sign prefers this over parsing the identity, so the hash never reaches its regex
        return identity.hash
      }

      // the same pattern osx-sign uses, so we never derive a Team ID it would have rejected
      const teamId = /^.+\((.+?)\)\s*$/.exec(identity.name)?.[1]
      if (teamId == null) {
        log.debug({ identityName: identity.name }, "cannot parse Team ID from identity name, signing with the identity name")
        return identity.name
      }

      await savePlistFile(infoPlistFile, { ...info, ElectronTeamID: teamId })
      log.debug({ file: log.filePath(infoPlistFile), teamId }, "ElectronTeamID set from the signing identity name")
      return identity.hash
    } catch (e: any) {
      log.debug({ file: log.filePath(infoPlistFile), error: e.message }, "cannot read or update Info.plist, signing with the identity name")
      return identity.name
    }
  }

  /**
   * Whether `@electron/osx-sign`'s entitlements automation can reach the `ElectronTeamID`-from-identity-name step
   * that a bare hash cannot satisfy.
   *
   * osx-sign gates the automation on `!filePath.includes('.app/')` and runs it with that path's own entitlements.
   * The app bundle itself always qualifies, under the app entitlements. Two further cases qualify under the
   * inherit entitlements, and only then is that file worth reading: a `sign.binaries` entry (signed alongside the
   * bundle rather than within it), and — when the signed bundle is not named `*.app`, which `--prepackaged`
   * allows — every file inside it, since none of their paths contain `.app/` either.
   *
   * A `null` file means osx-sign falls back to its own default, and only the MAS defaults enable the App Sandbox.
   * Truthiness, not `=== true`, because that is the test osx-sign itself applies.
   */
  private async isSandboxed(appPath: string, signOpts: ElectronSignOptions | Nullish, targetPlatform: PlatformType): Promise<boolean> {
    const isMas = MacTargetHelper.isMasTarget(targetPlatform)
    const grants = async (file: string | null) => (file == null ? isMas : !!(await this.entitlementsValue(file, APP_SANDBOX)))

    if (await grants(await this.getAppEntitlements(targetPlatform, signOpts, false))) {
      return true
    }
    if (!signOpts?.binaries?.length && path.basename(appPath).endsWith(".app")) {
      // nothing but the bundle itself is signed outside a `.app/` path, so the inherit entitlements never apply
      return false
    }
    return await grants(await this.getInheritEntitlements(targetPlatform, signOpts, false))
  }

  async buildSignOptions(
    appPath: string,
    identity: Identity,
    config: ElectronSignOptions | null | undefined,
    keychainFile: string | Nullish,
    arch: Arch,
    targetPlatform: PlatformType,
    hasCustomSign = false
  ): Promise<SignOptions> {
    const isMas = MacTargetHelper.isMasTarget(targetPlatform)
    const type = MacTargetHelper.resolveSigningType(targetPlatform, config?.type)

    let binaries = config?.binaries || undefined
    if (binaries) {
      // Accept absolute paths for external binaries, else resolve relative paths from the artifact's app Contents path.
      binaries = (
        await Promise.all(
          binaries.flatMap(async destination => {
            const expandedDestination = this.packager.expandArch(destination, arch)
            return await Promise.all(
              expandedDestination.map(async d => {
                if (await statOrNull(d)) {
                  return d
                }
                return path.resolve(appPath, d)
              })
            )
          })
        )
      ).flat()
      log.info({ binaries, arch: arch == null ? null : Arch[arch] }, "signing additional user-defined binaries for arch")
    }

    let filter = config?.ignore
    if (Array.isArray(filter)) {
      if (filter.length == 0) {
        filter = undefined
      }
    } else if (typeof filter === "string") {
      filter = filter.length === 0 ? undefined : [filter]
    }

    const filterRe =
      typeof filter === "function"
        ? null
        : filter?.map(it => {
            try {
              return new RegExp(it)
            } catch (e: any) {
              throw new InvalidConfigurationError(`Invalid regex filter pattern: ${it}. ${e.message}`)
            }
          })

    return {
      identityValidation: false,
      // https://github.com/electron-userland/electron-builder/issues/1699
      // kext are signed by the chipset manufacturers. You need a special certificate (only available on request) from Apple to be able to sign kext.
      ignore: (file: string) => {
        if (filterRe != null) {
          for (const regExp of filterRe) {
            if (regExp.test(file)) {
              return true
            }
          }
        }
        if (typeof filter === "function" && filter(file)) {
          return true
        }
        return (
          file.endsWith(".kext") ||
          file.startsWith("/Contents/PlugIns", appPath.length) ||
          file.includes("/node_modules/puppeteer/.local-chromium") ||
          file.includes("/node_modules/playwright-firefox/.local-browsers") ||
          file.includes("/node_modules/playwright/.local-browsers")
        )

        /* Those are browser automating modules, browser (chromium, nightly) cannot be signed
          https://github.com/electron-userland/electron-builder/issues/2010
          https://github.com/electron-userland/electron-builder/issues/5383
          */
      },
      identity: identity ? await this.resolveSignIdentity(appPath, identity, config, targetPlatform, hasCustomSign) : undefined,
      type,
      platform: isMas ? "mas" : "darwin",
      version: this.packager.config.electronVersion || undefined,
      app: appPath,
      keychain: keychainFile || undefined,
      binaries,
      // https://github.com/electron-userland/electron-builder/issues/1480
      strictVerify: config?.strictVerify,
      preAutoEntitlements: config?.preAutoEntitlements,
      optionsForFile: await this.getOptionsForFile(appPath, targetPlatform, config, identity),
      provisioningProfile: config?.provisioningProfile || undefined,
    }
  }

  /**
   * Post-sign diagnostic replacing the blanket `com.apple.security.cs.disable-library-validation` default.
   *
   * Walks the Mach-O libraries and bundles (`MH_DYLIB` / `MH_BUNDLE`) under `Contents/Resources/app.asar.unpacked` and
   * `Contents/PlugIns` and reports the ones whose signature does not carry the Team ID `codesign` reports for the
   * freshly signed app bundle — typically excluded via `sign.ignore`, or fetched at build time already signed by a
   * third party. Only loadable code is checked because library validation applies to what a process loads;
   * executables (`MH_EXECUTE`, e.g. a bundled ffmpeg) are spawned rather than loaded, so a foreign signature on them is
   * not a launch failure and reporting them would be a false positive. `Contents/PlugIns` is covered because
   * `buildSignOptions` never re-signs it, so a bundle there keeps whatever signature it shipped with. Under the
   * hardened runtime those fail library validation when loaded, which is precisely the failure the old default hid
   * from every user instead of only the affected ones.
   *
   * The opt-out is read from the app entitlements (not the inherit ones) because library validation is enforced by
   * the loading process under its own entitlements — the main process, governed by the app plist, is the usual loader
   * of these modules, while the inherit plist only governs loads performed by helper processes.
   *
   * Best-effort: never fails the build, and skips the scan when the app bundle itself has no Team ID (e.g. a
   * self-signed certificate).
   */
  async warnAboutForeignSignedBinaries(appPath: string, identity: Identity | Nullish, targetPlatform: PlatformType, signOpts: ElectronSignOptions | Nullish): Promise<void> {
    if (
      MacTargetHelper.isMasTarget(targetPlatform) ||
      MacTargetHelper.isAdHocIdentity(identity) ||
      !MacTargetHelper.isHardenedRuntimeEnabledForSigning(targetPlatform, signOpts?.hardenedRuntime)
    ) {
      return
    }
    if (await this.grantsDisableLibraryValidation(await this.getAppEntitlements(targetPlatform, signOpts, false))) {
      // the app already opted out of library validation
      return
    }

    // `Contents/PlugIns` is scanned too: `buildSignOptions` unconditionally excludes it from re-signing, so anything
    // there keeps whatever third-party signature it shipped with — exactly what fails library validation
    const candidateDirs = [path.join(appPath, "Contents", "Resources", "app.asar.unpacked"), path.join(appPath, "Contents", "PlugIns")]
    try {
      const dirs: string[] = []
      for (const dir of candidateDirs) {
        if ((await statOrNull(dir)) != null) {
          dirs.push(dir)
        }
      }
      if (dirs.length === 0) {
        return
      }
      // the Team ID is read from the signed bundle rather than parsed out of the identity's common name: not every
      // identity carries a "(TEAMID)" suffix, and a self-signed one can carry it without codesign ever recording it
      const teamId = await this.readSigningTeamId(appPath)
      if (teamId == null) {
        // no Team ID to compare against (unsigned, or signed without one)
        return
      }
      let files: string[] = []
      for (const dir of dirs) {
        files = files.concat(await walk(dir))
      }
      // bounded concurrency: each check spawns `codesign -d`; results are sorted afterwards so the warning is deterministic
      const checked = await asyncPool<string, string | null>(MAX_FILE_REQUESTS, files, async file => {
        // only dylibs and bundles get loaded into a process; executables are spawned and never face library validation
        if (!isLoadableMachOFileType(await readMachOFileType(file))) {
          return null
        }
        return (await this.readSigningTeamId(file)) === teamId ? null : path.relative(appPath, file)
      })
      const foreign = checked.filter((it): it is string => it != null).sort()
      if (foreign.length > 0) {
        log.warn(
          { files: foreign.join(", "), teamId },
          `libraries in app.asar.unpacked or Contents/PlugIns are unsigned or signed by another team — under the hardened runtime they will fail library validation when loaded. ` +
            `Sign them with the same identity, or grant ${DISABLE_LIBRARY_VALIDATION} in build/entitlements.mac.plist ` +
            `(and in build/entitlements.mac.inherit.plist if a helper process such as a utilityProcess or a nodeIntegration renderer loads them)`
        )
      }
    } catch (e: any) {
      log.debug({ error: e.message }, "cannot inspect app.asar.unpacked and Contents/PlugIns for foreign-signed binaries")
    }
  }

  /**
   * The `TeamIdentifier` of a file's existing code signature as reported by `codesign -d`, or `null` when there is none:
   * `codesign` fails (e.g. the file is unsigned), the field is absent, or it is the literal `not set` that ad-hoc and
   * self-signed signatures report.
   *
   * @internal An instance method rather than a module-level function so tests can stub the `codesign` invocation, which
   * only exists on macOS.
   */
  async readSigningTeamId(file: string): Promise<string | null> {
    try {
      // `codesign -d` reports on stderr, so stdout alone (as `exec` returns) is not enough
      const { stderr } = await spawnAndWriteWithOutput("/usr/bin/codesign", ["-d", "--verbose=4", file], "")
      return parseSigningTeamId(stderr)
    } catch {
      // unsigned binaries make `codesign -d` exit non-zero
      return null
    }
  }

  async createMasInstaller(
    appPath: string,
    outDir: string,
    masOptions: MasConfiguration,
    keychainFile: string | Nullish,
    targetPlatform: PlatformType,
    arch: Arch,
    identityQualifier?: string | null
  ): Promise<void> {
    const certType = MacTargetHelper.isMasDevelopment(targetPlatform) ? "Mac Developer" : "3rd Party Mac Developer Installer"
    const masInstallerIdentity = await findIdentity(certType, identityQualifier, keychainFile)

    if (masInstallerIdentity == null) {
      throw new InvalidConfigurationError(`Cannot find valid "${certType}" identity to sign MAS installer, please see https://electron.build/docs/features/code-signing`)
    }

    MacTargetHelper.assertSafePathForCommandUsage(outDir, "output directory")

    // mas uploaded to AppStore, so, use "-" instead of space for name
    // path.basename prevents path traversal if a crafted artifactName contains "../../"
    const artifactName = path.basename(this.packager.expandArtifactNamePattern(masOptions, "pkg", arch))
    MacTargetHelper.assertSafePathForCommandUsage(artifactName, "artifact name")
    const artifactPath = path.resolve(outDir, artifactName)
    await this.packager.doFlat(appPath, artifactPath, masInstallerIdentity, keychainFile)
    await this.packager.emitArtifactBuildCompleted({
      file: artifactPath,
      target: null,
      arch: Arch.x64,
      safeArtifactName: this.packager.computeSafeArtifactName(artifactName, "pkg", arch, true, this.packager.platformOptions.defaultArch),
      packager: this.packager,
    })
  }

  async getOptionsForFile(
    appPath: string,
    targetPlatform: PlatformType,
    customSignOptions: ElectronSignOptions | Nullish,
    identity: Identity | Nullish
  ): Promise<(filePath: string) => PerFileSignOptions> {
    const isMas = MacTargetHelper.isMasTarget(targetPlatform)
    const adHoc = MacTargetHelper.isAdHocIdentity(identity)
    const appEntitlements = await this.getAppEntitlements(targetPlatform, customSignOptions, adHoc)
    const inheritEntitlements = await this.getInheritEntitlements(targetPlatform, customSignOptions, adHoc)

    const getEntitlements = (filePath: string) => {
      if (filePath === appPath) {
        return appEntitlements
      }

      if (filePath.includes("Library/LoginItems")) {
        return customSignOptions?.entitlementsLoginHelper
      }

      // `null` leaves the file to @electron/osx-sign's per-file defaults, which are tighter than one blanket plist
      return inheritEntitlements
    }

    const requirements = isMas || customSignOptions?.requirements == null ? undefined : await this.packager.getResource(customSignOptions.requirements)

    return (filePath: string): PerFileSignOptions => {
      const entitlements = getEntitlements(filePath)
      return {
        entitlements: entitlements || undefined,
        hardenedRuntime: MacTargetHelper.isHardenedRuntimeEnabledForSigning(targetPlatform, customSignOptions?.hardenedRuntime) ?? undefined,
        timestamp: customSignOptions?.timestamp || undefined,
        requirements: requirements || undefined,
        additionalArguments: customSignOptions?.additionalArguments || undefined,
      }
    }
  }

  /**
   * The effective signing type: an explicit `sign.type` wins, otherwise derived from the build flavor
   * (`mas-dev` → `development`, otherwise `distribution`).
   */
  static resolveSigningType(targetPlatform: PlatformType, configType: SigningDistributionType | Nullish): SigningDistributionType {
    return configType ?? (MacTargetHelper.isMasDevelopment(targetPlatform) ? "development" : "distribution")
  }

  static getCertificateTypes(targetPlatform: PlatformType, type: SigningDistributionType): CertType[] {
    if (type === "development") {
      return ["Mac Developer", "Apple Development"]
    }
    return MacTargetHelper.isMasTarget(targetPlatform) ? ["Apple Distribution", "3rd Party Mac Developer Application"] : ["Developer ID Application"]
  }

  /**
   * The MAS `.pkg` installer is only built for distribution signing — a development-signed build
   * (`mas-dev`, or an explicit `sign.type: "development"` on a `mas` build) is installed directly.
   */
  static shouldCreateMasInstaller(targetPlatform: PlatformType, configType: SigningDistributionType | Nullish): targetPlatform is MasPlatformType {
    return MacTargetHelper.isMasTarget(targetPlatform) && MacTargetHelper.resolveSigningType(targetPlatform, configType) !== "development"
  }

  static isMasTarget(targetName: string): boolean {
    return targetName === "mas" || targetName === "mas-dev"
  }

  static isMasDevelopment(targetName: string): boolean {
    return targetName === "mas-dev"
  }

  static getPlatformTypeFromTarget(targetName: string): PlatformType {
    // must check for mas-dev first
    if (MacTargetHelper.isMasDevelopment(targetName)) {
      return "mas-dev"
    }
    if (MacTargetHelper.isMasTarget(targetName)) {
      return "mas"
    }
    return "mac"
  }

  /**
   * Returns true when hardened runtime will be active for signing.
   * For non-MAS builds it defaults to on; for MAS it defaults to off.
   */
  static isHardenedRuntimeEnabledForSigning(targetPlatform: PlatformType, hardenedRuntime: boolean | null | undefined): boolean {
    return MacTargetHelper.isMasTarget(targetPlatform) ? hardenedRuntime === true : hardenedRuntime !== false
  }

  static assertSafePathForCommandUsage(pathValue: string, description: string): void {
    if (/[\0\r\n"'`$;&|<>]/.test(pathValue)) {
      throw new InvalidConfigurationError(`Invalid ${description}: contains unsupported shell-special characters`)
    }
  }

  static getNotarizeOptions(appPath: string): NotarizeOptions | undefined {
    const teamId = process.env.APPLE_TEAM_ID
    const appleId = process.env.APPLE_ID
    const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD

    if (appleId || appleIdPassword) {
      if (!appleId) {
        throw new InvalidConfigurationError(`APPLE_ID env var needs to be set`)
      }
      if (!appleIdPassword) {
        throw new InvalidConfigurationError(`APPLE_APP_SPECIFIC_PASSWORD env var needs to be set`)
      }
      if (!teamId) {
        throw new InvalidConfigurationError(`APPLE_TEAM_ID env var needs to be set`)
      }
      return { appPath, appleId, appleIdPassword, teamId }
    }

    const appleApiKey = process.env.APPLE_API_KEY
    const appleApiKeyId = process.env.APPLE_API_KEY_ID
    const appleApiIssuer = process.env.APPLE_API_ISSUER
    if (appleApiKey || appleApiKeyId || appleApiIssuer) {
      if (!appleApiKey || !appleApiKeyId || !appleApiIssuer) {
        throw new InvalidConfigurationError(`Env vars APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER need to be set`)
      }
      return { appPath, appleApiKey, appleApiKeyId, appleApiIssuer }
    }

    const keychain = process.env.APPLE_KEYCHAIN
    const keychainProfile = process.env.APPLE_KEYCHAIN_PROFILE
    if (keychainProfile) {
      let args: NotaryToolKeychainCredentials = { keychainProfile }
      if (keychain) {
        args = { ...args, keychain }
      }
      return { appPath, ...args }
    }

    return undefined
  }

  async notarizeIfProvided(appPath: string): Promise<void> {
    const notarizeOptions = this.packager.platformOptions.notarize
    if (notarizeOptions === false) {
      log.info({ reason: "`notarize` options were set explicitly `false`" }, "skipped macOS notarization")
      return
    }
    const options = MacTargetHelper.getNotarizeOptions(appPath)
    if (!options) {
      log.warn({ reason: "`notarize` options were unable to be generated" }, "skipped macOS notarization")
      return
    }
    await notarize(options)
    log.info(null, "notarization successful")
  }
}

/** Big-endian fat/universal magic — the same bytes open a Java class file, so `nfat_arch` has to disambiguate. */
const FAT_MAGIC = 0xcafebabe
/** libmagic's heuristic: a fat header has fewer than 30 slices, whereas a Java class file's `major_version` (in the same bytes) is at least 45. */
const FAT_MAX_ARCH_COUNT = 30
/** Thin magics as read big-endian: the file is big-endian when the bytes spell the magic out, little-endian when they are byte-swapped. */
const THIN_MAGIC_BE = new Set([0xfeedface, 0xfeedfacf])
const THIN_MAGIC_LE = new Set([0xcefaedfe, 0xcffaedfe])
/** `mach_header.filetype` follows `magic`, `cputype` and `cpusubtype` in both the 32- and 64-bit header. */
const MACH_HEADER_FILETYPE_OFFSET = 12
const MACH_HEADER_MIN_LENGTH = 16
/** The first `fat_arch` (`cputype`, `cpusubtype`, `offset`, `size`, `align` — five big-endian uint32s) follows the 8-byte fat header. */
const FAT_ARCH_OFFSET = 8
const FAT_ARCH_LENGTH = 20
const FAT_ARCH_SLICE_OFFSET_FIELD = FAT_ARCH_OFFSET + 8
const HEAD_READ_LENGTH = 4096

/** The `mach_header.filetype` values the foreign-signature scan tells apart (see `<mach-o/loader.h>`). */
export const MachOFileType = {
  /** Executable — spawned as its own process, never loaded into another one. */
  MH_EXECUTE: 2,
  /** Dynamically bound shared library (`.dylib`). */
  MH_DYLIB: 6,
  /** Dynamically bound bundle (`.node` native addons, plug-ins). */
  MH_BUNDLE: 8,
} as const

/**
 * The `filetype` field of a Mach-O header, or `null` when the file is not Mach-O, too short, or unreadable. Endianness
 * follows the magic. A fat/universal binary reports the filetype of its first slice (all slices share one filetype);
 * the fat magic `0xcafebabe` is shared with Java class files, so `nfat_arch` must also be a plausible slice count.
 *
 * @internal Exported for tests only.
 */
export async function readMachOFileType(file: string): Promise<number | null> {
  let handle: FileHandle | null = null
  try {
    handle = await open(file, "r")
    const head = Buffer.alloc(HEAD_READ_LENGTH)
    const { bytesRead } = await handle.read(head, 0, HEAD_READ_LENGTH, 0)
    if (bytesRead < 4) {
      return null
    }
    if (head.readUInt32BE(0) !== FAT_MAGIC) {
      return readThinMachOFileType(head.subarray(0, bytesRead))
    }
    if (bytesRead < FAT_ARCH_OFFSET + FAT_ARCH_LENGTH) {
      return null
    }
    const archCount = head.readUInt32BE(4)
    if (archCount === 0 || archCount >= FAT_MAX_ARCH_COUNT) {
      return null
    }
    const sliceOffset = head.readUInt32BE(FAT_ARCH_SLICE_OFFSET_FIELD)
    const sliceHeader = Buffer.alloc(MACH_HEADER_MIN_LENGTH)
    const slice = await handle.read(sliceHeader, 0, MACH_HEADER_MIN_LENGTH, sliceOffset)
    return readThinMachOFileType(sliceHeader.subarray(0, slice.bytesRead))
  } catch {
    return null
  } finally {
    await handle?.close()
  }
}

function readThinMachOFileType(header: Buffer): number | null {
  if (header.length < MACH_HEADER_MIN_LENGTH) {
    return null
  }
  const magic = header.readUInt32BE(0)
  if (THIN_MAGIC_BE.has(magic)) {
    return header.readUInt32BE(MACH_HEADER_FILETYPE_OFFSET)
  }
  if (THIN_MAGIC_LE.has(magic)) {
    return header.readUInt32LE(MACH_HEADER_FILETYPE_OFFSET)
  }
  return null
}

/**
 * Whether a Mach-O filetype is loaded into a process — a dylib or a bundle — and is therefore subject to library
 * validation. Executables are spawned, not loaded, so they are not.
 *
 * @internal Exported for tests only.
 */
export function isLoadableMachOFileType(type: number | null): boolean {
  return type === MachOFileType.MH_DYLIB || type === MachOFileType.MH_BUNDLE
}

/**
 * Whether the file starts with a Mach-O header (thin or fat), regardless of filetype.
 *
 * @internal Exported for tests only.
 */
export async function isMachOFile(file: string): Promise<boolean> {
  return (await readMachOFileType(file)) != null
}

/**
 * Extracts the `TeamIdentifier` from `codesign -d --verbose=4` output, or `null` when the field is absent or the
 * literal `not set` that ad-hoc and self-signed signatures report.
 *
 * @internal Exported for tests only.
 */
export function parseSigningTeamId(codesignOutput: string): string | null {
  const teamId = /^TeamIdentifier=(.+)$/m.exec(codesignOutput)?.[1].trim()
  return teamId == null || teamId === "not set" ? null : teamId
}
