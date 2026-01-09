import { replaceDefault as _replaceDefault, Arch, deepAssign, executeAppBuilder, InvalidConfigurationError, log, serializeToYaml, toLinuxArchString } from "builder-util"
import { asArray, Nullish, SnapStoreOptions } from "builder-util-runtime"
import { mkdirSync, outputFile, readdirSync, readFile, statSync } from "fs-extra"
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
import { execSync } from "child_process"
import { expandMacro } from "../util/macroExpander"

const defaultPlugs = ["desktop", "desktop-legacy", "home", "x11", "wayland", "unity7", "browser-support", "network", "gsettings", "audio-playback", "pulseaudio", "opengl"]
const VM_NAME = "snap-builder";

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
      platforms: [toLinuxArchString(arch, "snap")],
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
      const environment: Record<string, string> = {
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
      // Determine whether Wayland should be disabled based on:
      // - Electron version (<38 historically had Wayland disabled)
      // - Explicit allowNativeWayland override.
      // https://github.com/electron-userland/electron-builder/issues/9320
      const allow = options.allowNativeWayland
      const isOldElectron = !this.isElectronVersionGreaterOrEqualThan("38.0.0")
      if (
        (allow == null && isOldElectron) || // No explicit option -> use legacy behavior for old Electron
        allow === false // Explicitly disallowed
      ) {
        environment.DISABLE_WAYLAND = "1"
      }

      appDescriptor.environment = environment

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

    if (options.base != null) {
      // core24 upgrade/migration
      if (options.base.split("core")[1] === "24") {
        return await buildSnapCore24({
          SNAP_DIR: appOutDir,
          APP_NAME: this.packager.appInfo.name,
          DIST_DIR: log.filePath(appOutDir),
          USE_CLASSIC: false,
          VERSION: expandMacro("${version}", null, this.packager.appInfo),
        })
      }
    }

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
      publishConfig,
    })
  }

  private isElectronVersionGreaterOrEqualThan(version: string) {
    return semver.gte(this.packager.config.electronVersion || "7.0.0", version)
  }
}

