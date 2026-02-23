import { Arch } from "builder-util"
import { SnapStoreOptions } from "builder-util-runtime"
import * as path from "path"
import { Configuration } from "../../configuration"
import { Publish, Target } from "../../core"
import { LinuxPackager } from "../../linuxPackager"
import { SnapBaseOptions, SnapOptions } from "../../options/SnapOptions"
import { LinuxTargetHelper } from "../LinuxTargetHelper"
import { createStageDirPath } from "../targetUtil"

export abstract class SnapCore<T extends SnapBaseOptions> {
  protected abstract defaultPlugs: Array<string>

  constructor(
    protected readonly packager: LinuxPackager,
    protected readonly helper: LinuxTargetHelper,
    protected readonly options: T
  ) {}

  abstract createDescriptor(arch: Arch): Promise<any>
  abstract buildSnap(params: { snap: any; appOutDir: string; stageDir: string; snapArch: Arch; artifactPath: string }): Promise<void>
}

export default class SnapTarget extends Target {
  readonly options: SnapOptions = { ...this.packager.platformSpecificBuildOptions, ...(this.packager.config as any)[this.name] }

  constructor(
    name: string,
    protected readonly packager: LinuxPackager,
    protected readonly helper: LinuxTargetHelper,
    readonly outDir: string
  ) {
    super(name)
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager
    // tslint:disable-next-line:no-invalid-template-strings
    const artifactName = packager.expandArtifactNamePattern(this.options, "snap", arch, "${name}_${version}_${arch}.${ext}", false)
    const artifactPath = path.join(this.outDir, artifactName)

    await packager.info.emitArtifactBuildStarted({
      targetPresentableName: "snap",
      file: artifactPath,
      arch,
    })

    const core = this.helper.getSnapCore()

    await core.buildSnap({
      snap: await core.createDescriptor(arch),
      appOutDir,
      stageDir: await createStageDirPath(this, packager, arch),
      snapArch: arch,
      artifactPath,
    })

    const publishConfig = this.findSnapPublishConfig(packager.config)

    await packager.info.emitArtifactBuildCompleted({
      file: artifactPath,
      safeArtifactName: packager.computeSafeArtifactName(artifactName, "snap", arch, false),
      target: this,
      arch,
      packager,
      publishConfig,
    })
  }

  protected findSnapPublishConfig(config?: Configuration): SnapStoreOptions | null {
    const fallback: SnapStoreOptions = { provider: "snapStore" }

    if (!config) {
      return fallback
    }

    if (config.snap?.publish) {
      return this.findSnapPublishConfigInPublishNode(config.snap.publish)
    }

    if (config.linux?.publish) {
      const configCandidate = this.findSnapPublishConfigInPublishNode(config.linux.publish)

      if (configCandidate) {
        return configCandidate
      }
    }

    if (config.publish) {
      const configCandidate = this.findSnapPublishConfigInPublishNode(config.publish)

      if (configCandidate) {
        return configCandidate
      }
    }

    return fallback
  }

  private findSnapPublishConfigInPublishNode(configPublishNode: Publish): SnapStoreOptions | null {
    if (!configPublishNode) {
      return null
    }

    if (Array.isArray(configPublishNode)) {
      for (const configObj of configPublishNode) {
        if (this.isSnapStoreOptions(configObj)) {
          return configObj
        }
      }
    }

    if (typeof configPublishNode === `object` && this.isSnapStoreOptions(configPublishNode)) {
      return configPublishNode
    }

    return null
  }

  private isSnapStoreOptions(configPublishNode: Publish): configPublishNode is SnapStoreOptions {
    const snapStoreOptionsCandidate = configPublishNode as SnapStoreOptions
    return snapStoreOptionsCandidate?.provider === `snapStore`
  }
}
