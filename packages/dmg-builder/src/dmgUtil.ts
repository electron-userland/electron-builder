import { exec } from "builder-util"
import { PlatformPackager } from "app-builder-lib"
import { executeFinally } from "builder-util/out/promise"
import * as path from "path"

export { DmgTarget } from "./dmg"

const root = path.join(__dirname, "..")

export function getDmgTemplatePath() {
  return path.join(root, "templates")
}

export function getDmgVendorPath() {
  return path.join(root, "vendor")
}

export async function attachAndExecute(dmgPath: string, readWrite: boolean, task: () => Promise<any>) {
  //noinspection SpellCheckingInspection
  const args = ["attach", "-noverify", "-noautoopen"]
  if (readWrite) {
    args.push("-readwrite")
  }

  args.push(dmgPath)
  const attachResult = await exec("hdiutil", args)
  const deviceResult = attachResult == null ? null : /^(\/dev\/\w+)/.exec(attachResult)
  const device = deviceResult == null || deviceResult.length !== 2 ? null : deviceResult[1]
  if (device == null) {
    throw new Error(`Cannot mount: ${attachResult}`)
  }

  return await executeFinally(task(), () => detach(device))
}

export async function detach(name: string) {
  try {
    await exec("hdiutil", ["detach", "-quiet", name])
  }
  catch (e) {
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        exec("hdiutil", ["detach", "-force", name])
          .then(resolve)
          .catch(reject)
      }, 1000)
    })
  }
}

export async function computeBackground(packager: PlatformPackager<any>): Promise<string> {
  const resourceList = await packager.resourceList
  if (resourceList.includes("background.tiff")) {
    return path.join(packager.buildResourcesDir, "background.tiff")
  }
  else if (resourceList.includes("background.png")) {
    return path.join(packager.buildResourcesDir, "background.png")
  }
  else {
    return path.join(getDmgTemplatePath(), "background.tiff")
  }
}

/** @internal */
export function serializeString(data: string) {
  return '  $"' + data.match(/.{1,32}/g)!!.map(it => it.match(/.{1,4}/g)!!.join(" ")).join('"\n  $"') + '"'
}