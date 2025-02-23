import { replaceDefault as _replaceDefault, Arch, copyDir, deepAssign, exec, executeAppBuilder, InvalidConfigurationError, log, serializeToYaml, toLinuxArchString } from "builder-util"
import { asArray, Nullish, SnapStoreOptions } from "builder-util-runtime"
import { copyFile, mkdir, outputFile, readFile, unlink } from "fs-extra"
import { load } from "js-yaml"
import * as path from "path"
import * as semver from "semver"
import { Configuration } from "../configuration"
import { Publish, Target } from "../core"
import { LinuxPackager } from "../linuxPackager"
import { PlugDescriptor, SnapOptions } from "../options/SnapOptions"
import { getTemplatePath } from "../util/pathManager"
import { LinuxTargetHelper } from "./LinuxTargetHelper"
import { createStageDirPath } from "./targetUtil"
import { getBin, getBinFromUrl } from "../binDownload"

const defaultPlugs = ["desktop", "desktop-legacy", "home", "x11", "wayland", "unity7", "browser-support", "network", "gsettings", "audio-playback", "pulseaudio", "opengl"]

export default class SnapTarget extends Target {
  readonly options: SnapOptions = { ...this.packager.platformSpecificBuildOptions, ...(this.packager.config as any)[this.name] }

  public isUseTemplateApp = false

  constructor(
    name: string,
    private readonly packager: LinuxPackager,
    private readonly helper: LinuxTargetHelper,
    readonly outDir: string
  ) {
    super(name)
  }

  private replaceDefault(inList: Array<string> | Nullish, defaultList: Array<string>) {
    const result = _replaceDefault(inList, defaultList)
    if (result !== defaultList) {
      this.isUseTemplateApp = false
    }
    return result
  }

