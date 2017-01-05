import { deepAssign } from "electron-builder-util/out/deepAssign"
import * as path from "path"
import { log, warn } from "electron-builder-util/out/log"
import { PlatformPackager } from "../platformPackager"
import { MacOptions, DmgOptions } from "../options/macOptions"
import BluebirdPromise from "bluebird-lst-c"
import { debug, use, exec, isEmptyOrSpaces, spawn } from "electron-builder-util"
import { copy, unlink, outputFile, remove, readFile } from "fs-extra-p"
import { executeFinally } from "electron-builder-util/out/promise"
import sanitizeFileName from "sanitize-filename"
import { Target, Arch } from "electron-builder-core"
import { exists, statOrNull } from "electron-builder-util/out/fs"

export class DmgTarget extends Target {
  private helperDir = path.join(__dirname, "..", "..", "templates", "dmg")

  constructor(private packager: PlatformPackager<MacOptions>) {
    super("dmg")
  }

  async build(appOutDir: string, arch: Arch) {
    const packager = this.packager
    const appInfo = packager.appInfo
    log("Building DMG")

    const specification = await this.computeDmgOptions()

    const tempDir = await packager.getTempFile("dmg")
    const tempDmg = path.join(tempDir, "temp.dmg")
    const backgroundDir = path.join(tempDir, ".background")
    const backgroundFilename = specification.background == null ? null : path.basename(specification.background)
    if (backgroundFilename != null) {
      await copy(path.resolve(packager.info.projectDir, specification.background!), path.join(backgroundDir, backgroundFilename))
    }

    let preallocatedSize = 32 * 1024
    if (specification.icon != null) {
      const stat = await statOrNull(specification.icon)
      if (stat != null) {
        preallocatedSize += stat.size
      }
    }

    // allocate space for .DS_Store
    await outputFile(path.join(backgroundDir, "DSStorePlaceHolder"), new Buffer(preallocatedSize))

    const volumeName = sanitizeFileName(this.computeVolumeName(specification.title))
    //noinspection SpellCheckingInspection
    await spawn("hdiutil", addVerboseIfNeed(["create",
      "-srcfolder", backgroundDir,
      "-srcfolder", path.join(appOutDir, `${packager.appInfo.productFilename}.app`),
      "-volname", volumeName,
      "-anyowners", "-nospotlight", "-fs", "HFS+", "-fsargs", "-c c=64,a=16,e=16",
      "-format", "UDRW",
    ]).concat(tempDmg))

    const volumePath = path.join("/Volumes", volumeName)
    if (await exists(volumePath)) {
      debug("Unmounting previous disk image")
      await detach(volumePath)
    }

    await attachAndExecute(tempDmg, true, async () => {
      const promises = [
        specification.background == null ? remove(`${volumePath}/.background`) : unlink(`${volumePath}/.background/DSStorePlaceHolder`),
      ]

      let contents = specification.contents
      if (contents == null) {
        contents = [
          {
            "x": 130, "y": 220
          },
          {
            "x": 410, "y": 220, "type": "link", "path": "/Applications"
          }
        ]
      }

      const window = specification.window!
      const env = Object.assign({}, process.env, {
        volumePath: volumePath,
        appFileName: `${packager.appInfo.productFilename}.app`,
        iconSize: specification.iconSize || 80,
        iconTextSize: specification.iconTextSize || 12,

        windowX: window.x,
        windowY: window.y,

        VERSIONER_PERL_PREFER_32_BIT: "true",
      })

      if (specification.icon == null) {
        delete env.volumeIcon
      }
      else {
        const volumeIcon = `${volumePath}/.VolumeIcon.icns`
        promises.push(copy(path.resolve(packager.projectDir, specification.icon), volumeIcon))
        env.volumeIcon = volumeIcon
      }

      if (specification.backgroundColor != null || specification.background == null) {
        env.backgroundColor = specification.backgroundColor || "#ffffff"
        env.windowWidth = window.width || 540
        env.windowHeight = window.height || 380
      }
      else {
        delete env.backgroundColor

        if (window.width == null) {
          delete env.windowWidth
        }
        else {
          env.windowWidth = window.width
        }
        if (window.height == null) {
          delete env.windowHeight
        }
        else {
          env.windowHeight = window.height
        }

        env.backgroundFilename = backgroundFilename
      }

      let entries = ""
      for (const c of contents) {
        if (c.path != null && c.path.endsWith(".app") && c.type !== "link") {
          warn(`Do not specify path for application: "${c.path}". Actual path to app will be used instead.`)
        }

        let entryPath = c.path || `${packager.appInfo.productFilename}.app`
        if (entryPath.startsWith("/")) {
          entryPath = entryPath.substring(1)
        }

        const entryName = c.name || path.basename(entryPath)
        entries += `&makeEntries("${entryName}", Iloc_xy => [ ${c.x}, ${c.y} ]),\n`

        if (c.type === "link") {
          promises.push(exec("ln", ["-s", `/${entryPath}`, `${volumePath}/${entryName}`]))
        }
      }
      debug(entries)

      const dmgPropertiesFile = await packager.getTempFile("dmgProperties.pl")

      promises.push(outputFile(dmgPropertiesFile, (await readFile(path.join(this.helperDir, "dmgProperties.pl"), "utf-8")).replace("$ENTRIES", entries)))
      await BluebirdPromise.all<any>(promises)

      await exec("/usr/bin/perl", [dmgPropertiesFile], {
        cwd: path.join(__dirname, "..", "..", "vendor"),
        env: env
      })

      await exec("sync")

      if (packager.options.effectiveOptionComputed != null && await packager.options.effectiveOptionComputed([volumePath, specification])) {
        return
      }
    })

    const artifactPath = path.join(appOutDir, `${appInfo.productFilename}-${appInfo.version}.dmg`)
    //noinspection SpellCheckingInspection
    await spawn("hdiutil", addVerboseIfNeed(["convert", tempDmg, "-format", packager.config.compression === "store" ? "UDRO" : "UDBZ", "-imagekey", "zlib-level=9", "-o", artifactPath]))
    await exec("hdiutil", addVerboseIfNeed(["internet-enable", "-no"]).concat(artifactPath))

    this.packager.dispatchArtifactCreated(artifactPath, `${appInfo.name}-${appInfo.version}.dmg`)
  }

