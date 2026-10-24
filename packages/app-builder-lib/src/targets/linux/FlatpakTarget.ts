import { Arch, copyFile, InvalidConfigurationError, log, toLinuxArchString, validateShellEmbeddable } from "builder-util"

import { rm } from "fs/promises"
import * as path from "path"
import * as semver from "semver"
import { Target } from "../../core.js"
import { LinuxPackager } from "../../linuxPackager.js"
import { FlatpakOptions } from "../../options/linuxOptions.js"
import { BUILD_CHANGES_URL, RUNTIME_CHANGES_URL } from "../../util/config/legacyOptions.js"
import { getNotLocalizedLicenseFile } from "../../util/license.js"
import { buildFlatpakBundle, FlatpakBuilderManifest, FlatpakBundleOptions, FlatpakRefKind } from "./flatpakBundle.js"
import { LinuxTargetHelper } from "./LinuxTargetHelper.js"
import { generateMimeTypeXml } from "./appimage/appLauncher.js"
import { buildLauncherScript, shellQuote } from "./launcherScript.js"
import { createStageDir, StageDir } from "../targetUtil.js"
import { Nullish } from "builder-util-runtime"
import _fsExtra from "fs-extra"
const { chmod, outputFile } = _fsExtra

const WAYLAND_DOCS = "https://www.electron.build/docs/flatpak#wayland-support"
const USE_OZONE_PLATFORM_FLAG = "--enable-features=UseOzonePlatform"

export default class FlatpakTarget extends Target {
  readonly options: FlatpakOptions = this.packager.getOptionsForTarget<FlatpakOptions>(this.name)

  constructor(
    name: string,
    private readonly packager: LinuxPackager,
    private helper: LinuxTargetHelper,
    readonly outDir: string
  ) {
    super(name)
  }

  get appId(): string {
    return filterFlatpakAppIdentifier(this.packager.appInfo.id)
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const { packager, options } = this
    const artifactName = packager.expandArtifactNamePattern(options, "flatpak", arch, undefined, false)
    const artifactPath = path.join(this.outDir, artifactName)
    await packager.emitArtifactBuildStarted({
      targetPresentableName: "flatpak",
      file: artifactPath,
      arch,
    })

    validateFlatpakId(this.appId)
    this.warnAboutFlatpakId()
    warnAboutFlatpakBundlerDebug()
    const stageDir = await this.prepareStageDir(arch)

    try {
      // one per build, so that concurrent arches never share a flatpak-builder state dir
      const tempDir = await packager.tempDirManager.createTempDir({ prefix: "flatpak" })
      try {
        const buildOptions = this.getFlatpakBuilderOptions(appOutDir, stageDir.dir, tempDir, artifactPath, arch)
        if (packager.packagerOptions.effectiveOptionComputed != null && (await packager.packagerOptions.effectiveOptionComputed(buildOptions))) {
          return
        }
        await buildFlatpakBundle(buildOptions)
      } finally {
        // removed as soon as the bundle is written, which is outside of it, in the output directory: the app directory and the
        // repository in it are each a copy of the app, and would otherwise pile up, one per arch, until the whole build ends
        await rm(tempDir, { recursive: true, force: true }).catch((e: any) => {
          log.debug({ tempDir, error: e?.message ?? e }, "cannot remove the flatpak build directory")
        })
      }
    } finally {
      await stageDir.cleanup().catch(() => {})
    }

    await packager.emitArtifactBuildCompleted({
      file: artifactPath,
      safeArtifactName: packager.computeSafeArtifactName(artifactName, "flatpak", arch, false),
      target: this,
      arch,
      packager,
      isWriteUpdateInfo: false,
    })
  }