  private async createDescriptor(arch: Arch): Promise<any> {
    if (!this.isElectronVersionGreaterOrEqualThan("4.0.0")) {
      if (!this.isElectronVersionGreaterOrEqualThan("2.0.0-beta.1")) {
        throw new InvalidConfigurationError("Electron 2 and higher is required to build Snap")
      }

      log.warn("Electron 4 and higher is highly recommended for Snap")
    }

    const appInfo = this.packager.appInfo
    const snapName = this.packager.executableName.toLowerCase()
    const options = this.options

    const plugs = normalizePlugConfiguration(this.options.plugs)

    const plugNames = this.replaceDefault(plugs == null ? null : Object.getOwnPropertyNames(plugs), defaultPlugs)

    const slots = normalizePlugConfiguration(this.options.slots)

    const buildPackages = asArray(options.buildPackages)
    const defaultStagePackages = getDefaultStagePackages()
    const stagePackages = this.replaceDefault(options.stagePackages, defaultStagePackages)

    this.isUseTemplateApp =
      this.options.useTemplateApp !== false &&
      (arch === Arch.x64 || arch === Arch.armv7l) &&
      buildPackages.length === 0 &&
      isArrayEqualRegardlessOfSort(stagePackages, defaultStagePackages)

    const appDescriptor: any = {
      command: "command.sh",
      plugs: plugNames,
      adapter: "none",
    }

    const snap: any = load(await readFile(path.join(getTemplatePath("snap"), "snapcraft.yaml"), "utf-8"))
    if (this.isUseTemplateApp) {
      delete appDescriptor.adapter
    }
    if (options.base != null) {
      snap.base = options.base
      // from core22 onwards adapter is legacy
      if (Number(snap.base.split("core")[1]) >= 22) {
        delete appDescriptor.adapter
      }
    }
    if (options.grade != null) {
      snap.grade = options.grade
    }
    if (options.confinement != null) {
      snap.confinement = options.confinement
    }
    if (options.appPartStage != null) {
      snap.parts.app.stage = options.appPartStage
    }
    if (options.layout != null) {
      snap.layout = options.layout
    }
    if (slots != null) {
      appDescriptor.slots = Object.getOwnPropertyNames(slots)
      for (const slotName of appDescriptor.slots) {
        const slotOptions = slots[slotName]
        if (slotOptions == null) {
          continue
        }
        if (!snap.slots) {
          snap.slots = {}
        }
        snap.slots[slotName] = slotOptions
      }
    }

    deepAssign(snap, {
      name: snapName,
      version: appInfo.version,
      title: options.title || appInfo.productName,
      summary: options.summary || appInfo.productName,
      compression: options.compression,
      description: this.helper.getDescription(options),
      architectures: [toLinuxArchString(arch, "snap")],
      apps: {
        [snapName]: appDescriptor,
      },
      parts: {
        app: {
          "stage-packages": stagePackages,
        },
      },
    })

    if (options.autoStart) {
      appDescriptor.autostart = `${snap.name}.desktop`
    }

    if (options.confinement === "classic") {
      delete appDescriptor.plugs
      delete snap.plugs
    } else {
      const archTriplet = archNameToTriplet(arch)
      appDescriptor.environment = {
        DISABLE_WAYLAND: options.allowNativeWayland ? "" : "1",
        PATH: "$SNAP/usr/sbin:$SNAP/usr/bin:$SNAP/sbin:$SNAP/bin:$PATH",
        SNAP_DESKTOP_RUNTIME: "$SNAP/gnome-platform",
        LD_LIBRARY_PATH: [
          "$SNAP_LIBRARY_PATH",
          "$SNAP/lib:$SNAP/usr/lib:$SNAP/lib/" + archTriplet + ":$SNAP/usr/lib/" + archTriplet,
          "$LD_LIBRARY_PATH:$SNAP/lib:$SNAP/usr/lib",
          "$SNAP/lib/" + archTriplet + ":$SNAP/usr/lib/" + archTriplet,
        ].join(":"),
        ...options.environment,
      }

      if (plugs != null) {
        for (const plugName of plugNames) {
          const plugOptions = plugs[plugName]
          if (plugOptions == null) {
            continue
          }

          snap.plugs[plugName] = plugOptions
        }
      }
    }

    if (buildPackages.length > 0) {
      snap.parts.app["build-packages"] = buildPackages
    }
    if (options.after != null) {
      snap.parts.app.after = options.after
    }

    if (options.assumes != null) {
      snap.assumes = asArray(options.assumes)
    }

    return snap
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager
    const options = this.options
    // tslint:disable-next-line:no-invalid-template-strings
    const artifactName = packager.expandArtifactNamePattern(this.options, "snap", arch, "${name}_${version}_${arch}.${ext}", false)
    const artifactPath = path.join(this.outDir, artifactName)
    await packager.info.emitArtifactBuildStarted({
      targetPresentableName: "snap",
      file: artifactPath,
      arch,
    })

    const snap = await this.createDescriptor(arch)

    const stageDir = await createStageDirPath(this, packager, arch)
    const snapArch = toLinuxArchString(arch, "snap")
    const args = ["snap", "--app", appOutDir, "--stage", stageDir, "--arch", snapArch, "--output", artifactPath, "--executable", this.packager.executableName]

    await this.helper.icons
    if (this.helper.maxIconPath != null) {
      if (!this.isUseTemplateApp) {
        snap.icon = "snap/gui/icon.png"
      }
      args.push("--icon", this.helper.maxIconPath)
    }

    // snapcraft.yaml inside a snap directory
    const snapMetaDir = path.join(stageDir, this.isUseTemplateApp ? "meta" : "snap")
    const desktopFile = path.join(snapMetaDir, "gui", `${snap.name}.desktop`)
    await this.helper.writeDesktopEntry(this.options, packager.executableName + " %U", desktopFile, {
      // tslint:disable:no-invalid-template-strings
      Icon: "${SNAP}/meta/gui/icon.png",
    })

    const extraAppArgs: Array<string> = options.executableArgs ?? []
    if (this.isElectronVersionGreaterOrEqualThan("5.0.0") && !isBrowserSandboxAllowed(snap)) {
      const noSandboxArg = "--no-sandbox"
      if (!extraAppArgs.includes(noSandboxArg)) {
        extraAppArgs.push(noSandboxArg)
      }
      if (this.isUseTemplateApp) {
        args.push("--exclude", "chrome-sandbox")
      }
    }
    if (extraAppArgs.length > 0) {
      args.push("--extraAppArgs=" + extraAppArgs.join(" "))
    }

    if (snap.compression != null) {
      args.push("--compression", snap.compression)
    }

    if (this.isUseTemplateApp) {
      // remove fields that are valid in snapcraft.yaml, but not snap.yaml
      const fieldsToStrip = ["compression", "contact", "donation", "issues", "parts", "source-code", "website"]
      for (const field of fieldsToStrip) {
        delete snap[field]
      }
    }

    if (packager.packagerOptions.effectiveOptionComputed != null && (await packager.packagerOptions.effectiveOptionComputed({ snap, desktopFile, args }))) {
      return
    }

    await outputFile(path.join(snapMetaDir, this.isUseTemplateApp ? "snap.yaml" : "snapcraft.yaml"), serializeToYaml(snap))

    const hooksDir = await packager.getResource(options.hooks, "snap-hooks")
    if (hooksDir != null) {
      args.push("--hooks", hooksDir)
    }

    if (this.isUseTemplateApp) {
      args.push("--template-url", `electron4:${snapArch}`)
    }

    await executeAppBuilder(args)

    const publishConfig = findSnapPublishConfig(this.packager.config)

    await packager.info.emitArtifactBuildCompleted({
      file: artifactPath,
      safeArtifactName: packager.computeSafeArtifactName(artifactName, "snap", arch, false),
      target: this,
      arch,
      packager,
      publishConfig: publishConfig == null ? { provider: "snapStore" } : publishConfig,
    })
  }

