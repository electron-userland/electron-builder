// 'use strict'

// import common from './common'
import galactus from 'galactus'
import fs from 'fs-extra'
import path from 'path'
import { log } from 'builder-util/src/log'

const ELECTRON_MODULES = [
  'electron',
  'electron-prebuilt',
  'electron-prebuilt-compile'
]

class Pruner {
  baseDir: string
  quiet: boolean
  galactus: galactus.DestroyerOfModules
  walkedTree = false
  modules = new Set<string>()

  constructor (dir: any, quiet: boolean) {
    this.baseDir = path.normalize(dir)
    this.quiet = quiet
    this.galactus = new galactus.DestroyerOfModules({
      rootDirectory: dir,
      shouldKeepModuleTest: (module: any, isDevDep: boolean) => this.shouldKeepModule(module, isDevDep)
    })
  }

  setModules (moduleMap: galactus.ModuleMap) {
    const modulePaths = Array.from(moduleMap.keys()).map((modulePath: string) => `/${path.normalize(modulePath)}`)
    this.modules = new Set(modulePaths)
    this.walkedTree = true
  }

  async pruneModule (name: string) {
    if (this.walkedTree) {
      return this.isProductionModule(name)
    } else {
      const moduleMap = await this.galactus.collectKeptModules({ relativePaths: true })
      this.setModules(moduleMap)
      return this.isProductionModule(name)
    }
  }

  shouldKeepModule (module: { depType: galactus.DepType; name: string }, isDevDep: any) {
    if (isDevDep || module.depType === galactus.DepType.ROOT) {
      return false
    }

    if (ELECTRON_MODULES.includes(module.name)) {
      log.warn(`Found '${module.name}' but not as a devDependency, pruning anyway`)
      return false
    }

    return true
  }

  isProductionModule (name: string) {
    return this.modules.has(name)
  }
}

function isNodeModuleFolder (pathToCheck: string) {
  return path.basename(path.dirname(pathToCheck)) === 'node_modules' ||
    (path.basename(path.dirname(pathToCheck)).startsWith('@') && path.basename(path.resolve(pathToCheck, `..${path.sep}..`)) === 'node_modules')
}

module.exports = {
  isModule: async function isModule (pathToCheck: string) {
    return (await fs.pathExists(path.join(pathToCheck, 'package.json'))) && isNodeModuleFolder(pathToCheck)
  },
  Pruner: Pruner
}