  // The flatpak id is the identity of the installed app: it names its data directory, ~/.var/app/<id>, and a bundle with the
  // same id installs over it. The desktop entry is named after it, and Electron names the app's windows after desktopName.
  private warnAboutFlatpakId() {
    const id = this.appId
    const fields: Record<string, string> = { flatpakId: id }
    const problems: string[] = []
    if ((this.packager.platformOptions.appId ?? this.packager.config.appId) == null) {
      problems.push(
        `appId is not set, so the flatpak id is derived from the package name. The id names the app's data directory (~/.var/app/${id}) and its install slot: a bundle from another vendor with the same id installs over this app and inherits its data. Set appId to a reverse-DNS identifier you own`
      )
    }
    const desktopName = this.helper.resolveDesktopName()
    if (desktopName != null && desktopName !== id) {
      fields.desktopName = desktopName
      problems.push(
        `desktopName must be "${id}.desktop": the flatpak installs its desktop entry as share/applications/${id}.desktop, and Electron names the app's windows after desktopName, so with another value desktops cannot match the windows to the entry (under Wayland the window icon is missing)`
      )
    }
    if (problems.length > 0) {
      // once per build: the target is shared by all archs
      log.once("flatpak-identity", this).warn({ ...fields, docs: "https://www.electron.build/docs/flatpak#application-id" }, problems.join(". "))
    }
  }

  private async prepareStageDir(arch: Arch): Promise<StageDir> {
    const stageDir = await createStageDir(this, this.packager, arch)

    // build() removes the directory only once it is returned
    try {
      await settleAll([
        this.createSandboxBinWrapper(stageDir),
        this.createDesktopFile(stageDir),
        this.writeMimeTypes(stageDir),
        this.copyLicenseFile(stageDir),
        this.copyIcons(stageDir),
      ])
    } catch (e: any) {
      await stageDir.cleanup().catch(() => {})
      throw e
    }

    return stageDir
  }

  private async createSandboxBinWrapper(stageDir: StageDir) {
    const hasNoSandbox = (args: string[] | Nullish) => (args ?? []).includes("--no-sandbox")
    if (hasNoSandbox(this.options.executableArgs)) {
      // `this.options` is `linux` deep-merged with `flatpak`, so read the raw config to name the source. The flag is kept:
      // an app that cannot start without it would stop starting.
      const source = [
        hasNoSandbox(this.packager.platformOptions.executableArgs) && "linux.executableArgs",
        hasNoSandbox(this.packager.config.flatpak?.executableArgs) && "flatpak.executableArgs",
      ]
        .filter(Boolean)
        .join(", ")
      // once per build: the target is shared by all archs
      log
        .once("flatpak-no-sandbox", this)
        .warn(
          { source, docs: "https://www.electron.build/docs/flatpak#executable-args" },
          "the flatpak starts the app with --no-sandbox, which turns off Chromium's sandbox: inside flatpak it works, through zypak, and without it renderer processes run with every permission of the app. Remove the flag unless the app cannot start without it. " +
            "linux.executableArgs are merged into the flatpak options: to keep it for another Linux target, move it to that target's options (e.g. appImage.executableArgs), or set flatpak.executableArgs to null to leave all of linux.executableArgs out of the flatpak"
        )
    }

    const electronVersion = this.packager.config.electronVersion
    const waylandFlags = this.options.useWaylandFlags ? getWaylandFlags(electronVersion) : []
    if (this.options.useWaylandFlags && waylandFlags.length === 0) {
      // once per build: the target is shared by all archs
      log
        .once("flatpak-wayland-flags", this)
        .info({ electronVersion, docs: WAYLAND_DOCS }, "flatpak.useWaylandFlags has no effect: Electron 38 and later choose Wayland by themselves in a Wayland session")
    } else if (this.options.useWaylandFlags && !waylandFlags.includes(USE_OZONE_PLATFORM_FLAG)) {
      // once per build: the target is shared by all archs
      log
        .once("flatpak-wayland-ozone-flag", this)
        .warn(
          { electronVersion, docs: WAYLAND_DOCS },
          `electron-builder v27 no longer adds ${USE_OZONE_PLATFORM_FLAG} with flatpak.useWaylandFlags for Electron 16 and later, where Ozone is on by default: in a Wayland session the wrapper now passes only --ozone-platform=wayland. ` +
            `If the app needs the flag, add it to flatpak.executableArgs. See ${RUNTIME_CHANGES_URL}#flatpak-wayland-flags`
        )
    }
    const electronWrapperPath = stageDir.getTempFile(path.join("bin", "electron-wrapper"))
    await outputFile(electronWrapperPath, getElectronWrapperScript(this.packager.executableName, this.options.executableArgs, waylandFlags))
    await chmod(electronWrapperPath, 0o755)
  }

