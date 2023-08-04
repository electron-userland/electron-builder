import { Arch, deepAssign } from "builder-util"
import { UUID } from "builder-util-runtime"
import * as path from "path"
import { MsiWrappedOptions } from "../"
import { TargetConfiguration } from "../core"
import { FinalCommonWindowsInstallerOptions } from "../options/CommonWindowsInstallerConfiguration"
import { WinPackager } from "../winPackager"
import MsiTarget from "./MsiTarget"

const ELECTRON_MSI_WRAPPED_NS_UUID = UUID.parse("467f7bb2-a83c-442f-b776-394d316e8e53")

export default class MsiWrappedTarget extends MsiTarget {
  readonly options: MsiWrappedOptions = deepAssign(this.packager.platformSpecificBuildOptions, this.packager.config.msiWrapped)

  /** @private */
  private readonly archs: Map<Arch, string> = new Map()

  constructor(packager: WinPackager, readonly outDir: string) {
    // must be synchronous so it can run after nsis
    super(packager, outDir, "msiWrapped", false)
  }

  private get productId(): string {
    // this id is only required to build the installer
    // however it serves no purpose as this msi is just
    // a wrapper for an exe
    return UUID.v5(this.packager.appInfo.id, ELECTRON_MSI_WRAPPED_NS_UUID).toUpperCase()
  }

  private validatePrerequisites(): void {
    const config = this.packager.config
    // this target requires nsis to be configured and executed
    // as this build re-bundles the nsis executable and wraps it in an msi

    if (!config.win || !config.win.target || !Array.isArray(config.win.target)) {
      throw new Error("No windows target found!")
    }

    const target = config.win.target
    const nsisTarget = "nsis"
    if (
      !target
        .map((t: TargetConfiguration | string): string => {
          const result: string = typeof t === "string" ? t : t.target
          return result.toLowerCase().trim()
        })
        .some(t => t === nsisTarget)
    ) {
      throw new Error("No nsis target found! Please specify an nsis target")
    }
  }

  build(appOutDir: string, arch: Arch): Promise<any> {
    this.archs.set(arch, appOutDir)
    return Promise.resolve()
  }

  finishBuild(): Promise<any> {
    // this target invokes `build` in `finishBuild` to guarantee
    // that the dependent target has already been built
    // this also affords us re-usability
    const [arch, appOutDir] = this.archs.entries().next().value

    this.validatePrerequisites()

    return super.build(appOutDir, arch)
  }

  protected get installerFilenamePattern(): string {
    // big assumption is made here for the moment that the pattern didn't change
    // tslint:disable:no-invalid-template-strings
    return "${productName} Setup ${version}.${ext}"
  }

  private getExeSourcePath(arch: Arch) {
    const packager = this.packager
    // in this case, we want .exe, this way we can wrap the existing package if it exists
    const artifactName = packager.expandArtifactNamePattern(this.options, "exe", arch, this.installerFilenamePattern, false, this.packager.platformSpecificBuildOptions.defaultArch)
    const artifactPath = path.join(this.outDir, artifactName)

    return artifactPath
  }

  protected async writeManifest(_appOutDir: string, arch: Arch, commonOptions: FinalCommonWindowsInstallerOptions) {
    const exeSourcePath = this.getExeSourcePath(arch)
    const options = this.options

    return (await this.projectTemplate.value)({
      ...(await this.getBaseOptions(commonOptions)),
      exeSourcePath: exeSourcePath,
      productId: this.productId,
      impersonate: options.impersonate === true ? "yes" : "no",
      wrappedInstallerArgs: options.wrappedInstallerArgs,
    })
  }
}
