import BluebirdPromise from "bluebird-lst"
import { orNullIfFileNotExist } from "electron-builder-util/out/promise"
import { lstat, readdir, readJson, realpath } from "fs-extra-p"
import * as path from "path"

/** @internal */
export interface Dependency {
  name: string
  path: string
  extraneous: boolean
  optional: boolean

  dependencies: { [name: string]: Dependency }
}

/** @internal */
export async function readInstalled(folder: string): Promise<Map<string, Dependency>> {
  const opts = {
    depth: Infinity,
    dev: false,
  }

  const findUnmetSeen = new Set<any>()
  const pathToDep = new Map<string, Dependency>()
  const obj = await _readInstalled(folder, null, null, 0, opts, pathToDep, findUnmetSeen)

  unmarkExtraneous(obj, opts.dev, true)
  return pathToDep
}

async function _readInstalled(folder: string, parent: any | null, name: string | null, depth: number, opts: any, realpathSeen: Map<string, Dependency>, findUnmetSeen: Set<any>): Promise<any> {
  const realDir = await realpath(folder)

  const processed = realpathSeen.get(realDir)
  if (processed != null) {
    return processed
  }

  const obj = await readJson(path.resolve(folder, "package.json"))
  obj.realPath = realDir
  obj.path = obj.path || folder
  //noinspection ES6MissingAwait
  if ((await lstat(folder)).isSymbolicLink()) {
    obj.link = realDir
  }

  obj.realName = name || obj.name
  obj.dependencyNames = obj.dependencies == null ? null : new Set(Object.keys(obj.dependencies))

  // Mark as extraneous at this point.
  // This will be un-marked in unmarkExtraneous, where we mark as not-extraneous everything that is required in some way from the root object.
  obj.extraneous = true
  obj.optional = true

  if (parent != null && obj.link == null) {
    obj.parent = parent
  }

  realpathSeen.set(realDir, obj)

  if (depth > opts.depth) {
    return obj
  }

  const deps = await BluebirdPromise.map(await readScopedDir(path.join(folder, "node_modules")), async pkg => orNullIfFileNotExist(_readInstalled(path.join(folder, "node_modules", pkg), obj, pkg, depth + 1, opts, realpathSeen, findUnmetSeen)), {concurrency: 8})
  if (obj.dependencies != null) {
    for (const dep of deps) {
      if (dep != null) {
        obj.dependencies[dep.realName] = dep
      }
    }

    // any strings in the obj.dependencies are unmet deps. However, if it's optional, then that's fine, so just delete it.
    if (obj.optionalDependencies != null) {
      for (const dep of Object.keys(obj.optionalDependencies)) {
        if (typeof obj.dependencies[dep] === "string") {
          delete obj.dependencies[dep]
        }
      }
    }
  }

  return obj
}

function unmark(deps: Iterable<string>, obj: any, dev: boolean, unsetOptional: boolean) {
  for (const name of deps) {
    const dep = findDep(obj, name)
    if (dep != null) {
      if (unsetOptional) {
        dep.optional = false
      }
      if (dep.extraneous) {
        unmarkExtraneous(dep, dev, false)
      }
    }
  }
}

function unmarkExtraneous(obj: any, dev: boolean, isRoot: boolean) {
  // Mark all non-required deps as extraneous.
  // start from the root object and mark as non-extraneous all modules
  // that haven't been previously flagged as extraneous then propagate to all their dependencies

  obj.extraneous = false

  if (obj.dependencyNames != null) {
    unmark(obj.dependencyNames, obj, dev, true)
  }

  if (dev && obj.devDependencies != null && (isRoot || obj.link)) {
    unmark(Object.keys(obj.devDependencies), obj, dev, true)
  }

  if (obj.peerDependencies != null) {
    unmark(Object.keys(obj.peerDependencies), obj, dev, true)
  }

  if (obj.optionalDependencies != null) {
    unmark(Object.keys(obj.optionalDependencies), obj, dev, false)
  }
}

// find the one that will actually be loaded by require() so we can make sure it's valid
function findDep(obj: any, name: string) {
  let r = obj
  let found = null
  while (r != null && found == null) {
    // if r is a valid choice, then use that.
    // kinda weird if a pkg depends on itself, but after the first iteration of this loop, it indicates a dep cycle.
    const dependency = r.dependencies == null ? null : r.dependencies[name]
    if (typeof dependency === "object") {
      found = dependency
    }
    if (found == null && r.realName === name) {
      found = r
    }
    r = r.link ? null : r.parent
  }
  return found
}

async function readScopedDir(dir: string) {
  let files: Array<string>
  try {
    files = (await readdir(dir)).filter(it => !it.startsWith("."))
  }
  catch (e) {
    // error indicates that nothing is installed here
    return []
  }

  files.sort()

  const scopes = files.filter(it => it.startsWith("@") && !it.startsWith("@types"))
  if (scopes.length === 0) {
    return files
  }

  const result = files.filter(it => !it.startsWith("@"))
  const scopeFileList = await BluebirdPromise.map(scopes, it => readdir(path.join(dir, it)))
  for (let i = 0; i < scopes.length; i++) {
    for (const file of scopeFileList[i]) {
      if (!file.startsWith(".")) {
        result.push(`${scopes[i]}/${file}`)
      }
    }
  }

  result.sort()
  return result
}

/** @internal */
export async function dependencies(dir: string, result: Set<string>): Promise<void> {
  const pathToDep = await readInstalled(dir)
  for (const dep of pathToDep.values()) {
    if (dep.extraneous) {
      result.add(dep.path)
    }
  }
}