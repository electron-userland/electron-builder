import { AppInfo, Packager } from "app-builder-lib"
import { expandMacro, VERIFICATION_FAILED_ERROR_CODE, verifyBuildOutput, VerificationResult } from "app-builder-lib/internal"
import { Executables, InvalidConfigurationError, log } from "builder-util"
import { stat } from "fs/promises"
import * as path from "path"
import type { Argv } from "yargs"
import { normalizeOptions } from "../builder.js"

export interface VerifyCliOptions {
  /** The output directory to verify; defaults to `directories.output` of the project configuration. */
  readonly dir?: string
  readonly projectDir?: string
  /** A configuration file path, or `-c.<key>=<value>` overrides, as for `electron-builder build`. */
  readonly config?: any
  /** Report the checks that cannot run on this host as warnings instead of failing. */
  readonly "allow-unverified"?: boolean
}

/** @internal */
export function configureVerifyCommand(yargs: Argv): Argv {
  return yargs
    .positional("dir", {
      type: "string",
      description: "The build output directory to verify. Defaults to directories.output of the project configuration.",
    })
    .option("projectDir", {
      alias: ["project"],
      type: "string",
      description: "The path to project directory. Defaults to current working directory.",
    })
    .option("config", {
      alias: ["c"],
      description: "The path to the electron-builder config the build used (or -c.<key>=<value> overrides). Defaults to the project configuration.",
    })
    .option("allow-unverified", {
      type: "boolean",
      description: "Only warn about checks that cannot run on this host (e.g. macOS signatures on Linux) instead of failing",
    })
}

/**
 * `electron-builder verify [dir]`: verifies the code signatures, notarization and update-manifest signatures of built
 * artifacts (see verifyBuildOutput), honoring the opt-outs of the project configuration. Fails - exit code 1 - when a
 * check fails, or cannot run on this host and `--allow-unverified` is not passed.
 * @internal
 */
export async function verify(args: VerifyCliOptions): Promise<Array<VerificationResult>> {
  const options = normalizeOptions({ projectDir: args.projectDir, config: args.config })
  const packager = new Packager(options)
  await packager.validateConfig()
  const config = packager.config

  let outDir: string
  if (args.dir != null) {
    outDir = path.resolve(args.dir)
  } else {
    // the loaded configuration has the default ("dist") unless the project sets another
    const output = config.directories?.output
    if (output == null) {
      throw new InvalidConfigurationError("directories.output is not set, so pass the output directory to verify: electron-builder verify <dir>")
    }
    // each platform and arch of the build has its own output directory then
    if (/\$\{(os|arch|platform)\}/.test(output)) {
      throw new InvalidConfigurationError(`directories.output (${output}) depends on the platform or arch, so pass the output directory to verify: electron-builder verify <dir>`)
    }
    outDir = path.resolve(packager.projectDir, expandMacro(output, null, new AppInfo(packager, null), { os: "" }))
  }
  if (!(await stat(outDir).catch(() => null))?.isDirectory()) {
    throw new InvalidConfigurationError(`the output directory ${outDir} does not exist: build first, or pass the directory to verify`)
  }

  // codesign, stapler, pkgutil and PowerShell come from the toolsets.executables of the project configuration, as in the build
  const results = await Executables.run(config.toolsets?.executables, () => verifyBuildOutput({ outDir, config }))
  const allowUnverified = args["allow-unverified"] === true
  for (const { status, check, file, message } of results) {
    const fields = { check, file: log.filePath(file) }
    if (status === "verified") {
      log.info({ ...fields, result: message }, "verified")
    } else if (status === "skipped") {
      log.warn({ ...fields, reason: message }, "skipped")
    } else if (status === "unverifiable" && allowUnverified) {
      log.warn({ ...fields, reason: message }, "cannot be verified")
    } else if (status === "unverifiable") {
      log.error({ ...fields, reason: message }, "cannot be verified")
    } else {
      log.error({ ...fields, reason: message }, "verification failed")
    }
  }

  if (results.length === 0) {
    throw new InvalidConfigurationError(`nothing to verify in ${outDir}: no packaged app, update manifest or signed artifact was found`, VERIFICATION_FAILED_ERROR_CODE)
  }
  const count = (status: VerificationResult["status"]) => results.filter(it => it.status === status).length
  const failed = count("failed")
  const unverifiable = count("unverifiable")
  const summary = `${count("verified")} verified, ${failed} failed, ${unverifiable} cannot be verified here, ${count("skipped")} skipped`
  if (failed > 0 || (unverifiable > 0 && !allowUnverified)) {
    throw new InvalidConfigurationError(
      `electron-builder verify found problems in ${outDir} (${summary})` +
        (unverifiable > 0 && !allowUnverified ? `. Pass --allow-unverified to only warn about the checks that cannot run on this host` : ""),
      VERIFICATION_FAILED_ERROR_CODE
    )
  }
  log.info({ outDir: log.filePath(outDir), summary }, "build output verified")
  return results
}
