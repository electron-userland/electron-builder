import BluebirdPromise from "bluebird-lst"
import { executeFinally } from "electron-builder-util/out/promise"
import { exec } from "electron-builder-util"

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

  return await executeFinally(task(), () => detach(device))
}

/** @internal */
export async function detach(name: string) {
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