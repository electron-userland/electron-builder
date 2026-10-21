import { InvalidConfigurationError, log } from "builder-util"
import fsExtra from "fs-extra"
import * as path from "path"
import * as semver from "semver"
import { NodeModuleInfo } from "../node-module-collector/types.js"
import { BUILDER_UTIL_RUNTIME_VERSION, ELECTRON_UPDATER_VERSION, PACKAGE_VERSION } from "../version.js"

// electron-updater is a runtime dependency of the app while electron-builder is a dev dependency, so the two drift
// apart unless something ties them together: an app can ship an electron-updater that cannot read what this
// electron-builder writes (app-update.yml, signed latest*.yml), or the other way round, and every update then fails
// at run time on the user's machine. The pair is released together, so the build requires the same electron-updater
// major as the one this app-builder-lib was released with.

const ELECTRON_UPDATER = "electron-updater"
const BUILDER_UTIL_RUNTIME = "builder-util-runtime"

/** @internal */
export const ELECTRON_UPDATER_PAIRING_DOCS_URL = "https://www.electron.build/docs/migration/v27-breaking-changes#electron-updater-7-is-required"

/** @internal The electron-updater major the app must use: the major of the electron-updater released with this app-builder-lib. */
export const REQUIRED_ELECTRON_UPDATER_MAJOR = semver.major(ELECTRON_UPDATER_VERSION)
const BUILDER_MAJOR = semver.major(PACKAGE_VERSION)

/** A package found in a `node_modules` directory. */
export interface InstalledPackage {
  readonly version: string
  readonly packageJsonFile: string
}

/** A package.json of the project that may declare electron-updater. */
export interface ElectronUpdaterDeclarationSource {
  readonly packageFile: string
  /** The directory node_modules are resolved from for this package.json. */
  readonly dir: string
  readonly metadata: Record<string, any> | null | undefined
}

/**
 * Finds the installed `<name>/package.json` the way Node resolves a bare specifier from `fromDir`: `fromDir/node_modules`,
 * then the `node_modules` of each parent (hoisted and workspace installs). The package.json is read directly, so an
 * `exports` map without `./package.json` (electron-updater 7.0.0-alpha.4) or a `NODE_PATH` does not change the result.
 * @internal
 */
