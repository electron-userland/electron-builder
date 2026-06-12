import { loadEnv } from "app-builder-lib/internal"
import { ExecError, InvalidConfigurationError, log } from "builder-util"
import { isCI } from "ci-info"

import * as path from "path"
import _fsExtra from "fs-extra"
const { readJson } = _fsExtra

export async function checkIsOutdated(): Promise<void> {
  if (isCI || process.env.NO_UPDATE_NOTIFIER != null) {
    return
  }
  const pkg = await readJson(path.join(import.meta.dirname, "..", "..", "package.json"))
  if (pkg.version === "0.0.0-semantic-release") {
    return
  }
  // simple-update-notifier is CJS with `export { fn as default }`; under nodenext a dynamic import
  // types `.default` as the namespace wrapper rather than the function, so assert the real shape.
  const { default: UpdateNotifier } = (await import("simple-update-notifier")) as unknown as {
    default: (args: { pkg: { name: string; version: string } }) => Promise<void>
  }
  await UpdateNotifier({ pkg })
}

export function wrap(task: (args: any) => Promise<any>) {
  return (args: any) => {
    checkIsOutdated().catch((e: any) => log.warn({ error: e }, "cannot check updates"))
    return loadEnv(path.join(process.cwd(), "electron-builder.env"))
      .then(() => task(args))
      .catch(error => {
        process.exitCode = 1
        // https://github.com/electron-userland/electron-builder/issues/2940
        process.on("exit", () => (process.exitCode = 1))
        if (error instanceof InvalidConfigurationError) {
          log.error(null, error.message)
        } else if (!(error instanceof ExecError) || !error.alreadyLogged) {
          log.error({ failedTask: task.name, stackTrace: error.stack }, error.message)
        }
      })
  }
}
