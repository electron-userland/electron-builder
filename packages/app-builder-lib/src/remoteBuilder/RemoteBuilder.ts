import BluebirdPromise from "bluebird-lst"
import { Arch, isEnvTrue, log, InvalidConfigurationError } from "builder-util"
import * as path from "path"
import { UploadTask } from "electron-publish/out/publisher"
import { Platform, Target, TargetSpecificOptions } from "../core"
import { LinuxPackager } from "../linuxPackager"
import { ArtifactCreated } from "../packagerApi"
import { isSafeToUnpackElectronOnRemoteBuildServer, PlatformPackager } from "../platformPackager"
import { executeAppBuilderAsJson } from "../util/appBuilder"
import { ProjectInfoManager } from "./ProjectInfoManager"

interface TargetInfo {
  name: string
  arch: string
  unpackedDirectory: string
  outDir: string
}

export class RemoteBuilder {
  private readonly toBuild = new Map<Arch, Array<TargetInfo>>()
  private buildStarted = false

  constructor(readonly packager: PlatformPackager<any>) {
  }

  scheduleBuild(target: Target, arch: Arch, unpackedDirectory: string) {
    if (!isEnvTrue(process.env._REMOTE_BUILD) && this.packager.config.remoteBuild === false) {
      throw new InvalidConfigurationError("Target is not supported on your OS and using of Electron Build Service is disabled (\"remoteBuild\" option)")
    }

    let list = this.toBuild.get(arch)
    if (list == null) {
      list = []
      this.toBuild.set(arch, list)
    }

    list.push({
      name: target.name,
      arch: Arch[arch],
      unpackedDirectory,
      outDir: target.outDir,
    })
  }

  build(): Promise<any> {
    if (this.buildStarted) {
      return Promise.resolve()
    }

    this.buildStarted = true

    return BluebirdPromise.mapSeries(Array.from(this.toBuild.keys()), (arch: Arch) => {
      return this._build(this.toBuild.get(arch)!!, this.packager)
    })
  }

  // noinspection JSMethodCanBeStatic
  private async _build(targets: Array<TargetInfo>, packager: PlatformPackager<any>): Promise<void> {
    if (log.isDebugEnabled) {
      log.debug({remoteTargets: JSON.stringify(targets, null, 2)}, "remote building")
    }

    const projectInfoManager = new ProjectInfoManager(packager.info)

    const buildRequest: any = {
      targets: targets.map(it => {
        return {
          name: it.name,
          arch: it.arch,
          unpackedDirName: path.basename(it.unpackedDirectory),
        }
      }),
      platform: packager.platform.buildConfigurationKey,
    }

    if (isSafeToUnpackElectronOnRemoteBuildServer(packager)) {
      buildRequest.electronDownload = {
        version: packager.info.framework.version,
        platform: Platform.LINUX.nodeName,
        arch: targets[0].arch,
      }

      const linuxPackager = (packager as LinuxPackager)
      buildRequest.executableName = linuxPackager.executableName
    }

    const req = Buffer.from(JSON.stringify(buildRequest)).toString("base64")
    const outDir = targets[0].outDir
    const args = ["remote-build", "--request", req, "--output", outDir]

    args.push("--file", targets[0].unpackedDirectory)
    args.push("--file", await projectInfoManager.infoFile.value)

    const buildResourcesDir = packager.buildResourcesDir
    if (buildResourcesDir === packager.projectDir) {
      throw new InvalidConfigurationError(`Build resources dir equals to project dir and so, not sent to remote build agent. It will lead to incorrect results.\nPlease set "directories.buildResources" to separate dir or leave default ("build" directory in the project root)`)
    }

    args.push("--build-resource-dir", buildResourcesDir)

    const result: any = await executeAppBuilderAsJson(args)
    if (result.error != null) {
      throw new InvalidConfigurationError(`Remote builder error (if you think that it is not your application misconfiguration issue, please file issue to https://github.com/electron-userland/electron-builder/issues):\n\n${result.error}`, "REMOTE_BUILDER_ERROR")
    }
    else if (result.files != null) {
      for (const artifact of result.files) {
        const localFile = path.join(outDir, artifact.file)
        const artifactCreatedEvent = this.artifactInfoToArtifactCreatedEvent(artifact, localFile, outDir)
        // PublishManager uses outDir and options, real (the same as for local build) values must be used
        await this.packager.info.callArtifactBuildCompleted(artifactCreatedEvent)
      }
    }
  }

  private artifactInfoToArtifactCreatedEvent(artifact: ArtifactInfo, localFile: string, outDir: string): ArtifactCreated {
    const target = artifact.target
    // noinspection SpellCheckingInspection
    return {
      ...artifact,
      file: localFile,
      target: target == null ? null : new FakeTarget(target, outDir, (this.packager.config as any)[target]),
      packager: this.packager,
    }
  }
}

class FakeTarget extends Target {
  constructor(name: string, readonly outDir: string, readonly options: TargetSpecificOptions | null | undefined) {
    super(name)
  }

  async build(appOutDir: string, arch: Arch) {
    // no build
  }
}

interface ArtifactInfo extends UploadTask {
  target: string | null

  readonly isWriteUpdateInfo?: boolean
  readonly updateInfo?: any
}