export function findInstalledPackage(name: string, fromDir: string): InstalledPackage | null {
  let dir = path.resolve(fromDir)
  for (;;) {
    if (path.basename(dir) !== "node_modules") {
      const packageJsonFile = path.join(dir, "node_modules", name, "package.json")
      const version = readVersion(packageJsonFile)
      if (version != null) {
        return { version, packageJsonFile }
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      return null
    }
    dir = parent
  }
}

function readVersion(packageJsonFile: string): string | null {
  try {
    const version = fsExtra.readJsonSync(packageJsonFile).version
    return typeof version === "string" ? version : null
  } catch (_ignored) {
    return null
  }
}

function isPairedVersion(version: string): boolean {
  // a prerelease counts as its major (7.0.0-alpha.10 is electron-updater 7)
  const parsed = semver.parse(version) ?? semver.coerce(version)
  return parsed != null && parsed.major === REQUIRED_ELECTRON_UPDATER_MAJOR
}

function upgradeAdvice(): string {
  return (
    `  Upgrade electron-updater to ^${REQUIRED_ELECTRON_UPDATER_MAJOR} ("electron-updater": "^${ELECTRON_UPDATER_VERSION}" is the version released with this electron-builder) and reinstall your dependencies.\n` +
    `  ${ELECTRON_UPDATER_PAIRING_DOCS_URL}`
  )
}

function pairingError(found: string, where: string): string {
  return (
    `electron-builder v${BUILDER_MAJOR} requires electron-updater ${REQUIRED_ELECTRON_UPDATER_MAJOR}, but found electron-updater ${found} (${where}).\n` +
    `  electron-updater ships inside your app while electron-builder only builds it, and electron-builder v${BUILDER_MAJOR} writes update files ` +
    `(app-update.yml, signed latest*.yml) that only electron-updater ${REQUIRED_ELECTRON_UPDATER_MAJOR} reads correctly: with another major, updates fail on your users' machines.\n` +
    upgradeAdvice()
  )
}

const warnedRuntimeMismatches = new Set<string>()

/**
 * Warns (once per resolved package) when the builder-util-runtime that the app's electron-updater loads is not the one this
 * electron-builder uses — the two share the update-info, publish-config and signature formats.
 */
function warnOnRuntimeMismatch(updaterVersion: string, updaterPackageJsonFile: string): void {
  let updaterDir = path.dirname(updaterPackageJsonFile)
  try {
    // pnpm links the package from its store, where its own dependencies sit next to it
    updaterDir = fsExtra.realpathSync(updaterDir)
  } catch (_ignored) {
    // keep the unresolved dir
  }
  const runtime = findInstalledPackage(BUILDER_UTIL_RUNTIME, updaterDir)
  if (runtime == null) {
    log.debug({ updaterDir: log.filePath(updaterDir) }, "cannot resolve the builder-util-runtime of electron-updater, skipping the version comparison")
    return
  }
  if (runtime.version === BUILDER_UTIL_RUNTIME_VERSION) {
    return
  }
  const key = `${runtime.packageJsonFile}@${runtime.version}`
  if (warnedRuntimeMismatches.has(key)) {
    return
  }
  warnedRuntimeMismatches.add(key)
  log.warn(
    {
      electronUpdater: updaterVersion,
      appBuilderUtilRuntime: runtime.version,
      electronBuilderUtilRuntime: BUILDER_UTIL_RUNTIME_VERSION,
      resolved: log.filePath(runtime.packageJsonFile),
    },
    `the electron-updater in your app uses builder-util-runtime ${runtime.version}, but electron-builder ${PACKAGE_VERSION} uses builder-util-runtime ${BUILDER_UTIL_RUNTIME_VERSION}. ` +
      `They share the update-info and signature formats, so keep them in sync: use electron-updater ${ELECTRON_UPDATER_VERSION}, the version released with this electron-builder`
  )
}

/** The version a declared specifier pins when the package is not installed, or `null` when it cannot be read from the specifier. */
function versionFromSpecifier(specifier: string, packageDir: string): { version: string; where: string } | null {
  let spec = specifier.trim()

  // yarn berry patch protocol: "patch:electron-updater@npm%3A6.4.1#~/.yarn/patches/electron-updater-npm-6.4.1-ef33e6cc39.patch"
  if (spec.startsWith("patch:")) {
    const marker = "@npm%3A"
    const start = spec.indexOf(marker)
    const end = spec.indexOf("#", start)
    if (start === -1 || end <= start + marker.length) {
      return null
    }
    spec = decodeURIComponent(spec.slice(start + marker.length, end))
  } else if (spec.startsWith("npm:")) {
    // npm alias: "npm:electron-updater@^7.0.0"
    spec = spec.slice(spec.lastIndexOf("@") + 1)
  }

  for (const prefix of ["link:", "file:"]) {
    if (spec.startsWith(prefix)) {
      const target = path.resolve(packageDir, spec.substring(prefix.length))
      const packageJsonFile = path.join(target, "package.json")
      const version = readVersion(packageJsonFile)
      return version == null ? null : { version, where: `read from ${packageJsonFile}` }
    }
  }

  const range = semver.validRange(spec)
  const minVersion = range == null ? null : semver.minVersion(range)
  return minVersion == null ? null : { version: spec, where: `declared, not installed — the lowest version the range allows is ${minVersion.version}` }
}

function lowestVersionIsPaired(version: string): boolean {
  if (semver.valid(version) != null) {
    return isPairedVersion(version)
  }
  const range = semver.validRange(version)
  const minVersion = range == null ? null : semver.minVersion(range)
  return minVersion != null && isPairedVersion(minVersion.version)
}

/**
 * Build-start check: when the project declares electron-updater (`dependencies` or `devDependencies` — bundled apps keep it as
 * a dev dependency), the installed electron-updater must be the major released with this electron-builder.
 * Errors are added to `errors`; nothing is checked when no package.json declares electron-updater.
 * @internal
 */
export function checkDeclaredElectronUpdater(sources: ReadonlyArray<ElectronUpdaterDeclarationSource>, errors: Array<string>): void {
  let declared: { source: ElectronUpdaterDeclarationSource; field: string; specifier: string } | null = null
  for (const source of sources) {
    for (const field of ["dependencies", "devDependencies"]) {
      const specifier = source.metadata?.[field]?.[ELECTRON_UPDATER]
      if (typeof specifier === "string") {
        declared = { source, field, specifier }
        break
      }
    }
    if (declared != null) {
      break
    }
  }
  if (declared == null) {
    return
  }

  const searchDirs = Array.from(new Set([declared.source.dir, ...sources.map(it => it.dir)]))
  let installed: InstalledPackage | null = null
  for (const dir of searchDirs) {
    installed = findInstalledPackage(ELECTRON_UPDATER, dir)
    if (installed != null) {
      break
    }
  }

  if (installed != null) {
    if (isPairedVersion(installed.version)) {
      warnOnRuntimeMismatch(installed.version, installed.packageJsonFile)
    } else {
      errors.push(pairingError(installed.version, `resolved from ${installed.packageJsonFile}`))
    }
    return
  }

  // Not installed (e.g. Yarn PnP, or a packaging job that skipped dev dependencies): check what the specifier pins instead.
  const fromSpecifier = versionFromSpecifier(declared.specifier, declared.source.dir)
  if (fromSpecifier == null) {
    errors.push(
      `electron-builder v${BUILDER_MAJOR} requires electron-updater ${REQUIRED_ELECTRON_UPDATER_MAJOR}, but electron-updater is declared as "${declared.specifier}" in the ${declared.field} of ${declared.source.packageFile} ` +
        `and is not installed (searched node_modules from ${searchDirs.join(", ")}), so its version cannot be verified.\n` +
        `  Install your dependencies before building.\n` +
        upgradeAdvice()
    )
    return
  }
  if (!lowestVersionIsPaired(fromSpecifier.version)) {
    errors.push(pairingError(fromSpecifier.version, `${fromSpecifier.where}, in the ${declared.field} of ${declared.source.packageFile}`))
  }
}

/**
 * Packaging-time check of the production node_modules that are about to be copied into the app: catches an electron-updater
 * that arrives only as a transitive dependency, which the build-start check cannot see.
 * @internal
 */
export function checkCollectedElectronUpdater(nodeModules: ReadonlyArray<NodeModuleInfo>): void {
  const visit = (modules: ReadonlyArray<NodeModuleInfo> | undefined) => {
    for (const module of modules ?? []) {
      if (module.name === ELECTRON_UPDATER && module.excluded !== true) {
        const packageJsonFile = path.join(module.dir, "package.json")
        // The copied package.json is what ships, so its version is the one checked. The collector's version is only a fallback:
        // pnpm reports a `link:`ed dependency by its specifier ("link:../electron-updater"), not by a version.
        const version = readVersion(packageJsonFile) ?? module.version
        if (!isPairedVersion(version)) {
          throw new InvalidConfigurationError(pairingError(version, `bundled from ${packageJsonFile}`))
        }
        warnOnRuntimeMismatch(version, packageJsonFile)
      }
      visit(module.dependencies)
    }
  }
  visit(nodeModules)
}