  private async createDesktopFile(stageDir: StageDir) {
    const appIdentifier = this.appId
    const desktopFile = stageDir.getTempFile(path.join("share", "applications", `${appIdentifier}.desktop`))
    await this.helper.writeDesktopEntry(this.options, "electron-wrapper %U", desktopFile, { Icon: appIdentifier })
  }

  // the custom MIME types of fileAssociations, which the desktop entry lists. flatpak exports the files of share/mime/packages whose
  // name starts with the app id
  private async writeMimeTypes(stageDir: StageDir) {
    const xml = generateMimeTypeXml(this.packager.fileAssociations, this.packager.appInfo.productName)
    if (xml != null) {
      await outputFile(stageDir.getTempFile(path.join("share", "mime", "packages", `${this.appId}.xml`)), xml)
    }
  }

  private async copyLicenseFile(stageDir: StageDir) {
    const licenseSrc = await getNotLocalizedLicenseFile(this.options.license, this.packager, ["txt", "html"])
    if (licenseSrc) {
      const licenseDst = stageDir.getTempFile(path.join("share", "doc", this.appId, "copyright"))
      await copyFile(licenseSrc, licenseDst)
    }
  }

  private async copyIcons(stageDir: StageDir) {
    const icons = await this.helper.icons
    const copyIcons = icons.map(async icon => {
      if (icon.size > 512) {
        // Flatpak does not allow icons larger than 512 pixels
        return Promise.resolve()
      }
      const extWithDot = path.extname(icon.file)
      const sizeName = extWithDot === ".svg" ? "scalable" : `${icon.size}x${icon.size}`
      const iconDst = stageDir.getTempFile(path.join("share", "icons", "hicolor", sizeName, "apps", `${this.appId}${extWithDot}`))

      return copyFile(icon.file, iconDst)
    })

    await settleAll(copyIcons)
  }

  private getFlatpakBuilderOptions(appOutDir: string, stageDir: string, tempDir: string, artifactPath: string, arch: Arch): FlatpakBundleOptions {
    const appIdentifier = this.appId
    const { executableName } = this.packager
    const flatpakArch = toLinuxArchString(arch, "flatpak")
    const base = this.options.base || flatpakBuilderDefaults.base
    const runtimeVersion = this.options.runtimeVersion || flatpakBuilderDefaults.runtimeVersion
    const baseVersion = this.options.baseVersion || flatpakBuilderDefaults.baseVersion

    // these two are reported once per build: the target is shared by all archs
    if (this.options.finishArgs == null) {
      log
        .once("flatpak-default-finish-args", this)
        .warn(
          { reason: "flatpak.finishArgs is not set", docs: "https://www.electron.build/docs/flatpak#finish-args-permissions" },
          "electron-builder v27 narrowed the default flatpak.finishArgs: --filesystem=home -> --filesystem=xdg-download, and --talk-name=org.freedesktop.Notifications only for the base app org.electronjs.Electron2.BaseApp before 23.08. " +
            "The app can no longer reach the home directory outside Downloads. Set flatpak.finishArgs to grant more (the v26 list is in the migration guide). " +
            `See ${RUNTIME_CHANGES_URL}#flatpak-default-permissions`
        )
    }
    if (!this.options.runtimeVersion || !this.options.baseVersion) {
      log
        .once("flatpak-default-runtime-version", this)
        .warn(
          { runtimeVersion, baseVersion },
          `electron-builder v27 changed the default flatpak.runtimeVersion and flatpak.baseVersion from 20.08 to 26.08: each of them that is not set is now 26.08, and the 26.08 runtime, SDK and base app are installed if they are missing. ` +
            `Set both to "20.08" to keep the previous runtime, or both to the version to build for. See ${BUILD_CHANGES_URL}#flatpak-tooling-requirements`
        )
    }

    const manifest: FlatpakBuilderManifest = {
      id: appIdentifier,
      command: "electron-wrapper",
      runtime: this.options.runtime || flatpakBuilderDefaults.runtime,
      "runtime-version": runtimeVersion,
      sdk: this.options.sdk || flatpakBuilderDefaults.sdk,
      base,
      "base-version": baseVersion,
      "finish-args": this.options.finishArgs || getDefaultFinishArgs(base, baseVersion),
      branch: this.options.branch,
      modules: this.options.modules,
    }

    // `this.options` is `linux` deep-merged with `flatpak`, and deepAssign concatenates arrays. A flat `linux.files`
    // is moved into `linux.fileOptions.files` when the configuration is loaded, but read the flatpak-specific
    // [src, dest] tuple list from the raw config anyway, so that no shared list can leak into it.
    const extraFiles = this.packager.config.flatpak?.files ?? []

    return {
      manifest,
      arch: flatpakArch,
      artifactPath,
      tempDir,
      files: [[stageDir, "/"], [appOutDir, path.join("/lib", appIdentifier)], ...extraFiles],
      symlinks: [[path.join("/lib", appIdentifier, executableName), path.join("/bin", executableName)], ...(this.options.symlinks || [])],
      installOrUpdateRefs: resolveInstallOrUpdateRefs(this.options.installOrUpdateRefs),
      flatpakBuilderArgs: this.options.additionalArgs?.flatpakBuilder ?? [],
      buildExportArgs: this.options.additionalArgs?.buildExport ?? [],
      buildBundleArgs: this.options.additionalArgs?.buildBundle ?? [],
    }
  }
}

