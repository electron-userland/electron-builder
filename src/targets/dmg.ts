import { deepAssign } from "../util/deepAssign"
import * as path from "path"
import { log } from "../util/log"
import { Target, PlatformPackager } from "../platformPackager"
import { MacOptions, DmgOptions } from "../metadata"
import { Promise as BluebirdPromise } from "bluebird"
import { debug, use } from "../util/util"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("../util/awaiter")

export class DmgTarget extends Target {
  private readonly options: DmgOptions

  constructor(private packager: PlatformPackager<MacOptions>) {
    super("dmg")

    this.options = deepAssign({
      title: packager.appInfo.productName,
      "icon-size": 80,
      contents: [
        {
          "x": 410, "y": 220, "type": "link", "path": "/Applications"
        },
        {
          "x": 130, "y": 220, "type": "file"
        }
      ],
      format: packager.devMetadata.build.compression === "store" ? "UDRO" : "UDBZ",
    }, Object.assign({}, this.packager.devMetadata.build.osx, this.packager.devMetadata.build.dmg))
  }

  async build(appOutDir: string) {
    const appInfo = this.packager.appInfo
    const artifactPath = path.join(appOutDir, `${appInfo.productFilename}-${appInfo.version}.dmg`)
    log("Creating DMG")
    const dmgOptions = {
      target: artifactPath,
      basepath: this.packager.projectDir,
      specification: await this.computeDmgOptions(appOutDir),
    }
    if (debug.enabled) {
      debug(`appdmg: ${JSON.stringify(dmgOptions, <any>null, 2)}`)
    }

    const emitter = require("appdmg")(dmgOptions)
    await new BluebirdPromise((resolve, reject) => {
      emitter.on("error", reject)
      emitter.on("finish", resolve)
      if (debug.enabled) {
        emitter.on("progress", (info: any) => {
          if (info.type === "step-begin") {
            debug(`appdmg: [${info.current}] ${info.title}`)
          }
        })
      }
    })

    this.packager.dispatchArtifactCreated(artifactPath, `${appInfo.name}-${appInfo.version}.dmg`)
  }

  // public to test
  async computeDmgOptions(appOutDir: string): Promise<appdmg.Specification> {
    const packager = this.packager
    const specification: any = this.options
    if (!("icon" in specification)) {
      use(await packager.getIconPath(), it => {
        specification.icon = it
      })
    }

    if (!("background" in specification)) {
      const resourceList = await packager.resourceList
      if (resourceList.includes("background.png")) {
        specification.background = path.join(packager.buildResourcesDir, "background.png")
      }
    }

    specification.contents[1].path = path.join(appOutDir, `${packager.appInfo.productFilename}.app`)
    return specification
  }
}