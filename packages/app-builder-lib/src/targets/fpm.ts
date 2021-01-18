import { path7za } from "7zip-bin"
import { Arch, executeAppBuilder, log, TmpDir, toLinuxArchString, use } from "builder-util"
import { unlinkIfExists } from "builder-util/out/fs"
import { ensureDir, outputFile, readFile } from "fs-extra"
import * as path from "path"
import { DebOptions, LinuxTargetSpecificOptions } from ".."
import { smarten } from "../appInfo"
import { Target } from "../core"
import * as errorMessages from "../errorMessages"
import { LinuxPackager } from "../linuxPackager"
import { objectToArgs } from "../util/appBuilder"
import { computeEnv } from "../util/bundledTool"
import { isMacOsSierra } from "../util/macosVersion"
import { getTemplatePath } from "../util/pathManager"
import { installPrefix, LinuxTargetHelper } from "./LinuxTargetHelper"
import { getLinuxToolsPath } from "./tools"

interface FpmOptions {
  maintainer: string | undefined
  vendor: string
  url: string
}

export default class FpmTarget extends Target {
  readonly options: LinuxTargetSpecificOptions = {...this.packager.platformSpecificBuildOptions, ...(this.packager.config as any)[this.name]}

  private readonly scriptFiles: Promise<Array<string>>

  constructor(name: string, private readonly packager: LinuxPackager, private readonly helper: LinuxTargetHelper, readonly outDir: string) {
    super(name, false)

    this.scriptFiles = this.createScripts()
  }

  private async createScripts(): Promise<Array<string>> {
    const defaultTemplatesDir = getTemplatePath("linux")

    const packager = this.packager
    const templateOptions = {
      // old API compatibility
      executable: packager.executableName,
      productFilename: packager.appInfo.productFilename, ...packager.platformSpecificBuildOptions}

    function getResource(value: string | null | undefined, defaultFile: string) {
      if (value == null) {
        return path.join(defaultTemplatesDir, defaultFile)
      }
      return path.resolve(packager.projectDir, value)
    }

    return await Promise.all<string>([
      writeConfigFile(packager.info.tempDirManager, getResource(this.options.afterInstall, "after-install.tpl"), templateOptions),
      writeConfigFile(packager.info.tempDirManager, getResource(this.options.afterRemove, "after-remove.tpl"), templateOptions)
    ])
  }

  checkOptions(): Promise<any> {
    return this.computeFpmMetaInfoOptions()
  }