const flatpakBuilderDefaults: Required<Pick<FlatpakOptions, "runtime" | "runtimeVersion" | "sdk" | "base" | "baseVersion" | "finishArgs">> = {
  runtime: "org.freedesktop.Platform",
  runtimeVersion: "26.08",
  sdk: "org.freedesktop.Sdk",
  base: "org.electronjs.Electron2.BaseApp",
  baseVersion: "26.08",
  finishArgs: [
    // Wayland/X11 Rendering
    "--socket=wayland",
    "--socket=x11",
    "--share=ipc",
    // Open GL
    "--device=dri",
    // Sound: playback and recording (microphone included), MIDI and the /dev/snd devices
    "--socket=pulseaudio",
    // Read/write access to the Downloads folder only
    "--filesystem=xdg-download",
    // Allow communication with network
    "--share=network",
  ],
}

function resolveInstallOrUpdateRefs(option: FlatpakOptions["installOrUpdateRefs"]): FlatpakRefKind[] {
  return option == null || option === "all" ? ["runtime", "sdk", "base"] : [...option]
}

function getDefaultFinishArgs(base: string, baseVersion: string): string[] {
  // System notifications with libnotify: before 0.8 it talks to the notification daemon, which needs the talk-name, and from 0.8
  // it uses the notification portal inside the sandbox. The Electron base app has 0.8 or later since 23.08. Other base apps are
  // not modelled and get no talk-name. Loose, because the strict coerce rejects the zero-padded minor of "22.08".
  if (base === flatpakBuilderDefaults.base && semver.lt(semver.coerce(baseVersion, { loose: true }) ?? "99.0.0", "23.8.0")) {
    return [...flatpakBuilderDefaults.finishArgs, "--talk-name=org.freedesktop.Notifications"]
  }
  return flatpakBuilderDefaults.finishArgs
}

/**
 * The flags with which the wrapper makes Electron use Wayland in a Wayland session, for `useWaylandFlags`. From Electron 38 there are
 * none: its default, `--ozone-platform=auto`, already picks Wayland there. From Electron 16 Ozone is on by default, so
 * `--enable-features=UseOzonePlatform` is left out; Chromium keeps the last value of a repeated switch, so it could replace an
 * `--enable-features` of the executableArgs. An unknown version gets both flags.
 */
export function getWaylandFlags(electronVersion: string | Nullish): string[] {
  // a version that is not semver, such as "38" with a custom electronDist, is unknown
  const version = semver.valid(electronVersion)
  if (version != null && semver.gte(version, "38.0.0")) {
    return []
  }
  if (version != null && semver.gte(version, "16.0.0")) {
    return ["--ozone-platform=wayland"]
  }
  return ["--enable-features=UseOzonePlatform", "--ozone-platform=wayland"]
}

/**
 * The script that the flatpak runs as its command, /app/bin/electron-wrapper. It starts the app through zypak-wrapper, which
 * makes Chromium's sandbox work inside flatpak, with the `executableArgs`, then the `waylandFlags` when the session is a
 * Wayland one, then the arguments of the launch. The shell is replaced by the app (`exec`), as in the launchers of the
 * other Linux targets.
 */