function findSnapPublishConfig(config?: Configuration): SnapStoreOptions | null {
  const fallback: SnapStoreOptions = { provider: "snapStore" }

  if (!config) {
    return fallback
  }

  if (config.snap?.publish) {
    return findSnapPublishConfigInPublishNode(config.snap.publish)
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

  return fallback
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

function detectElectronBinary(appOutDir: string): string {
  const files = readdirSync(appOutDir)
  for (const file of files) {
    const fullPath = path.join(appOutDir, file)
    if (statSync(fullPath).isFile()) {
      try {
        execSync(`test -x "${fullPath}"`)
        return file
      } catch {
        // ignore
      }
    }
  }
  throw new Error(`Cannot detect Electron binary in ${appOutDir}`)
}

// Strip debug symbols to reduce size
function stripBinary(binaryPath: string) {
  try {
    execSync(`strip "${binaryPath}"`)
    console.log(`✅ Stripped debug symbols from ${binaryPath}`)
  } catch {
    console.warn(`⚠ Could not strip ${binaryPath}`)
  }
}

function run(cmd: string) {
  console.log(`\n▶ ${cmd}`)
  execSync(cmd, { stdio: "inherit" })
}

// Ensure Multipass VM
function ensureMultipassVM() {
  try {
    execSync(`multipass info snap-builder`, { stdio: "ignore" })
    console.log("✅ Multipass VM exists")
  } catch {
    execSync(`multipass launch --name snap-builder --cpus 4 --memory 8G --disk 20G`, { stdio: "inherit" })
  }
}

// Build Snap
async function buildSnapCore24(options: {
  SNAP_DIR: string
  DIST_DIR: string
  APP_NAME: string
  VERSION: string
  USE_CLASSIC: boolean
}) {
  const { SNAP_DIR, DIST_DIR, APP_NAME, VERSION, USE_CLASSIC } = options
if (path.isAbsolute(DIST_DIR)) {
  throw new Error("snapcraft.yaml source must be relative, absolute paths are invalid")
}
  // Detect Electron binary and strip debug symbols
  const binaryName = detectElectronBinary(DIST_DIR)
  const binaryPath = path.join(DIST_DIR, binaryName)
  stripBinary(binaryPath)

  // Create snap directory
  mkdirSync(SNAP_DIR, { recursive: true })

  // Generate Snapcraft YAML with flat lists (no nested lists)
  const snapcraftYaml = `
name: ${APP_NAME}
base: core24
version: '${VERSION}'
summary: ${APP_NAME}
description: |
  ${APP_NAME} Electron application

grade: stable
confinement: ${USE_CLASSIC ? "classic" : "strict"}

platforms:
  amd64:
    build-on: amd64
    build-for: amd64
  arm64:
    build-on: arm64
    build-for: arm64

apps:
  ${APP_NAME}:
    command: ${binaryName}
    extensions: [gnome]
    environment:
      ELECTRON_DISABLE_SANDBOX: "1"
    plugs:
      - network
      - home
      - desktop
      - desktop-legacy
      - wayland
      - x11
      - audio-playback
      - opengl

parts:
  ${APP_NAME}:
    plugin: dump
    source: app
    stage-packages:
      - libnss3
      - libatk-bridge2.0-0
      - libgtk-3-0
      - libx11-xcb1
      - libxcomposite1
      - libxrandr2
      - libxdamage1
      - libxfixes3
      - libasound2
      - libgbm1
      - libdrm2
    stage:
      - usr/share/locale
    override-stage: |
      snapcraftctl stage
      mkdir -p $SNAPCRAFT_PART_INSTALL/usr/share/locale
`.trimStart()

  const snapcraftYamlPath = path.join(SNAP_DIR, "snapcraft.yaml")
  await outputFile(snapcraftYamlPath, snapcraftYaml)

  try {
    // Ensure Multipass VM exists
    ensureMultipassVM()

    // Make sure /home/ubuntu/app exists in VM
    run(`multipass exec ${VM_NAME} -- mkdir -p /home/ubuntu/app/app`)

    // Transfer project files into VM
    const hostSnapDir = path.resolve(SNAP_DIR)
    run(`multipass transfer -r ${hostSnapDir}/snapcraft.yaml ${VM_NAME}:/home/ubuntu/app`)
    run(`multipass transfer -r ${hostSnapDir}/* ${VM_NAME}:/home/ubuntu/app/app`)

    // Install Snapcraft if missing
    run(`multipass exec ${VM_NAME} -- bash -c "sudo snap install snapcraft --classic || true"`)

    // Install QEMU for ARM64 cross-builds
    run(`multipass exec ${VM_NAME} -- bash -c "sudo apt-get update && sudo apt-get install -y qemu-user-static"`)

    // Build snap inside VM
    // run(`multipass exec ${VM_NAME} -- bash -c "cd /home/ubuntu/app && ls -lRh && snapcraft validate"`)
    run(`multipass exec ${VM_NAME} -- bash -c "cd /home/ubuntu/app && snapcraft pack --verbosity debug"`)

    // Copy built snaps back to host
    run(`multipass transfer ${VM_NAME}:/home/ubuntu/app/*.snap ./`)

    console.log("🎉 Snap build complete! Check the current folder for .snap files.")
  } finally {
    run(`multipass exec snap-builder -- bash -lc  "ls -lh ~/.local/state/snapcraft/log && cat ~/.local/state/snapcraft/log/*.log"`)
    cleanupMultipass()
  }
}

function cleanupMultipass() {
  try {
    run(`multipass delete --purge ${VM_NAME}`)
    console.log("✅ Multipass VM cleaned up")
  } catch (err) {
    console.warn("⚠ Failed to cleanup Multipass VM", err)
  }
}