  private async computeFpmMetaInfoOptions(): Promise<FpmOptions> {
    const packager = this.packager
    const projectUrl = await packager.appInfo.computePackageUrl()
    const errors: Array<string> = []
    if (projectUrl == null) {
      errors.push("Please specify project homepage, see https://electron.build/configuration/configuration#Metadata-homepage")
    }

    const options = this.options
    let author = options.maintainer
    if (author == null) {
      const a = packager.info.metadata.author
      if (a == null || a.email == null) {
        errors.push(errorMessages.authorEmailIsMissed)
      }
      else {
        author = `${a.name} <${a.email}>`
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join("\n\n"))
    }

    return {
      maintainer: author!!,
      url: projectUrl!!,
      vendor: options.vendor || author!!,
    }
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const target = this.name

    // tslint:disable:no-invalid-template-strings
    let nameFormat = "${name}-${version}-${arch}.${ext}"
    let isUseArchIfX64 = false
    if (target === "deb") {
      nameFormat = "${name}_${version}_${arch}.${ext}"
      isUseArchIfX64 = true
    }
    else if (target === "rpm") {
      nameFormat = "${name}-${version}.${arch}.${ext}"
      isUseArchIfX64 = true
    }

    const packager = this.packager
    const artifactPath = path.join(this.outDir, packager.expandArtifactNamePattern(this.options, target, arch, nameFormat, !isUseArchIfX64))

    await packager.info.callArtifactBuildStarted({
      targetPresentableName: target,
      file: artifactPath,
      arch,
    })

    await unlinkIfExists(artifactPath)
    if (packager.packagerOptions.prepackaged != null) {
      await ensureDir(this.outDir)
    }

    const scripts = await this.scriptFiles
    const appInfo = packager.appInfo
    const options = this.options
    const synopsis = options.synopsis
    const args = [
      "--architecture", toLinuxArchString(arch, target),
      "--name", appInfo.linuxPackageName,
      "--after-install", scripts[0],
      "--after-remove", scripts[1],
      "--description", smarten(target === "rpm" ? this.helper.getDescription(options)! : `${synopsis || ""}\n ${this.helper.getDescription(options)}`),
      "--version", appInfo.version,
      "--package", artifactPath,
    ]

    objectToArgs(args, await this.computeFpmMetaInfoOptions() as any)

    const packageCategory = options.packageCategory
    if (packageCategory != null) {
      args.push("--category", packageCategory)
    }

    if (target === "deb") {
      use((options as DebOptions).priority, it => args.push("--deb-priority", it!))
    }
    else if (target === "rpm") {
      if (synopsis != null) {
        args.push("--rpm-summary", smarten(synopsis))
      }
    }

    const fpmConfiguration: FpmConfiguration = {
      args, target,
    }

    if (options.compression != null) {
      fpmConfiguration.compression = options.compression
    }

    // noinspection JSDeprecatedSymbols
    const depends = options.depends
    if (depends != null) {
      if (Array.isArray(depends)) {
        fpmConfiguration.customDepends = depends
      }
      else {
        // noinspection SuspiciousTypeOfGuard
        if (typeof depends === "string") {
          fpmConfiguration.customDepends = [depends as string]
        }
        else {
          throw new Error(`depends must be Array or String, but specified as: ${depends}`)
        }
      }
    }

    use(packager.info.metadata.license, it => args.push("--license", it!))
    use(appInfo.buildNumber, it => args.push("--iteration", it!))

    use(options.fpm, it => args.push(...it as any))

    args.push(`${appOutDir}/=${installPrefix}/${appInfo.productFilename}`)
    for (const icon of (await this.helper.icons)) {
      const extWithDot = path.extname(icon.file)
      const sizeName = extWithDot === ".svg" ? "scalable" : `${icon.size}x${icon.size}`
      args.push(`${icon.file}=/usr/share/icons/hicolor/${sizeName}/apps/${packager.executableName}${extWithDot}`)
    }

    const mimeTypeFilePath = await this.helper.mimeTypeFiles
    if (mimeTypeFilePath != null) {
      args.push(`${mimeTypeFilePath}=/usr/share/mime/packages/${packager.executableName}.xml`)
    }

    const desktopFilePath = await this.helper.writeDesktopEntry(this.options)
    args.push(`${desktopFilePath}=/usr/share/applications/${packager.executableName}.desktop`)

    if (packager.packagerOptions.effectiveOptionComputed != null && await packager.packagerOptions.effectiveOptionComputed([args, desktopFilePath])) {
      return
    }

    const env = {
      ...process.env,
      SZA_PATH: path7za,
      SZA_COMPRESSION_LEVEL: packager.compression === "store" ? "0" : "9",
    }

    // rpmbuild wants directory rpm with some default config files. Even if we can use dylibbundler, path to such config files are not changed (we need to replace in the binary)
    // so, for now, brew install rpm is still required.
    if (target !== "rpm" && await isMacOsSierra()) {
      const linuxToolsPath = await getLinuxToolsPath()
      Object.assign(env, {
        PATH: computeEnv(process.env.PATH, [path.join(linuxToolsPath, "bin")]),
        DYLD_LIBRARY_PATH: computeEnv(process.env.DYLD_LIBRARY_PATH, [path.join(linuxToolsPath, "lib")]),
      })
    }

    await executeAppBuilder(["fpm", "--configuration", JSON.stringify(fpmConfiguration)], undefined, {env})

    await packager.dispatchArtifactCreated(artifactPath, this, arch)
  }
}

interface FpmConfiguration {
  target: string
  args: Array<string>
  customDepends?: Array<string>
  compression?: string | null
}

async function writeConfigFile(tmpDir: TmpDir, templatePath: string, options: any): Promise<string> {
  //noinspection JSUnusedLocalSymbols
  function replacer(match: string, p1: string) {
    if (p1 in options) {
      return options[p1]
    }
    else {
      throw new Error(`Macro ${p1} is not defined`)
    }
  }
  const config = (await readFile(templatePath, "utf8"))
    .replace(/\${([a-zA-Z]+)}/g, replacer)
    .replace(/<%=([a-zA-Z]+)%>/g, (match, p1) => {
      log.warn("<%= varName %> is deprecated, please use ${varName} instead")
      return replacer(match, p1.trim())
    })

  const outputPath = await tmpDir.getTempFile({suffix: path.basename(templatePath, ".tpl")})
  await outputFile(outputPath, config)
  return outputPath
}