  private isElectronVersionGreaterOrEqualThan(version: string) {
    return semver.gte(this.packager.config.electronVersion || "7.0.0", version)
  }
}

function findSnapPublishConfig(config?: Configuration): SnapStoreOptions | null {
  if (!config) {
    return null
  }

  if (config.snap?.publish) {
    const configCandidate = findSnapPublishConfigInPublishNode(config.snap.publish)

    if (configCandidate) {
      return configCandidate
    }
  }

  if (config.linux?.publish) {
    const configCandidate = findSnapPublishConfigInPublishNode(config.linux.publish)

    if (configCandidate) {
      return configCandidate
    }
  }

  if (config.publish) {
    const configCandidate = findSnapPublishConfigInPublishNode(config.publish)

    if (configCandidate) {
      return configCandidate
    }
  }

  return null
}

function findSnapPublishConfigInPublishNode(configPublishNode: Publish): SnapStoreOptions | null {
  if (!configPublishNode) {
    return null
  }

  if (Array.isArray(configPublishNode)) {
    for (const configObj of configPublishNode) {
      if (isSnapStoreOptions(configObj)) {
        return configObj
      }
    }
  }

  if (typeof configPublishNode === `object` && isSnapStoreOptions(configPublishNode)) {
    return configPublishNode
  }

  return null
}

function isSnapStoreOptions(configPublishNode: Publish): configPublishNode is SnapStoreOptions {
  const snapStoreOptionsCandidate = configPublishNode as SnapStoreOptions
  return snapStoreOptionsCandidate?.provider === `snapStore`
}

function archNameToTriplet(arch: Arch): string {
  switch (arch) {
    case Arch.x64:
      return "x86_64-linux-gnu"
    case Arch.ia32:
      return "i386-linux-gnu"
    case Arch.armv7l:
      // noinspection SpellCheckingInspection
      return "arm-linux-gnueabihf"
    case Arch.arm64:
      return "aarch64-linux-gnu"

    default:
      throw new Error(`Unsupported arch ${arch}`)
  }
}