export function getElectronWrapperScript(executableName: string, executableArgs: string[] | Nullish, waylandFlags: string[]): string {
  // executableName is interpolated into the generated POSIX wrapper script below; reject shell
  // metacharacters (matches the snap and AppImage targets) so it cannot inject shell commands.
  validateShellEmbeddable(executableName, "executableName")
  const preamble = 'export TMPDIR="$XDG_RUNTIME_DIR/app/$FLATPAK_ID"'
  const command = ["zypak-wrapper", `"${executableName}"`]
  const args = executableArgs ?? []
  if (waylandFlags.length === 0) {
    return buildLauncherScript({ preamble, command, args })
  }
  // Single-quote each arg so embedded characters (spaces, =, quotes) are passed literally,
  // consistent with the other Linux launcher entrypoints.
  const execLine = (extraArgs: string[]) => ["exec", ...command, ...[...args, ...extraArgs].map(shellQuote), '"$@"'].join(" ")
  // `=`, not `==`: /bin/sh is bash in the freedesktop runtime, but `==` fails in a POSIX shell such as dash
  return `#!/bin/sh
${preamble}
if [ "\${XDG_SESSION_TYPE:-}" = "wayland" ]; then
  ${execLine(waylandFlags)}
fi
${execLine([])}
`
}

/**
 * flatpak's rules for an id, checked before the build installs anything: flatpak-builder applies them only once the runtime, the SDK
 * and the base app are installed. The id is filtered first, so "-", which flatpak allows in the last element, never reaches this.
 *
 * @see https://docs.flatpak.org/en/latest/conventions.html#application-ids
 */
function validateFlatpakId(id: string) {
  const elements = id.split(".")
  const invalidElement = elements.find(element => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(element))
  let problem: string | null = null
  if (id.length > 255) {
    problem = `it has ${id.length} characters, and at most 255 are allowed`
  } else if (elements.length < 3) {
    problem = "it needs at least three elements separated by periods, such as com.example.App"
  } else if (invalidElement != null) {
    problem = invalidElement === "" ? "it has an empty element" : `its element "${invalidElement}" starts with a digit`
  }
  if (problem != null) {
    throw new InvalidConfigurationError(
      `the flatpak id "${id}" is not valid: ${problem}. The id is appId (or linux.appId) with "-" replaced by "_" and characters other than A-Za-z0-9._ removed, or com.electron.<package name in lower case> when appId is not set. See https://www.electron.build/docs/flatpak#application-id`
    )
  }
}

/**
 * `DEBUG=@malept/flatpak-bundler` showed the commands of the package that built the bundle before v27. Once per process: the
 * variable is the same for every build.
 */
function warnAboutFlatpakBundlerDebug() {
  if (process.env.DEBUG?.includes("@malept/flatpak-bundler")) {
    log
      .once("flatpak-bundler-debug")
      .warn(
        { envVar: "DEBUG" },
        `electron-builder v27 no longer uses @malept/flatpak-bundler, so DEBUG=@malept/flatpak-bundler has no effect: a failed flatpak or flatpak-builder command prints its own output in the build error. ` +
          `Set DEBUG=electron-builder to log every command that is run. See ${BUILD_CHANGES_URL}#flatpak-tooling-requirements`
      )
  }
}

/**
 * Waits for every promise to settle, then rethrows the first failure. Unlike Promise.all, nothing is still writing to the stage
 * directory when it rejects, so the directory can be removed: the steps create parent directories as they go.
 */
async function settleAll(promises: Promise<unknown>[]): Promise<void> {
  const failure = (await Promise.allSettled(promises)).find((result): result is PromiseRejectedResult => result.status === "rejected")
  if (failure != null) {
    throw failure.reason
  }
}

function filterFlatpakAppIdentifier(identifier: string) {
  // Remove special characters and allow only alphanumeric (A-Z,a-z,0-9), underscore (_), and period (.)
  // Flatpak documentation: https://docs.flatpak.org/en/latest/conventions.html#application-ids
  return identifier.replace(/-/g, "_").replace(/[^a-zA-Z0-9._]/g, "")
}
