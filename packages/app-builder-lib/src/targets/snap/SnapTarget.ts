import { Arch, log } from "builder-util"
import { snapArchStringToArch } from "./snapcraftBuilder"
import { deepAssign, SnapStoreOptions } from "builder-util-runtime"
import * as path from "path"
import { Configuration } from "../../configuration"
import { Publish, Target } from "../../core"
import { LinuxPackager } from "../../linuxPackager"
import { SnapcraftOptions, SnapOptions } from "../../options/SnapOptions"
import { LinuxTargetHelper } from "../LinuxTargetHelper"
import { createStageDirPath } from "../targetUtil"
import { SnapcraftYAML } from "./snapcraft"

/** Abstract base for all snap build strategies (core24, legacy core18/20/22, custom pass-through). */
export abstract class SnapCore<T> {
  protected abstract defaultPlugs: Array<string>

  constructor(
    protected readonly packager: LinuxPackager,
    protected readonly helper: LinuxTargetHelper,
    protected readonly options: T
  ) {}

  abstract createDescriptor(arch: Arch): Promise<SnapcraftYAML>
  // snapArch is passed through to subclasses; SnapCoreLegacy forwards it to app-builder as --arch.
  abstract buildSnap(params: { snap: SnapcraftYAML; appOutDir: string; stageDir: string; snapArch: Arch; artifactPath: string }): Promise<string[]>
}

/** Snap build target — merges `snapcraft` (preferred) and legacy `snap` config, then delegates to the appropriate `SnapCore` strategy. */
export default class SnapTarget extends Target {
  readonly options: SnapcraftOptions | SnapOptions

  constructor(
    name: string,
    protected readonly packager: LinuxPackager,
    protected readonly helper: LinuxTargetHelper,
    readonly outDir: string
  ) {
    super(name)

    const {
      config: { snapcraft, snap },
      platformSpecificBuildOptions,
    } = packager

    this.options = deepAssign({}, platformSpecificBuildOptions, snapcraft ?? snap ?? {})
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

    const snap = await core.createDescriptor(arch)
    log.debug({ snap }, "snapcraft.yaml descriptor created")

    const allArtifactPaths = await core.buildSnap({
      snap,
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

    // Emit additional artifacts produced by a multi-arch remote-build invocation.
    for (const extraPath of allArtifactPaths) {
      if (extraPath === artifactPath) {
        continue
      }
      const snapArch = path.basename(extraPath).replace(/\.snap$/, "").split("_").pop() ?? "amd64"
      const extraArch = snapArchStringToArch(snapArch)
      const extraArtifactName = path.basename(extraPath)
      await packager.info.emitArtifactBuildCompleted({
        file: extraPath,
        safeArtifactName: packager.computeSafeArtifactName(extraArtifactName, "snap", extraArch, false),
        target: this,
        arch: extraArch,
        packager,
        publishConfig,
      })
    }
  }

  protected findSnapPublishConfig(config?: Configuration): SnapStoreOptions | null {
    const fallback: SnapStoreOptions = { provider: "snapStore" }

    if (!config) {
      return fallback
    }

    const snapConfig = config.snapcraft ?? config.snap
    if (snapConfig?.publish) {
      return this.findSnapPublishConfigInPublishNode(snapConfig.publish)
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
