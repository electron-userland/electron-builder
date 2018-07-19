import BluebirdPromise from "bluebird-lst"
import { isEnvTrue, log } from "builder-util"
import { CONCURRENCY, statOrNull } from "builder-util/out/fs"
import { orNullIfFileNotExist } from "builder-util/out/promise"
import { lstat, readdir, readFile, realpath, Stats } from "fs-extra-p"
import { Lazy } from "lazy-val"
import * as path from "path"

export interface Dependency {
  name: string
  version: string
  path: string
  extraneous: boolean
  optional: boolean

  dependencies: Map<string, Dependency> | null
  directDependencyNames: Array<string> | null
  peerDependencies: { [key: string]: any } | null
  optionalDependencies: { [key: string]: any } | null

  realName: string
  link?: string

  parent?: Dependency

  // only if link
  stat?: Stats
}

// noinspection SpellCheckingInspection
const knownAlwaysIgnoredDevDeps = new Set([
  "electron-builder-tslint-config", "electron-download", "libui-download",
  "electron-forge", "electron-packager", "electron-compilers",
  "prebuild-install", "nan",
  "electron-webpack", "electron-webpack-ts", "electron-webpack-vue",
  "@types",
])

// noinspection JSUnusedGlobalSymbols
export function createLazyProductionDeps(projectDir: string) {
  return new Lazy(() => getProductionDependencies(projectDir))
}

/** @internal */
export async function getProductionDependencies(folder: string): Promise<Array<Dependency>> {
  const result: Array<Dependency> = []
  computeSortedPaths(await new Collector().collect(folder), result, false)
  return result
}

const ignoredProperties = new Set(["description", "author", "bugs", "engines", "repository", "build", "main", "license", "homepage", "scripts", "maintainers", "contributors", "keywords", "devDependencies", "files", "typings", "types", "xo", "resolutions"])

function readJson(file: string) {
  return readFile(file, "utf-8")
    .then(it => JSON.parse(it, (key, value) => ignoredProperties.has(key) ? undefined : value))
}

function computeSortedPaths(parent: Dependency, result: Array<Dependency>, isExtraneous: boolean) {
  const dependencies = parent.dependencies
  if (dependencies == null) {
    return
  }

  for (const dep of dependencies.values()) {
    if (dep.extraneous === isExtraneous) {
      result.push(dep)
      computeSortedPaths(dep, result, isExtraneous)
    }
  }
}

class Collector {
  readonly pathToMetadata = new Map<string, Dependency>()
  private unresolved = new Map<string, boolean>()

  async collect(dir: string) {
    const rootDependency: Dependency = await readJson(path.join(dir, "package.json"))
    await this.readInstalled(path.join(dir, "node_modules"), rootDependency, rootDependency.name)
    this.unmarkExtraneous(rootDependency)

    if (this.unresolved.size > 0) {
      log.debug({unresolved: Array.from(this.unresolved.keys()).join(", ")}, "unresolved dependencies after first round")
      await this.resolveUnresolvedHoisted(rootDependency, dir)
    }
    return rootDependency
  }

  private async resolveUnresolvedHoisted(rootDependency: Dependency, dir: string): Promise<void> {
    let nameToMetadata = rootDependency.dependencies
    if (nameToMetadata == null) {
      rootDependency.dependencies = new Map<string, Dependency>()
      nameToMetadata = rootDependency.dependencies
    }

    let parentDir = dir
    do {
      parentDir = path.dirname(parentDir)
      if (parentDir === "" || parentDir.endsWith("/") || parentDir.endsWith("\\")) {
        // https://github.com/electron-userland/electron-builder/issues/2220
        const list = Array.from(this.unresolved.keys()).filter(it => !this.unresolved.get(it))
        if (list.length === 1 && list[0] === "proton-native") {
          // resolve in tests
          parentDir = process.cwd()
        }
        else {
          if (list.length !== 0) {
            const message = `Unresolved node modules: ${list.join(", ")}`
            if (isEnvTrue(process.env.ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES)) {
              log.warn(message)
            }
            else {
              throw new Error(message)
            }
          }
          break
        }
      }

      const parentNodeModulesDir = parentDir + path.sep + "node_modules"
      const dirStat = await statOrNull(parentNodeModulesDir)
      if (dirStat == null || !dirStat.isDirectory()) {
        if (dirStat == null || !dirStat.isDirectory()) {
          continue
        }
      }

      // https://github.com/electron-userland/electron-builder/issues/2222#issuecomment-339060335
      // step 1: resolve current unresolved
      // step n: try to resolve new unresolved in the same parent dir until at least something is resolved in the dir
      while (true) {
        const unresolved = Array.from(this.unresolved.keys())
        this.unresolved.clear()

        const resolved = await BluebirdPromise.map(unresolved, it => {
          return this.readChildPackage(it, parentNodeModulesDir, rootDependency)
            .catch(e => {
              if ((e as any).code === "ENOENT") {
                return null
              }
              else {
                throw e
              }
            })
        }, CONCURRENCY)

        let hasResolved = false

        for (const dep of resolved) {
          if (dep != null) {
            hasResolved = true
            this.unmarkExtraneous(dep)
            nameToMetadata.set(dep.realName, dep)
          }
        }

        if (!hasResolved) {
          break
        }

        this.unmarkExtraneous(rootDependency)

        if (this.unresolved.size === 0) {
          return
        }
      }
    }
    while (this.unresolved.size > 0)
  }