  computeVolumeName(custom?: string | null): string {
    const appInfo = this.packager.appInfo
    if (custom == null) {
      return `${appInfo.productFilename} ${appInfo.version}`
    }

    return custom
      .replace(/\$\{version}/g, appInfo.version)
      .replace(/\$\{name}/g, appInfo.name)
      .replace(/\$\{productName}/g, appInfo.productName)
  }

  // public to test
  async computeDmgOptions(): Promise<DmgOptions> {
    const packager = this.packager
    const specification: any = deepAssign({
      window: {
        x: 400,
        y: 100,
      },
    }, packager.config.dmg)

    // appdmg
    const oldPosition = specification.window.position
    if (oldPosition != null) {
      specification.window.x = oldPosition.x
      specification.window.y = oldPosition.y
    }

    const oldSize = specification.window.size
    if (oldSize != null) {
      specification.window.width = oldSize.width
      specification.window.height = oldSize.height
    }

    if (specification["icon-size"] != null) {
      if (specification.iconSize == null) {
        specification.iconSize = specification["icon-size"]
      }
      warn("dmg.icon-size is deprecated, please use dmg.iconSize instead")
    }

    if (!("icon" in specification)) {
      use(await packager.getIconPath(), it => {
        specification.icon = it
      })
    }

    if (specification.icon != null && isEmptyOrSpaces(specification.icon)) {
      throw new Error("dmg.icon cannot be specified as empty string")
    }

    if (specification["background-color"] != null) {
      if (specification.backgroundColor == null) {
        specification.backgroundColor = specification["background-color"]
      }
      warn("dmg.background-color is deprecated, please use dmg.backgroundColor instead")
    }

    if (specification.backgroundColor != null) {
      if (specification.background != null) {
        throw new Error("Both dmg.backgroundColor and dmg.background are specified — please set the only one")
      }

      specification.backgroundColor = require("parse-color")(specification.backgroundColor).hex
    }

    if (specification.backgroundColor == null && !("background" in specification)) {
      const resourceList = await packager.resourceList
      if (resourceList.includes("background.tiff")) {
        specification.background = path.join(packager.buildResourcesDir, "background.tiff")
      }
      else if (resourceList.includes("background.png")) {
        specification.background = path.join(packager.buildResourcesDir, "background.png")
      }
      else {
        specification.background = path.join(this.helperDir, "background.tiff")
      }
    }

    if (specification.format == null) {
      specification.format = packager.config.compression === "store" ? "UDRO" : "UDBZ"
    }

    return specification
  }
}

async function detach(name: string) {
  try {
    await exec("hdiutil", ["detach", name])
  }
  catch (e) {
    await new BluebirdPromise((resolve, reject) => {
      setTimeout(() => {
        exec("hdiutil", ["detach", "-force", name])
          .then(resolve)
          .catch(reject)
      }, 1000)
    })
  }
}

export async function attachAndExecute(dmgPath: string, readWrite: boolean, task: () => Promise<any>) {
  //noinspection SpellCheckingInspection
  const args = ["attach", "-noverify", "-noautoopen"]
  if (readWrite) {
    args.push("-readwrite")
  }

  // otherwise hangs
  // addVerboseIfNeed(args)

  args.push(dmgPath)
  const attachResult = await exec("hdiutil", args, {maxBuffer: 2 * 1024 * 1024})
  const deviceResult = attachResult == null ? null : /^(\/dev\/\w+)/.exec(attachResult)
  const device = deviceResult == null || deviceResult.length !== 2 ? null : deviceResult[1]
  if (device == null) {
    throw new Error(`Cannot mount: ${attachResult}`)
  }

  await executeFinally(task(), () => detach(device))
}

function addVerboseIfNeed(args: Array<string>): Array<string> {
  if (process.env.DEBUG_DMG === "true") {
    args.push("-verbose")
  }
  return args
}