import { Arch, asArray, executeAppBuilder, getArchSuffix, getPath7za, log, serializeToYaml, TmpDir, toLinuxArchString, unlinkIfExists, use } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { copyFile, outputFile, stat } from "fs-extra"
import { mkdir, readFile } from "fs/promises"
import * as path from "path"
import { smarten } from "../appInfo"
import { Target } from "../core"
import * as errorMessages from "../errorMessages"
import { LinuxPackager } from "../linuxPackager"
import { DebOptions, LinuxTargetSpecificOptions } from "../options/linuxOptions"
import { ArtifactCreated } from "../packagerApi"
import { getAppUpdatePublishConfiguration } from "../publish/PublishManager"
import { objectToArgs } from "../util/appBuilder"
import { computeEnv } from "../util/bundledTool"
import { hashFile } from "../util/hash"
import { isMacOsSierra } from "../util/macosVersion"
import { getTemplatePath } from "../util/pathManager"
import { installPrefix, LinuxTargetHelper } from "./LinuxTargetHelper"
import { getLinuxToolsPath } from "./tools"

interface FpmOptions {
  name: string
  maintainer: string | undefined
  vendor: string
  url: string
}

interface ScriptFiles {
  afterRemove: string
  afterInstall: string
  appArmor: string
}

export default class FpmTarget extends Target {
  readonly options: LinuxTargetSpecificOptions = { ...this.packager.platformSpecificBuildOptions, ...(this.packager.config as any)[this.name] }

  private readonly scriptFiles: Promise<ScriptFiles>

  constructor(
    name: string,
    private readonly packager: LinuxPackager,
    private readonly helper: LinuxTargetHelper,
    readonly outDir: string
  ) {
    super(name, false)

    this.scriptFiles = this.createScripts()
  }

  private async createScripts(): Promise<ScriptFiles> {
    const defaultTemplatesDir = getTemplatePath("linux")

    const packager = this.packager
    const templateOptions = {
      // old API compatibility
      executable: packager.executableName,
      sanitizedProductName: packager.appInfo.sanitizedProductName,
      productFilename: packager.appInfo.productFilename,
      ...packager.platformSpecificBuildOptions,
    }

    function getResource(value: string | Nullish, defaultFile: string) {
      if (value == null) {
        return path.join(defaultTemplatesDir, defaultFile)
      }
      return path.resolve(packager.projectDir, value)
    }

    return {
      afterInstall: await writeConfigFile(packager.info.tempDirManager, getResource(this.options.afterInstall, "after-install.tpl"), templateOptions),
      afterRemove: await writeConfigFile(packager.info.tempDirManager, getResource(this.options.afterRemove, "after-remove.tpl"), templateOptions),
      appArmor: await writeConfigFile(packager.info.tempDirManager, getResource(this.options.appArmorProfile, "apparmor-profile.tpl"), templateOptions),
    }
  }

  checkOptions(): Promise<any> {
    return this.computeFpmMetaInfoOptions()
  }