  private async readInstalled(nodeModulesDir: string, dependency: Dependency, name: string): Promise<void> {
    dependency.realName = name
    dependency.directDependencyNames = dependency.dependencies == null ? null : Object.keys(dependency.dependencies)

    // mark as extraneous at this point.
    // this will be un-marked in unmarkExtraneous, where we mark as not-extraneous everything that is required in some way from the root object.
    dependency.extraneous = true
    dependency.optional = true

    if (dependency.dependencies == null && dependency.optionalDependencies == null) {
      // package has only dev or peer dependencies - no need to check child node_module
      dependency.dependencies = null
      return
    }

    const childModules = await readNodeModulesDir(nodeModulesDir)
    if (childModules == null) {
      dependency.dependencies = null
      return
    }

    const deps = await BluebirdPromise.map(childModules, it => this.readChildPackage(it, nodeModulesDir, dependency), CONCURRENCY)
    if (deps.length === 0) {
      dependency.dependencies = null
      return
    }

    const nameToMetadata = new Map<string, Dependency>()
    for (const dep of deps) {
      if (dep != null) {
        nameToMetadata.set(dep.realName, dep)
      }
    }
    dependency.dependencies = nameToMetadata
  }

  private async readChildPackage(name: string, nodeModulesDir: string, parent: Dependency): Promise<Dependency | null> {
    const rawDir = path.join(nodeModulesDir, name)
    let dir: string | null = rawDir
    const stat = await lstat(dir)
    const isSymbolicLink = stat.isSymbolicLink()
    if (isSymbolicLink) {
      dir = await orNullIfFileNotExist(realpath(dir))
      if (dir == null) {
        log.debug({path: rawDir}, "broken symlink")
        return null
      }
    }

    const processed = this.pathToMetadata.get(dir)
    if (processed != null) {
      return processed
    }

    const metadata: Dependency = await orNullIfFileNotExist(readJson(path.join(dir, "package.json")))
    if (metadata == null) {
      return null
    }

    if (isSymbolicLink) {
      metadata.link = dir
      metadata.stat = stat
    }
    else {
      metadata.parent = parent

      // overwrite if already set by project package.json
      metadata.link = undefined
    }

    metadata.path = rawDir

    // do not add root project to result
    this.pathToMetadata.set(dir, metadata)

    await this.readInstalled(dir + path.sep + "node_modules", metadata, name)
    return metadata
  }

  private unmark(deps: Iterable<string>, obj: Dependency, unsetOptional: boolean, isOptional: boolean) {
    for (const name of deps) {
      const dep = this.findDep(obj, name, isOptional)
      if (dep != null) {
        if (unsetOptional) {
          dep.optional = false
        }
        if (dep.extraneous) {
          this.unmarkExtraneous(dep)
        }
      }
    }
  }

  private unmarkExtraneous(obj: Dependency) {
    // Mark all non-required deps as extraneous.
    // start from the root object and mark as non-extraneous all modules
    // that haven't been previously flagged as extraneous then propagate to all their dependencies

    obj.extraneous = false

    if (obj.directDependencyNames != null) {
      this.unmark(obj.directDependencyNames, obj, true, false)
    }

    if (obj.peerDependencies != null) {
      this.unmark(Object.keys(obj.peerDependencies), obj, true, false)
    }

    if (obj.optionalDependencies != null) {
      this.unmark(Object.keys(obj.optionalDependencies), obj, false, true)
    }
  }

  // find the one that will actually be loaded by require() so we can make sure it's valid
  private findDep(obj: Dependency, name: string, isOptional: boolean) {
    if (isIgnoredDep(name)) {
      return null
    }

    let r: Dependency | null | undefined = obj
    let found = null
    while (r != null && found == null) {
      // if r is a valid choice, then use that.
      // kinda weird if a pkg depends on itself, but after the first iteration of this loop, it indicates a dep cycle.
      found = r.dependencies == null ? null : r.dependencies.get(name)
      if (found == null && r.realName === name) {
        found = r
      }
      r = r.link == null ? r.parent : null
    }

    if (found == null) {
      this.unresolved.set(name, isOptional)
    }
    return found
  }
}

function isIgnoredDep(name: string) {
  return knownAlwaysIgnoredDevDeps.has(name) || name.startsWith("@types/")
}

async function readNodeModulesDir(dir: string): Promise<Array<string> | null> {
  let files: Array<string>
  try {
    files = (await readdir(dir)).filter(it => !it.startsWith(".") && !knownAlwaysIgnoredDevDeps.has(it))
  }
  catch (e) {
    // error indicates that nothing is installed here
    return null
  }

  files.sort()

  const scopes = files.filter(it => it.startsWith("@"))
  if (scopes.length === 0) {
    return files
  }

  const result = files.filter(it => !it.startsWith("@"))
  const scopeFileList = await BluebirdPromise.map(scopes, it => readdir(path.join(dir, it)))
  for (let i = 0; i < scopes.length; i++) {
    const list = scopeFileList[i]
    list.sort()
    for (const file of list) {
      if (!file.startsWith(".")) {
        result.push(`${scopes[i]}/${file}`)
      }
    }
  }

  return result
}
