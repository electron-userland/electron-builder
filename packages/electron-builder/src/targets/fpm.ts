import { path7x, path7za } from "7zip-bin"
import BluebirdPromise from "bluebird-lst"
import { Arch, debug, exec, isMacOsSierra, log, smarten, TmpDir, toLinuxArchString, use, warn } from "builder-util"
import { getBinFromGithub } from "builder-util/out/binDownload"
import { computeEnv, getLinuxToolsPath } from "builder-util/out/bundledTool"
import { unlinkIfExists } from "builder-util/out/fs"
import { ensureDir, outputFile, readFile } from "fs-extra-p"
import { Lazy } from "lazy-val"
import * as path from "path"
import { Target } from "../core"
import * as errorMessages from "../errorMessages"
import { LinuxPackager } from "../linuxPackager"
import { DebOptions, LinuxTargetSpecificOptions } from "../options/linuxOptions"
import { getTemplatePath } from "../util/pathManager"
import { installPrefix, LinuxTargetHelper } from "./LinuxTargetHelper"

const fpmPath = new Lazy(() => {
  if (process.platform === "win32" || process.env.USE_SYSTEM_FPM === "true") {
    return BluebirdPromise.resolve("fpm")
  }

  const osAndArch = process.platform === "darwin" ? "mac" : `linux-x86${process.arch === "ia32" ? "" : "_64"}`

  if (process.platform === "darwin") {
    //noinspection SpellCheckingInspection
    return getBinFromGithub("fpm", "1.9.2.1-20150715-2.2.2-mac", "6sZZoRKkxdmv3a6E5dnZgVl23apGnImhDtGHKhgCE1WOtXBUJnx+w0WvB2HD2/sitz4f93Mf7+QqDCIbfP7LOw==")
      .then(it => path.join(it, "fpm"))
  }

  //noinspection SpellCheckingInspection
  const checksum = process.arch === "ia32" ? "cTT/HdjrQ6qTJQhTZaZC3lyDkRCyNFtNBZ0F7n6mh5B3YmD5ttJZ0xn65pQS03dhEi67A8K1xXNO+tyEEviiIg==" : "0zKxWlHuQEUsXJpWll5Bc4OTI8d0jcMVlme9OeHI+Y+s3sv1S4KyGLOEVEkNw6pRU8F+A1Dj5IR95/+U8YzB0A=="
  return getBinFromGithub("fpm", `1.9.2-2.3.1-${osAndArch}`, checksum)
    .then(it => path.join(it, "fpm"))
})

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

    return await BluebirdPromise.all<string>([
      writeConfigFile(packager.info.tempDirManager, getResource(this.options.afterInstall, "after-install.tpl"), templateOptions),
      writeConfigFile(packager.info.tempDirManager, getResource(this.options.afterRemove, "after-remove.tpl"), templateOptions)
    ])
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const target = this.name

    log(`Building ${target}`)

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

    const destination = path.join(this.outDir, this.packager.expandArtifactNamePattern(this.options, target, arch, nameFormat, !isUseArchIfX64))
    await unlinkIfExists(destination)
    if (this.packager.packagerOptions.prepackaged != null) {
      await ensureDir(this.outDir)
    }

    const scripts = await this.scriptFiles
    const packager = this.packager
    const appInfo = packager.appInfo

    const projectUrl = await appInfo.computePackageUrl()
    if (projectUrl == null) {
      throw new Error("Please specify project homepage, see https://electron.build/configuration/configuration#Metadata-homepage")
    }

    const options = this.options
    let author = options.maintainer
    if (author == null) {
      const a = packager.info.metadata.author!
      if (a.email == null) {
        throw new Error(errorMessages.authorEmailIsMissed)
      }
      author = `${a.name} <${a.email}>`
    }

    const synopsis = options.synopsis
    const args = [
      "-s", "dir",
      "-t", target,
      "--architecture", (target === "pacman" && arch === Arch.ia32) ? "i686" : toLinuxArchString(arch),
      "--name", appInfo.name,
      "--force",
      "--after-install", scripts[0],
      "--after-remove", scripts[1],
      "--description", smarten(target === "rpm" ? this.helper.getDescription(options)! : `${synopsis || ""}\n ${this.helper.getDescription(options)}`),
      "--maintainer", author,
      "--vendor", options.vendor || author,
      "--version", appInfo.version,
      "--package", destination,
      "--url", projectUrl,
    ]

    if (debug.enabled) {
      args.push(
        "--log", "debug",
        "--debug")
    }

    const packageCategory = options.packageCategory
    if (packageCategory != null && packageCategory !== null) {
      args.push("--category", packageCategory)
    }

    if (target === "deb") {
      args.push("--deb-compression", (options as DebOptions).compression || "xz")
      use((options as DebOptions).priority, it => args.push("--deb-priority", it!))
    }
    else if (target === "rpm") {
      args.push("--rpm-os", "linux")

      if (synopsis != null) {
        args.push("--rpm-summary", smarten(synopsis))
      }
    }

    // noinspection JSDeprecatedSymbols
    let depends = options.depends || this.packager.platformSpecificBuildOptions.depends
    if (depends == null) {
      if (target === "deb") {
        depends = ["gconf2", "gconf-service", "libnotify4", "libappindicator1", "libxtst6", "libnss3", "libxss1"]
      }
      else if (target === "pacman") {
        // noinspection SpellCheckingInspection
        depends = ["c-ares", "ffmpeg", "gtk3", "http-parser", "libevent", "libvpx", "libxslt", "libxss", "minizip", "nss", "re2", "snappy", "libnotify", "libappindicator-gtk2", "libappindicator-gtk3", "libappindicator-sharp"]
      }
      else if (target === "rpm") {
        depends = ["libnotify", "libappindicator"]
      }
      else {
        depends = []
      }
    }
    else if (!Array.isArray(depends)) {
      if (typeof depends === "string") {
        depends = [depends as string]
      }
      else {
        throw new Error(`depends must be Array or String, but specified as: ${depends}`)
      }
    }

    for (const dep of depends) {
      args.push("--depends", dep)
    }

    use(packager.info.metadata.license, it => args.push("--license", it!))
    use(appInfo.buildNumber, it => args.push("--iteration", it!))

    use(options.fpm, it => args.push(...it as any))

    args.push(`${appOutDir}/=${installPrefix}/${appInfo.productFilename}`)
    for (const icon of (await this.helper.icons)) {
      args.push(`${icon.file}=/usr/share/icons/hicolor/${icon.size}x${icon.size}/apps/${packager.executableName}.png`)
    }

    const desktopFilePath = await this.helper.writeDesktopEntry(this.options)
    args.push(`${desktopFilePath}=/usr/share/applications/${this.packager.executableName}.desktop`)

    if (this.packager.packagerOptions.effectiveOptionComputed != null && await this.packager.packagerOptions.effectiveOptionComputed([args, desktopFilePath])) {
      return
    }

    const env = {
      ...process.env,
      FPM_COMPRESS_PROGRAM: path7x,
      SZA_PATH: path7za,
      SZA_COMPRESSION_LEVEL: packager.config.compression === "store" ? "0" : "9",
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
    await exec(await fpmPath.value, args, {env})

    this.packager.dispatchArtifactCreated(destination, this, arch)
  }
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
      warn("<%= varName %> is deprecated, please use ${varName} instead")
      return replacer(match, p1.trim())
    })

  const outputPath = await tmpDir.getTempFile({suffix: path.basename(templatePath, ".tpl")})
  await outputFile(outputPath, config)
  return outputPath
}
