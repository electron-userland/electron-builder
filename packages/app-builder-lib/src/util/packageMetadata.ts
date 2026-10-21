import { InvalidConfigurationError, isEmptyOrSpaces, log } from "builder-util"
import { Nullish } from "builder-util-runtime"
import fsExtra from "fs-extra"
import * as path from "path"
import * as semver from "semver"
import { Metadata } from "../options/metadata.js"
import { checkDeclaredElectronUpdater } from "./electronUpdaterPairing.js"
import { normalizePackageData } from "./normalizePackageData.js"

/** @internal */
export async function readPackageJson(file: string): Promise<any> {
  const data = await fsExtra.readJson(file)
  await authors(file, data)
  // remove not required fields because can be used for remote build
  delete data.scripts
  delete data.readme
  normalizePackageData(data)
  return data
}

async function authors(file: string, data: any) {
  if (data.contributors != null) {
    return
  }

  let authorData
  try {
    authorData = await fsExtra.readFile(path.resolve(path.dirname(file), "AUTHORS"), "utf8")
  } catch (_ignored) {
    return
  }

  data.contributors = authorData.split(/\r?\n/g).map(it => it.replace(/^\s*#.*$/, "").trim())
}

/** @internal */
export function checkMetadata(
  metadata: Metadata,
  devMetadata: any | null,
  appPackageFile: string,
  devAppPackageFile: string,
  projectDir: string,
  appDir: string = projectDir
): void {
  const errors: Array<string> = []
  const reportError = (missedFieldName: string) => {
    errors.push(`Please specify '${missedFieldName}' in the package.json (${appPackageFile})`)
  }

  const checkNotEmpty = (name: string, value: string | Nullish) => {
    if (isEmptyOrSpaces(value)) {
      reportError(name)
    }
  }

  checkNotEmpty("name", metadata.name)

  if (isEmptyOrSpaces(metadata.description)) {
    log.warn({ appPackageFile }, `description is missed in the package.json`)
  }
  if (metadata.author == null) {
    log.warn({ appPackageFile }, `author is missed in the package.json`)
  }
  checkNotEmpty("version", metadata.version)

  checkDependencies(metadata.dependencies, errors)
  checkDeclaredElectronUpdater(
    [
      { packageFile: appPackageFile, dir: appDir, metadata },
      ...(devMetadata != null && devMetadata !== metadata ? [{ packageFile: devAppPackageFile, dir: projectDir, metadata: devMetadata }] : []),
    ],
    errors
  )
  if (metadata !== devMetadata) {
    if (metadata.build != null) {
      errors.push(
        `'build' in the application package.json (${appPackageFile}) is not supported since 3.0 anymore. Please move 'build' into the development package.json (${devAppPackageFile})`
      )
    }
  }

  // Root-level `directories` was read by v26 and is ignored by v27. It lives outside the validated
  // Configuration object, so nothing else catches it: the build silently writes to the default `dist`
  // instead of the configured output directory, and a release pipeline copies from an empty path.
  const rootDirectories = (devMetadata ?? metadata)?.directories
  if (rootDirectories != null) {
    errors.push(
      `'directories' at the root of the package.json (${devAppPackageFile}) is no longer read by electron-builder v27 — move it under the 'build' key:\n` +
        `  { "build": { "directories": ${JSON.stringify(rootDirectories)} } }\n` +
        "  Left where it is, it is ignored and your build output goes to the default 'dist' directory.\n" +
        "  Run `electron-builder migrate-schema` to move it automatically.\n" +
        "  https://www.electron.build/docs/migration/v27-breaking-changes#root-level-directories-in-packagejson"
    )
  }

  const devDependencies = (metadata as any).devDependencies
  if (devDependencies != null && ("electron-rebuild" in devDependencies || "@electron/rebuild" in devDependencies)) {
    log.info(
      '@electron/rebuild already used by electron-builder, please consider to remove excess dependency from devDependencies\n\nTo ensure your native dependencies are always matched electron version, simply add script `"postinstall": "electron-builder install-app-deps" to your `package.json`'
    )
  }

  if (errors.length > 0) {
    throw new InvalidConfigurationError(errors.join("\n"))
  }
}

function versionSatisfies(version: string | semver.SemVer | null, range: string | semver.Range, loose?: boolean): boolean {
  if (version == null) {
    return false
  }

  const coerced = semver.coerce(version)
  if (coerced == null) {
    return false
  }

  return semver.satisfies(coerced, range, loose)
}

function checkDependencies(dependencies: Record<string, string> | Nullish, errors: Array<string>) {
  if (dependencies == null) {
    return
  }

  const swVersion = dependencies["electron-builder-squirrel-windows"]
  if (swVersion != null && !versionSatisfies(swVersion, ">=20.32.0")) {
    errors.push(`At least electron-builder-squirrel-windows 20.32.0 is required by current electron-builder version. Please set electron-builder-squirrel-windows to "^20.32.0"`)
  }
}