function isArrayEqualRegardlessOfSort(a: Array<string>, b: Array<string>) {
  a = a.slice()
  b = b.slice()
  a.sort()
  b.sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function normalizePlugConfiguration(raw: Array<string | PlugDescriptor> | PlugDescriptor | Nullish): Record<string, Record<string, any> | null> | null {
  if (raw == null) {
    return null
  }

  const result: any = {}
  for (const item of Array.isArray(raw) ? raw : [raw]) {
    if (typeof item === "string") {
      result[item] = null
    } else {
      Object.assign(result, item)
    }
  }
  return result
}

function isBrowserSandboxAllowed(snap: any): boolean {
  if (snap.plugs != null) {
    for (const plugName of Object.keys(snap.plugs)) {
      const plug = snap.plugs[plugName]
      if (plug.interface === "browser-support" && plug["allow-sandbox"] === true) {
        return true
      }
    }
  }
  return false
}

function getDefaultStagePackages() {
  // libxss1 - was "error while loading shared libraries: libXss.so.1" on Xubuntu 16.04
  // noinspection SpellCheckingInspection
  return ["libnspr4", "libnss3", "libxss1", "libappindicator3-1", "libsecret-1-0"]
}

async function checkSnapcraftVersion(isRequireToBeInstalled: boolean): Promise<Error | null> {
  const installMessage: string = process.platform === "darwin" ? "brew install snapcraft" : "sudo snap install snapcraft --classic"

  try {
    const out = await exec("snapcraft", ["--version"])
    return doCheckSnapVersion(out, installMessage)
  } catch (err) {
    console.debug((err as Error).message)
  }

  if (isRequireToBeInstalled) {
    return new Error(`snapcraft is not installed, please: ${installMessage}`)
  }

  return null
}

function doCheckSnapVersion(rawVersion: string, installMessage: string): Error | null {
  if (rawVersion === "snapcraft, version edge") {
    return null
  }

  const s = rawVersion.replace("snapcraft", "").replace(",", "").replace("version", "").trim().replace(/'/g, "")

  if (semver.lt(s, "4.0.0")) {
    return new Error(`at least snapcraft 4.0.0 is required, but ${rawVersion} installed, please: ${installMessage}`)
  }

  return null
}

interface SnapOptions {
  appDir: string
  stageDir: string
  output: string
  icon?: string
  hooksDir?: string
  executableName?: string
  extraAppArgs?: string
  excludedAppFiles?: string[]
  arch?: string
  compression?: "xz" | "lzo"
}

function createSnap(options: SnapOptions) {
  try {
    const resolvedTemplateDir = resolveTemplateDir(options)
    snap(resolvedTemplateDir, options)
  } catch (error) {
    console.error("Error:", error.message)
    process.exit(1)
  }
}

function resolveTemplateDir(templateUrl: string, templateSha512: string) {
  switch (templateUrl) {
    case "electron4":
    case "electron4:amd64":
      return getBinFromUrl("snap-template", "4.0-2", "PYhiQQ5KE4ezraLE7TOT2aFPGkBNjHLRN7C8qAPaC6VckHU3H+0m+JA/Wmx683fKUT2ZBwo9Mp82EuhmQo5WOQ==")
    // ( download.DownloadArtifact("", download.GetGithubBaseUrl()+"snap-template-4.0-2/snap-template-electron-4.0-2-amd64.tar.7z", "PYhiQQ5KE4ezraLE7TOT2aFPGkBNjHLRN7C8qAPaC6VckHU3H+0m+JA/Wmx683fKUT2ZBwo9Mp82EuhmQo5WOQ==")
    case "electron4:armhf":
    case "electron4:arm":
      return getBinFromUrl("snap-template", "4.0-1", "jK+E0d0kyzBEsFmTEUIsumtikH4XZp8NVs6DBtIBJqXAmVCuNHcmvDa0wcaigk8foU4uGZXsLlJtNj11X100Bg==")
    // return download.DownloadArtifact("", download.GetGithubBaseUrl()+"snap-template-4.0-1/snap-template-electron-4.0-1-armhf.tar.7z", "jK+E0d0kyzBEsFmTEUIsumtikH4XZp8NVs6DBtIBJqXAmVCuNHcmvDa0wcaigk8foU4uGZXsLlJtNj11X100Bg==")
    default:
      return getBin("snap-template-custom", templateUrl, templateSha512) // download.DownloadArtifact("", templateUrl, templateSha512)
  }
}

async function snap(templateDir: string, options: SnapOptions): Promise<void> {
  const stageDir = options.stageDir
  const snapMetaDir = templateDir ? path.join(stageDir, "meta") : path.join(stageDir, "snap")

  if (options.icon) {
    await copyFile(options.icon, path.join(snapMetaDir, "gui", "icon" + path.extname(options.icon)))
  }
  if (options.hooksDir) {
    await copyDir(options.hooksDir, path.join(snapMetaDir, "hooks"))
  }

  const scriptDir = path.join(stageDir, "scripts")
  await mkdir(scriptDir, { recursive: true })

  if (options.executableName) {
    writeCommandWrapper(options, scriptDir)
  }

  const chromeSandbox = path.join(options.appDir, "app", "chrome-sandbox")
  await unlink(chromeSandbox).catch((_e: any) => {
    // ignore
  })

  await buildUsingTemplate(templateDir, options)
}

function writeCommandWrapper(options: SnapOptions, scriptDir: string): void {
  const commandWrapperFile = path.join(scriptDir, "command.sh")
  let text = `#!/bin/bash -e\nexec "$SNAP/desktop-init.sh" "$SNAP/desktop-common.sh" "$SNAP/desktop-gnome-specific.sh" "$SNAP/${options.executableName}"`

  if (options.extraAppArgs) {
    text += ` ${options.extraAppArgs}`
  }
  text += ' "$@"'

  fs.writeFileSync(commandWrapperFile, text, { mode: 0o755 })
}

async function buildUsingTemplate(templateDir: string, options: SnapOptions): Promise<void> {
  const args = ["-no-progress", "-quiet", "-noappend", "-comp", options.compression || "xz", "-no-xattrs", "-no-fragments", "-all-root", options.output]
  await exec("mksquashfs", [templateDir, options.stageDir, ...args])
}
