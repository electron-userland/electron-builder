import { bundle as bundleFlatpak, FlatpakBundlerBuildOptions, FlatpakManifest } from "@malept/flatpak-bundler"
import { Arch, copyFile, toLinuxArchString } from "builder-util"
import { chmod, outputFile } from "fs-extra"
import * as path from "path"
import { Target } from "../core"
import { LinuxPackager } from "../linuxPackager"
import { FlatpakOptions } from "../options/linuxOptions"
import { getNotLocalizedLicenseFile } from "../util/license"
import { LinuxTargetHelper } from "./LinuxTargetHelper"
import { createStageDir, StageDir } from "./targetUtil"

export default class FlatpakTarget extends Target {
  readonly options: FlatpakOptions = {
    ...this.packager.platformSpecificBuildOptions,
    ...(this.packager.config as any)[this.name],
  }

  constructor(name: string, private readonly packager: LinuxPackager, private helper: LinuxTargetHelper, readonly outDir: string) {
    super(name)
  }

  get appId(): string {
    return filterFlatpakAppIdentifier(this.packager.appInfo.id)
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const { packager, options } = this
    const artifactName = packager.expandArtifactNamePattern(options, "flatpak", arch, undefined, false)
    const artifactPath = path.join(this.outDir, artifactName)
    await packager.info.callArtifactBuildStarted({
      targetPresentableName: "flatpak",
      file: artifactPath,
      arch,
    })

    const stageDir = await this.prepareStageDir(arch)

    const { manifest, buildOptions } = this.getFlatpakBuilderOptions(appOutDir, stageDir.dir, artifactName, arch)
    await bundleFlatpak(manifest, buildOptions)

    await stageDir.cleanup()

    await packager.info.callArtifactBuildCompleted({
      file: artifactPath,
      safeArtifactName: packager.computeSafeArtifactName(artifactName, "flatpak", arch, false),
      target: this,
      arch,
      packager,
      isWriteUpdateInfo: false,
    })
  }

  private async prepareStageDir(arch: Arch): Promise<StageDir> {
    const stageDir = await createStageDir(this, this.packager, arch)

    await Promise.all([this.createSandboxBinWrapper(stageDir), this.createDesktopFile(stageDir), this.copyLicenseFile(stageDir), this.copyIcons(stageDir)])

    return stageDir
  }

  private async createSandboxBinWrapper(stageDir: StageDir) {
    const useWaylandFlags = !!this.options.useWaylandFlags
    const electronWrapperPath = stageDir.getTempFile(path.join("bin", "electron-wrapper"))
    await outputFile(electronWrapperPath, getElectronWrapperScript(this.packager.executableName, useWaylandFlags))
    await chmod(electronWrapperPath, 0o755)
  }

  private async createDesktopFile(stageDir: StageDir) {
    const appIdentifier = this.appId
    const desktopFile = stageDir.getTempFile(path.join("share", "applications", `${appIdentifier}.desktop`))
    await this.helper.writeDesktopEntry(this.options, "electron-wrapper %U", desktopFile, { Icon: appIdentifier })
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
      const extWithDot = path.extname(icon.file)
      const sizeName = extWithDot === ".svg" ? "scalable" : `${icon.size}x${icon.size}`
      const iconDst = stageDir.getTempFile(path.join("share", "icons", "hicolor", sizeName, "apps", `${this.appId}${extWithDot}`))

      return copyFile(icon.file, iconDst)
    })

    await Promise.all(copyIcons)
  }

  private getFlatpakBuilderOptions(appOutDir: string, stageDir: string, artifactName: string, arch: Arch): { manifest: FlatpakManifest; buildOptions: FlatpakBundlerBuildOptions } {
    const appIdentifier = this.appId
    const { executableName } = this.packager
    const flatpakArch = toLinuxArchString(arch, "flatpak")

    const manifest: FlatpakManifest = {
      id: appIdentifier,
      command: "electron-wrapper",
      runtime: this.options.runtime || flatpakBuilderDefaults.runtime,
      runtimeVersion: this.options.runtimeVersion || flatpakBuilderDefaults.runtimeVersion,
      sdk: this.options.sdk || flatpakBuilderDefaults.sdk,
      base: this.options.base || flatpakBuilderDefaults.base,
      baseVersion: this.options.baseVersion || flatpakBuilderDefaults.baseVersion,
      finishArgs: this.options.finishArgs || flatpakBuilderDefaults.finishArgs,
      branch: this.options.branch,
      modules: this.options.modules,
    }

    const buildOptions: FlatpakBundlerBuildOptions = {
      baseFlatpakref: `app/${manifest.base}/${flatpakArch}/${manifest.baseVersion}`,
      runtimeFlatpakref: `runtime/${manifest.runtime}/${flatpakArch}/${manifest.runtimeVersion}`,
      sdkFlatpakref: `runtime/${manifest.sdk}/${flatpakArch}/${manifest.runtimeVersion}`,
      arch: flatpakArch as any,
      bundlePath: path.join(this.outDir, artifactName),
      files: [[stageDir, "/"], [appOutDir, path.join("/lib", appIdentifier)], ...(this.options.files || [])],
      symlinks: [[path.join("/lib", appIdentifier, executableName), path.join("/bin", executableName)], ...(this.options.symlinks || [])],
    }

    return { manifest, buildOptions }
  }
}

const flatpakBuilderDefaults: Omit<FlatpakManifest, "id" | "command"> = {
  runtime: "org.freedesktop.Platform",
  runtimeVersion: "20.08",
  sdk: "org.freedesktop.Sdk",
  base: "org.electronjs.Electron2.BaseApp",
  baseVersion: "20.08",
  finishArgs: [
    // Wayland/X11 Rendering
    "--socket=wayland",
    "--socket=x11",
    "--share=ipc",
    // Open GL
    "--device=dri",
    // Audio output
    "--socket=pulseaudio",
    // Read/write home directory access
    "--filesystem=home",
    // Allow communication with network
    "--share=network",
    // System notifications with libnotify
    "--talk-name=org.freedesktop.Notifications",
  ],
}

function getElectronWrapperScript(executableName: string, useWaylandFlags: boolean): string {
  return useWaylandFlags
    ? `#!/bin/sh

export TMPDIR="$XDG_RUNTIME_DIR/app/$FLATPAK_ID"

if [ "\${XDG_SESSION_TYPE}" == "wayland" ]; then
    zypak-wrapper "${executableName}" --enable-features=UseOzonePlatform --ozone-platform=wayland "$@"
else
    zypak-wrapper "${executableName}" "$@"
fi
`
    : `#!/bin/sh

export TMPDIR="$XDG_RUNTIME_DIR/app/$FLATPAK_ID"

zypak-wrapper "${executableName}" "$@"
`
}

function filterFlatpakAppIdentifier(identifier: string) {
  // Remove special characters and allow only alphanumeric (A-Z,a-z,0-9), underscore (_), and period (.)
  // Flatpak documentation: https://docs.flatpak.org/en/latest/conventions.html#application-ids
  return identifier.replace(/-/g, "_").replace(/[^a-zA-Z0-9._]/g, "")
}
