import { readJson, writeFile } from "fs-extra"
import * as path from "path"
import { UploadTask, Arch, Packager, PackagerOptions, PublishOptions } from ".."
import { InvalidConfigurationError } from "builder-util"
import SnapTarget from "../targets/snap"

if (process.env.BUILDER_REMOVE_STAGE_EVEN_IF_DEBUG == null) {
  process.env.BUILDER_REMOVE_STAGE_EVEN_IF_DEBUG = "true"
}

async function doBuild(data: BuildTask): Promise<void> {
  if (process.env.APP_BUILDER_TMP_DIR == null) {
    throw new InvalidConfigurationError("Env APP_BUILDER_TMP_DIR must be set for builder process")
  }

  const projectDir = process.env.PROJECT_DIR
  if (projectDir == null) {
    throw new InvalidConfigurationError("Env PROJECT_DIR must be set for builder process")
  }

  const targets = data.targets
  if (data.platform == null) {
    throw new InvalidConfigurationError("platform not specified")
  }
  if (targets == null) {
    throw new InvalidConfigurationError("targets path not specified")
  }
  if (!Array.isArray(targets)) {
    throw new InvalidConfigurationError("targets must be array of target name")
  }

  const infoFile = projectDir + path.sep + "info.json"
  const info = await readJson(infoFile)

  const projectOutDir = process.env.PROJECT_OUT_DIR
  if (projectDir == null) {
    throw new InvalidConfigurationError("Env PROJECT_OUT_DIR must be set for builder process")
  }

  // yes, for now we expect the only target
  const prepackaged = projectDir + path.sep + targets[0].unpackedDirName
  // do not use build function because we don't need to publish artifacts
  const options: PackagerOptions & PublishOptions = {
    prepackaged,
    projectDir,
    [data.platform]: targets.map(it => it.name + ":" + it.arch),
    publish: "never",
  }
  const packager = new Packager(options)

  const artifacts: Array<ArtifactInfo> = []
  const relativePathOffset = projectOutDir!!.length + 1
  packager.artifactCreated(event => {
    if (event.file == null) {
      return
    }

    artifacts.push({
      file: event.file.substring(relativePathOffset),
      target: event.target == null ? null : event.target.name,
      arch: event.arch,
      safeArtifactName: event.safeArtifactName,
      isWriteUpdateInfo: event.isWriteUpdateInfo === true,
      updateInfo: event.updateInfo,
    })
  })

  packager.stageDirPathCustomizer = (target, packager, arch) => {
    // snap creates a lot of files and so, we cannot use tmpfs to avoid out of memory error
    const parentDir = target.name === "snap" && !(target as SnapTarget).isUseTemplateApp ? projectOutDir : projectDir
    return parentDir + path.sep + `__${target.name}-${Arch[arch]}`
  }

  // _build method expects final effective configuration - packager.options.config is ignored
  await packager._build({
    ...info.configuration,
    publish: null,
    beforeBuild: null,
    afterPack: null,
    afterSign: null,
    afterAllArtifactBuild: null,
    onNodeModuleFile: null,
    directories: {
      output: projectOutDir,
      buildResources: projectDir + path.sep + info.buildResourceDirName
    },
  }, info.metadata, info.devMetadata, info.repositoryInfo)

  // writeJson must be not used because it adds unwanted \n as last file symbol
  await writeFile(path.join(process.env.APP_BUILDER_TMP_DIR!!, "__build-result.json"), JSON.stringify(artifacts))
}

doBuild(JSON.parse(process.argv[2]))
  .catch(error => {
    process.exitCode = 0
    return writeFile(path.join(process.env.APP_BUILDER_TMP_DIR!!, "__build-result.json"), (error.stack || error).toString())
  })

interface TargetInfo {
  name: string
  arch: string
  unpackedDirName: string
}

interface ArtifactInfo extends UploadTask {
  target: string | null

  readonly isWriteUpdateInfo?: boolean
  readonly updateInfo?: any
}

interface BuildTask {
  platform: string
  targets: Array<TargetInfo>
}