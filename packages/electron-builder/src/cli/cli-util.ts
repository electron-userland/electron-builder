import { loadEnv } from "app-builder-lib/out/util/config/load"
import { ExecError, InvalidConfigurationError, log } from "builder-util"
import { isCI } from "ci-info"
import { readJson } from "fs-extra"
import * as path from "path"

export async function checkIsOutdated(): Promise<void> {
  if (isCI || process.env.NO_UPDATE_NOTIFIER != null) {
    return
  }
  const pkg = await readJson(path.join(__dirname, "..", "..", "package.json"))
  if (pkg.version === "0.0.0-semantic-release") {
    return
  }
  const UpdateNotifier = require("simple-update-notifier")
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
