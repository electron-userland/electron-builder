import { InvalidConfigurationError, isEmptyOrSpaces, log } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { readFile, readJson, readJsonSync } from "fs-extra"
import * as path from "path"
import * as semver from "semver"
import { Metadata } from "../options/metadata"
import { normalizePackageData } from "./normalizePackageData"

/** @internal */
export async function readPackageJson(file: string): Promise<any> {
  const data = await readJson(file)
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
    authorData = await readFile(path.resolve(path.dirname(file), "AUTHORS"), "utf8")
  } catch (_ignored) {
    return
  }

  data.contributors = authorData.split(/\r?\n/g).map(it => it.replace(/^\s*#.*$/, "").trim())
}

/** @internal */
export function checkMetadata(metadata: Metadata, devMetadata: any | null, appPackageFile: string, devAppPackageFile: string): void {
  const errors: Array<string> = []
  const reportError = (missedFieldName: string) => {
    errors.push(`Please specify '${missedFieldName}' in the package.json (${appPackageFile})`)
  }

  const checkNotEmpty = (name: string, value: string | Nullish) => {
    if (isEmptyOrSpaces(value)) {
      reportError(name)
    }
  }

  if ((metadata as any).directories != null) {
    errors.push(`"directories" in the root is deprecated, please specify in the "build"`)
  }

  checkNotEmpty("name", metadata.name)

  if (isEmptyOrSpaces(metadata.description)) {
    log.warn({ appPackageFile }, `description is missed in the package.json`)
  }
  if (metadata.author == null) {
    log.warn({ appPackageFile }, `author is missed in the package.json`)
  }
  checkNotEmpty("version", metadata.version)

  checkDependencies(metadata.dependencies, errors, path.dirname(appPackageFile))
  if (metadata !== devMetadata) {
    if (metadata.build != null) {
      errors.push(
        `'build' in the application package.json (${appPackageFile}) is not supported since 3.0 anymore. Please move 'build' into the development package.json (${devAppPackageFile})`
      )
    }
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

/** The version of the electron-updater installed for the app in `appDir` (or a parent directory), null if none can be resolved. */
function installedElectronUpdaterVersion(appDir: string): semver.SemVer | null {
  try {
    const packageJsonFile = require.resolve("electron-updater/package.json", { paths: [appDir] })
    return semver.parse(readJsonSync(packageJsonFile).version)
  } catch (_ignored) {
    // electron-updater is not installed (MODULE_NOT_FOUND), or the installed version's `exports` map
    // does not expose "./package.json" (ERR_PACKAGE_PATH_NOT_EXPORTED) — fall back to the declared specifier
    return null
  }
}

/**
 * Whether npm can resolve the declared `range` to an electron-updater 7 or later release or prerelease. Not `semver.intersects(range, ">=7.0.0-0")`:
 * that also matches ">=6.0.0 <7.0.0", which npm never resolves to a 7.0.0 prerelease, because a range matches a prerelease only when a comparator
 * of the same set names a prerelease of that version.
 */
function allowsElectronUpdater7(range: string): boolean {
  if (semver.validRange(range) == null) {
    return false
  }
  if (semver.intersects(range, ">=7.0.0")) {
    return true
  }
  return new semver.Range(range).set.some(comparators =>
    comparators.some(comparator => {
      const version = comparator.semver
      if (!(version instanceof semver.SemVer) || version.prerelease.length === 0 || version.major < 7) {
        return false
      }
      // the prereleases of this version that the set allows, e.g. 7.0.0-alpha.13 for "7.0.0-alpha.13" or 7.0.0-alpha.0 for ">=6 <7.0.0-alpha.1"
      const release = `${version.major}.${version.minor}.${version.patch}`
      const set = comparators.map(it => it.value).join(" ") || "*"
      return semver.intersects(set, `>=${release}-0 <${release}`, { includePrerelease: true })
    })
  )
}

function checkDependencies(dependencies: Record<string, string> | Nullish, errors: Array<string>, appDir: string) {
  if (dependencies == null) {
    return
  }

  let updaterVersion = dependencies["electron-updater"]
  if (updaterVersion != null) {
    // Pick the version out of yarn berry patch syntax
    // "patch:electron-updater@npm%3A6.4.1#~/.yarn/patches/electron-updater-npm-6.4.1-ef33e6cc39.patch"
    if (updaterVersion.startsWith("patch:")) {
      // codeql[js/polynomial-redos] - [^#]+ is a possessive character-class match; linear time, no catastrophic backtracking
      const match = updaterVersion.match(/@npm%3A([^#]+)#/)
      if (match) {
        updaterVersion = match[1]
      }
    }

    // for testing auto-update using workspace electron-updater
    const prefixes = ["link:", "file:"]
    for (const prefix of prefixes) {
      if (updaterVersion.startsWith(prefix)) {
        const normalized = path.normalize(updaterVersion.substring(prefix.length))
        const packageJsonPath = path.isAbsolute(normalized) ? normalized : path.resolve(__dirname, normalized)
        const json = readJsonSync(path.join(packageJsonPath, "package.json"))
        updaterVersion = json.version
        break
      }
    }

    const requiredElectronUpdaterVersion = "4.0.0"
    if (!versionSatisfies(updaterVersion, `>=${requiredElectronUpdaterVersion}`)) {
      errors.push(
        `At least electron-updater ${requiredElectronUpdaterVersion} is recommended by current electron-builder version. Please set electron-updater version to "^${requiredElectronUpdaterVersion}". Received "${updaterVersion}"`
      )
    } else {
      // electron-updater 7 rejects the app-update.yml electron-builder 26 writes (e.g. the Windows publisherName), so the installed app could never update.
      const updater7Error =
        "requires an app built with electron-builder 27: electron-updater 7 rejects the update configuration that electron-builder 26 writes " +
        "(on Windows, every update is rejected), so installed apps could never update."
      const docsLink = "See https://www.electron.build/docs/migration/v26-to-v27"
      const installed = installedElectronUpdaterVersion(appDir)
      if (installed != null) {
        if (installed.major >= 7) {
          errors.push(
            `electron-updater ${installed.version} (installed for "${updaterVersion}") ${updater7Error} Build with electron-builder 27, or keep electron-updater 6 (e.g. "^6.8.12"). ${docsLink}`
          )
        }
      } else if (allowsElectronUpdater7(updaterVersion)) {
        // Nothing is installed yet (this check runs before electron-builder installs the app's dependencies), so a declared range that allows 7
        // (">=6", "^6 || ^7", 7.0.0 prereleases) is rejected: the install that follows takes electron-updater 7 once it is npm `latest`.
        errors.push(
          `The declared electron-updater "${updaterVersion}" allows electron-updater 7, which ${updater7Error} Pin electron-updater to "^6" (e.g. "^6.8.12"), or build with electron-builder 27. ${docsLink}`
        )
      }
    }
  }

  const swVersion = dependencies["electron-builder-squirrel-windows"]
  if (swVersion != null && !versionSatisfies(swVersion, ">=20.32.0")) {
    errors.push(`At least electron-builder-squirrel-windows 20.32.0 is required by current electron-builder version. Please set electron-builder-squirrel-windows to "^20.32.0"`)
  }

  const deps = ["electron", "electron-prebuilt", "electron-rebuild"]
  if (process.env.ALLOW_ELECTRON_BUILDER_AS_PRODUCTION_DEPENDENCY !== "true") {
    deps.push("electron-builder")
  }
  for (const name of deps) {
    if (name in dependencies) {
      errors.push(`Package "${name}" is only allowed in "devDependencies". ` + `Please remove it from the "dependencies" section in your package.json.`)
    }
  }
}