  private async computeFpmMetaInfoOptions(): Promise<FpmOptions> {
    const packager = this.packager
    const projectUrl = await packager.appInfo.computePackageUrl()
    const errors: Array<string> = []
    if (projectUrl == null) {
      errors.push("Please specify project homepage, see https://www.electron.build/configuration#metadata")
    }

    const options = this.options
    let author = options.maintainer
    if (author == null) {
      const a = packager.info.metadata.author
      if (a == null || a.email == null) {
        errors.push(errorMessages.authorEmailIsMissed)
      } else {
        author = `${a.name} <${a.email}>`
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join("\n\n"))
    }

    return {
      name: options.packageName ?? this.packager.appInfo.linuxPackageName,
      maintainer: author!,
      url: projectUrl!,
      vendor: options.vendor || author!,
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
    } else if (target === "rpm") {
      nameFormat = "${name}-${version}.${arch}.${ext}"
      isUseArchIfX64 = true
    }

    const packager = this.packager
    const artifactName = packager.expandArtifactNamePattern(this.options, target, arch, nameFormat, !isUseArchIfX64)
    const artifactPath = path.join(this.outDir, artifactName)

    await packager.info.emitArtifactBuildStarted({
      targetPresentableName: target,
      file: artifactPath,
      arch,
    })

    await unlinkIfExists(artifactPath)
    if (packager.packagerOptions.prepackaged != null) {
      await mkdir(this.outDir, { recursive: true })
    }
    const linuxDistType = packager.packagerOptions.prepackaged || path.join(this.outDir, `linux${getArchSuffix(arch)}-unpacked`)
    const resourceDir = packager.getResourcesDir(linuxDistType)

    const publishConfig = this.supportsAutoUpdate(target)
      ? await getAppUpdatePublishConfiguration(packager, arch, false /* in any case validation will be done on publish */)
      : null
    if (publishConfig != null) {
      log.info({ resourceDir: log.filePath(resourceDir) }, `adding autoupdate files for: ${target}. (Beta feature)`)
      await outputFile(path.join(resourceDir, "app-update.yml"), serializeToYaml(publishConfig))
      // Extra file needed for auto-updater to detect installation method
      await outputFile(path.join(resourceDir, "package-type"), target)
    }

    const scripts = await this.scriptFiles

    // Install AppArmor support for ubuntu 24+
    // https://github.com/electron-userland/electron-builder/issues/8635
    await copyFile(scripts.appArmor, path.join(resourceDir, "apparmor-profile"))

    const appInfo = packager.appInfo
    const options = this.options
    const synopsis = options.synopsis
    const args = [
      "--architecture",
      toLinuxArchString(arch, target),
      "--after-install",
      scripts.afterInstall,
      "--after-remove",
      scripts.afterRemove,
      "--description",
      smarten(target === "rpm" ? this.helper.getDescription(options) : `${synopsis || ""}\n ${this.helper.getDescription(options)}`),
      "--version",
      this.helper.getSanitizedVersion(target),
      "--package",
      artifactPath,
    ]

    objectToArgs(args, (await this.computeFpmMetaInfoOptions()) as any)

    const packageCategory = options.packageCategory
    if (packageCategory != null) {
      args.push("--category", packageCategory)
    }

    if (target === "deb") {
      args.push("--deb-priority", (options as DebOptions).priority ?? "optional")
    } else if (target === "rpm") {
      if (synopsis != null) {
        args.push("--rpm-summary", smarten(synopsis))
      }
    }

    const fpmConfiguration: FpmConfiguration = {
      args,
      target,
    }

    if (options.compression != null) {
      fpmConfiguration.compression = options.compression
    }

    // noinspection JSDeprecatedSymbols
    const depends = options.depends
    if (depends != null) {
      if (Array.isArray(depends)) {
        fpmConfiguration.customDepends = depends
      } else {
        // noinspection SuspiciousTypeOfGuard
        if (typeof depends === "string") {
          fpmConfiguration.customDepends = [depends as string]
        } else {
          throw new Error(`depends must be Array or String, but specified as: ${depends}`)
        }
      }
    } else {
      fpmConfiguration.customDepends = this.getDefaultDepends(target)
    }

    if (target === "deb") {
      const recommends = (options as DebOptions).recommends
      if (recommends) {
        fpmConfiguration.customRecommends = asArray(recommends)
      } else {
        fpmConfiguration.customRecommends = this.getDefaultRecommends(target)
      }
    }

    use(packager.info.metadata.license, it => args.push("--license", it))
    use(appInfo.buildNumber, it =>
      args.push(
        "--iteration",
        // dashes are not supported for iteration in older versions of fpm
        // https://github.com/jordansissel/fpm/issues/1833
        it.split("-").join("_")
      )
    )

    use(options.fpm, it => args.push(...it))

    args.push(`${appOutDir}/=${installPrefix}/${appInfo.sanitizedProductName}`)
    for (const icon of await this.helper.icons) {
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

    if (packager.packagerOptions.effectiveOptionComputed != null && (await packager.packagerOptions.effectiveOptionComputed([args, desktopFilePath]))) {
      return
    }

    const env = {
      ...process.env,
      SZA_PATH: await getPath7za(),
      SZA_COMPRESSION_LEVEL: packager.compression === "store" ? "0" : "9",
    }

    // rpmbuild wants directory rpm with some default config files. Even if we can use dylibbundler, path to such config files are not changed (we need to replace in the binary)
    // so, for now, brew install rpm is still required.
    if (target !== "rpm" && (await isMacOsSierra())) {
      const linuxToolsPath = await getLinuxToolsPath()
      Object.assign(env, {
        PATH: computeEnv(process.env.PATH, [path.join(linuxToolsPath, "bin")]),
        DYLD_LIBRARY_PATH: computeEnv(process.env.DYLD_LIBRARY_PATH, [path.join(linuxToolsPath, "lib")]),
      })
    }

    await executeAppBuilder(["fpm", "--configuration", JSON.stringify(fpmConfiguration)], undefined, { env })

    let info: ArtifactCreated = {
      file: artifactPath,
      target: this,
      arch,
      packager,
    }
    if (publishConfig != null) {
      info = {
        ...info,
        safeArtifactName: packager.computeSafeArtifactName(artifactName, target, arch, !isUseArchIfX64),
        isWriteUpdateInfo: true,
        updateInfo: {
          sha512: await hashFile(artifactPath),
          size: (await stat(artifactPath)).size,
        },
      }
    }
    await packager.info.emitArtifactBuildCompleted(info)
  }

  private supportsAutoUpdate(target: string) {
    return ["deb", "rpm", "pacman"].includes(target)
  }

  private getDefaultDepends(target: string): string[] {
    switch (target) {
      case "deb":
        return ["libgtk-3-0", "libnotify4", "libnss3", "libxss1", "libxtst6", "xdg-utils", "libatspi2.0-0", "libuuid1", "libsecret-1-0"]

      case "rpm":
        return [
          "gtk3" /* for electron 2+ (electron 1 uses gtk2, but this old version is not supported anymore) */,
          "libnotify",
          "nss",
          "libXScrnSaver",
          "(libXtst or libXtst6)",
          "xdg-utils",
          "at-spi2-core" /* since 5.0.0 */,
          "(libuuid or libuuid1)" /* since 4.0.0 */,
        ]

      case "pacman":
        return ["c-ares", "ffmpeg", "gtk3", "http-parser", "libevent", "libvpx", "libxslt", "libxss", "minizip", "nss", "re2", "snappy", "libnotify", "libappindicator-gtk3"]

      default:
        return []
    }
  }

  private getDefaultRecommends(target: string): string[] {
    switch (target) {
      case "deb":
        return ["libappindicator3-1"]
      default:
        return []
    }
  }
}

interface FpmConfiguration {
  target: string
  args: Array<string>
  customDepends?: Array<string>
  customRecommends?: Array<string>
  compression?: string | null
}

async function writeConfigFile(tmpDir: TmpDir, templatePath: string, options: any): Promise<string> {
  //noinspection JSUnusedLocalSymbols
  function replacer(match: string, p1: string) {
    if (p1 in options) {
      return options[p1]
    } else {
      throw new Error(`Macro ${p1} is not defined`)
    }
  }
  const config = (await readFile(templatePath, "utf8")).replace(/\${([a-zA-Z]+)}/g, replacer).replace(/<%=([a-zA-Z]+)%>/g, (match, p1) => {
    log.warn("<%= varName %> is deprecated, please use ${varName} instead")
    return replacer(match, p1.trim())
  })

  const outputPath = await tmpDir.getTempFile({ suffix: path.basename(templatePath, ".tpl") })
  await outputFile(outputPath, config)
  return outputPath
}
