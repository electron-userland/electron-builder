import { exists, log, retry, TmpDir } from "builder-util"
import * as childProcess from "child_process"
import { CancellationToken } from "builder-util-runtime"
import * as fs from "fs-extra"
import { createWriteStream, readJson } from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { hoist, type HoisterResult, type HoisterTree } from "./hoist"
import { getPackageManagerCommand, PM } from "./packageManager"
import type { Dependency, DependencyGraph, NodeModuleInfo, PackageJson } from "./types"
import { fileURLToPath, pathToFileURL } from "node:url"
import * as semver from "semver"
import { ModuleCache } from "./moduleCache"
type Result = { packageDir: string; version: string } | null

export abstract class NodeModulesCollector<ProdDepType extends Dependency<ProdDepType, OptionalDepType>, OptionalDepType> {
  private nodeModules: NodeModuleInfo[] = []
  protected allDependencies: Map<string, ProdDepType> = new Map()
  protected productionGraph: DependencyGraph = {}
  protected readonly cache: ModuleCache = new ModuleCache()

  // protected pkgJsonCache: Map<string, string> = new Map()
  // protected memoResolvedModules = new Map<string, Promise<string | null>>()

  private importMetaResolve = new Lazy(async () => {
    try {
      // Node >= 16 builtin ESM-aware resolver
      const packageName = "import-meta-resolve"
      const imported = await import(packageName)
      return imported.resolve
    } catch {
      return null
    }
  })

  // Unified cache for all file system and module operations

  protected isHoisted = new Lazy<boolean>(async () => {
    const { manager } = this.installOptions
    const command = getPackageManagerCommand(manager)

    const config = (await this.asyncExec(command, ["config", "list"])).stdout
    if (config == null) {
      log.debug({ manager }, "unable to determine if node_modules are hoisted: no config output. falling back to hoisted mode")
      return false
    }
    const lines = Object.fromEntries(config.split("\n").map(line => line.split("=").map(s => s.trim())))

    if (lines["node-linker"] === "hoisted") {
      log.debug({ manager }, "node_modules are hoisted")
      return true
    }

    return false
  })

  protected appPkgJson: Lazy<PackageJson> = new Lazy<PackageJson>(async () => {
    return this.cache.packageJson[path.join(this.rootDir, "package.json")]
  })

  constructor(
    protected readonly rootDir: string,
    private readonly tempDirManager: TmpDir
  ) {}

  public async getNodeModules({ cancellationToken, packageName }: { cancellationToken: CancellationToken; packageName: string }): Promise<NodeModuleInfo[]> {
    const tree: ProdDepType = await this.getDependenciesTree(this.installOptions.manager)

    if (cancellationToken.cancelled) {
      throw new Error("getNodeModules cancelled after fetching dependency tree")
    }

    await this.collectAllDependencies(tree, packageName)

    const realTree: ProdDepType = await this.getTreeFromWorkspaces(tree, packageName)
    await this.extractProductionDependencyGraph(realTree, packageName)

    if (cancellationToken.cancelled) {
      throw new Error("getNodeModules cancelled after building production graph")
    }

    const hoisterResult: HoisterResult = hoist(this.transformToHoisterTree(this.productionGraph, packageName), {
      check: log.isDebugEnabled,
    })

    await this._getNodeModules(hoisterResult.dependencies, this.nodeModules)
    log.debug({ packageName, depCount: this.nodeModules.length }, "node modules collection complete")

    return this.nodeModules
  }

  public abstract readonly installOptions: {
    manager: PM
    lockfile: string
  }

  protected abstract getArgs(): string[]
  protected abstract parseDependenciesTree(jsonBlob: string): Promise<ProdDepType>
  protected abstract extractProductionDependencyGraph(tree: Dependency<ProdDepType, OptionalDepType>, dependencyId: string): Promise<void>
  protected abstract collectAllDependencies(tree: Dependency<ProdDepType, OptionalDepType>, appPackageName: string): Promise<void>

  protected async getDependenciesTree(pm: PM): Promise<ProdDepType> {
    const command = getPackageManagerCommand(pm)
    const args = this.getArgs()

    const tempOutputFile = await this.tempDirManager.getTempFile({
      prefix: path.basename(command, path.extname(command)),
      suffix: "output.json",
    })

    return retry(
      async () => {
        await this.streamCollectorCommandToFile(command, args, this.rootDir, tempOutputFile)
        const shellOutput = await fs.readFile(tempOutputFile, { encoding: "utf8" })
        return await this.parseDependenciesTree(shellOutput)
      },
      {
        retries: 1,
        interval: 2000,
        backoff: 2000,
        shouldRetry: async (error: any) => {
          const logFields = { error: error.message, tempOutputFile, cwd: this.rootDir }

          if (!(await this.cache.exists[tempOutputFile])) {
            log.debug(logFields, "dependency tree output file missing, retrying")
            return true
          }

          const fileContent = await fs.readFile(tempOutputFile, { encoding: "utf8" })
          const fields = { ...logFields, fileContent }

          if (fileContent.trim().length === 0) {
            log.debug(fields, "dependency tree output file empty, retrying")
            return true
          }

          if (error.message?.includes("Unexpected end of JSON input")) {
            log.debug(fields, "JSON parse error in dependency tree, retrying")
            return true
          }

          log.error(fields, "error parsing dependencies tree")
          return false
        },
      }
    )
  }

  // /**
  //  * Resolves a package to its filesystem location using Node.js module resolution.
  //  * Returns the directory containing the package, not the package.json path.
  //  */
  // protected async resolvePackageDir(options: { packageName: string; fromDir: string; packageVersion: string }): Promise<{ entry: string; packageDir: string } | null> {
  //   const { packageName, fromDir, packageVersion } = options
  //   const cacheKey = `${packageName}::${packageVersion}::${fromDir}`
  //   if (this.cache.requireResolve.has(cacheKey)) {
  //     return this.cache.requireResolve.get(cacheKey)!
  //   }

  //   const resolveEntry = async () => {
  //     // 1) Try Node ESM resolver (handles exports reliably)
  //     if (await this.importMetaResolve.value) {
  //       try {
  //         const url = (await this.importMetaResolve.value)(packageName, pathToFileURL(fromDir).href)
  //         const result = url.startsWith("file://") ? fileURLToPath(url) : null
  //         return result
  //       } catch (error: any) {
  //         log.debug({ error: error.message }, "import-meta-resolve faile, attempting require.resolved")
  //         // ignore
  //       }
  //     }

  //     // 2) Fallback: require.resolve (CJS, old packages)
  //     try {
  //       const result = require.resolve(packageName, { paths: [fromDir, this.rootDir] })
  //       return result
  //     } catch (error: any) {
  //       log.debug({ error: error.message }, "require.resolve failed")
  //       // ignore
  //     }

  //     return null
  //   }

  //   const entry = await resolveEntry()
  //   if (!entry) {
  //     this.cache.requireResolve.set(cacheKey, null)
  //     return null
  //   }

  //   // 3) Walk upward until you find a package.json
  //   let dir = path.dirname(entry)
  //   while (true) {
  //     const pkgFile = path.join(dir, "package.json")
  //     if (await this.cache.memoize("exists", pkgFile)) {
  //       this.cache.requireResolve.set(cacheKey, { entry, packageDir: dir })
  //       return { entry, packageDir: dir }
  //     }

  //     const parent = path.dirname(dir)
  //     if (parent === dir) {
  //       break // root reached
  //     }
  //     dir = parent
  //   }

  //   this.cache.requireResolve.set(cacheKey, null)
  //   return null
  // }

  protected cacheKey(pkg: ProdDepType): string {
    const rel = path.relative(this.rootDir, pkg.path)
    return `${pkg.name}::${pkg.version}::${rel ?? "."}`
  }

  protected packageVersionString(pkg: ProdDepType): string {
    return `${pkg.name}@${pkg.version}`
  }

  /**
   * Parse a dependency identifier like "@scope/pkg@1.2.3" or "pkg@1.2.3"
   */
  protected parseNameVersion(identifier: string): { name: string; version: string } {
    const lastAt = identifier.lastIndexOf("@")
    if (lastAt <= 0) {
      // fallback for scoped packages or malformed strings
      return { name: identifier, version: "unknown" }
    }
    const name = identifier.slice(0, lastAt)
    const version = identifier.slice(lastAt + 1)
    return { name, version }
  }

  protected async getTreeFromWorkspaces(tree: ProdDepType, packageName: string): Promise<ProdDepType> {
    if (!(tree.workspaces && tree.dependencies)) {
      return tree
    }

    if (tree.dependencies?.[packageName]) {
      const { name, path, dependencies } = tree.dependencies[packageName]
      log.debug({ name, path, dependencies: JSON.stringify(dependencies) }, "pruning root app/self reference from workspace tree")
      for (const [name, pkg] of Object.entries(dependencies ?? {})) {
        tree.dependencies[name] = pkg
        this.allDependencies.set(this.packageVersionString(pkg), pkg)
      }
      delete tree.dependencies[packageName]
    }
    return Promise.resolve(tree)
  }

  private transformToHoisterTree(obj: DependencyGraph, key: string, nodes: Map<string, HoisterTree> = new Map()): HoisterTree {
    let node = nodes.get(key)
    const { name, version } = this.parseNameVersion(key)

    if (!node) {
      node = {
        name,
        identName: name,
        reference: version,
        dependencies: new Set<HoisterTree>(),
        peerNames: new Set<string>(),
      }

      nodes.set(key, node)

      const deps = (obj[key] || {}).dependencies || []
      for (const dep of deps) {
        const child = this.transformToHoisterTree(obj, dep, nodes)
        node.dependencies.add(child)
      }
    }

    return node
  }

  private async _getNodeModules(dependencies: Set<HoisterResult>, result: NodeModuleInfo[]) {
    if (dependencies.size === 0) {
      return
    }

    for (const d of dependencies.values()) {
      const reference = [...d.references][0]
      const p = this.allDependencies.get(`${d.name}@${reference}`)?.path
      if (p === undefined) {
        log.debug({ name: d.name, reference }, "cannot find path for dependency")
        continue
      }

      // fix npm list issue
      // https://github.com/npm/cli/issues/8535
      if (!(await exists(p))) {
        log.debug({ name: d.name, reference, p }, "dependency path does not exist")
        continue
      }

      const node: NodeModuleInfo = {
        name: d.name,
        version: reference,
        dir: await this.cache.realPath[p],
      }
      result.push(node)
      if (d.dependencies.size > 0) {
        node.dependencies = []
        await this._getNodeModules(d.dependencies, node.dependencies)
      }
    }
    result.sort((a, b) => a.name.localeCompare(b.name))
  }

  async asyncExec(command: string, args: string[], cwd: string = this.rootDir): Promise<{ stdout: string | undefined; stderr: string | undefined }> {
    const file = await this.tempDirManager.getTempFile({ prefix: "exec-", suffix: ".txt" })
    try {
      await this.streamCollectorCommandToFile(command, args, cwd, file)
      const result = await fs.readFile(file, { encoding: "utf8" })
      return { stdout: result?.trim(), stderr: undefined }
    } catch (error: any) {
      log.debug({ error: error.message }, "failed to execute command")
      return { stdout: undefined, stderr: error.message }
    }
  }

  async streamCollectorCommandToFile(command: string, args: string[], cwd: string, tempOutputFile: string) {
    const execName = path.basename(command, path.extname(command))
    const isWindowsScriptFile = process.platform === "win32" && path.extname(command).toLowerCase() === ".cmd"
    if (isWindowsScriptFile) {
      // If the command is a Windows script file (.cmd), we need to wrap it in a .bat file to ensure it runs correctly with cmd.exe
      // This is necessary because .cmd files are not directly executable in the same way as .bat files.
      // We create a temporary .bat file that calls the .cmd file with the provided arguments. The .bat file will be executed by cmd.exe.
      // Note: This is a workaround for Windows command execution quirks for specifically when `shell: false`
      const tempBatFile = await this.tempDirManager.getTempFile({
        prefix: execName,
        suffix: ".bat",
      })
      const batScript = `@echo off\r\n"${command}" %*\r\n` // <-- CRLF required for .bat
      await fs.writeFile(tempBatFile, batScript, { encoding: "utf8" })
      command = "cmd.exe"
      args = ["/c", tempBatFile, ...args]
    }

    await new Promise<void>((resolve, reject) => {
      const outStream = createWriteStream(tempOutputFile)

      const child = childProcess.spawn(command, args, {
        cwd,
        shell: false, // required to prevent console logs polution from shell profile loading when `true`
      })

      let stderr = ""
      child.stdout.pipe(outStream)
      child.stderr.on("data", chunk => {
        stderr += chunk.toString()
      })
      child.on("error", err => {
        reject(new Error(`Node module collector spawn failed: ${err.message}`))
      })

      child.on("close", code => {
        outStream.close()
        // https://github.com/npm/npm/issues/17624
        const shouldIgnore = code === 1 && "npm" === execName.toLowerCase() && args.includes("list")
        if (shouldIgnore) {
          log.debug(null, "`npm list` returned non-zero exit code, but it MIGHT be expected (https://github.com/npm/npm/issues/17624). Check stderr for details.")
        }
        if (stderr.length > 0) {
          log.debug({ stderr }, "note: there was node module collector output on stderr")
        }
        const shouldResolve = code === 0 || shouldIgnore
        return shouldResolve ? resolve() : reject(new Error(`Node module collector process exited with code ${code}:\n${stderr}`))
      })
    })
  }

  readPackageVersion(pkgJsonPath: string): string | null {
    try {
      const raw = fs.readFileSync(pkgJsonPath, "utf8")
      const obj = JSON.parse(raw)
      return typeof obj.version === "string" ? obj.version : null
    } catch (e) {
      return null
    }
  }

  semverSatisfies(found: string, range?: string): boolean {
    if (!range || range === "*" || range === "") {
      return true
    }

    if (range === found) {
      return true
    }

    if (semver.validRange(range) == null) {
      // ignore, we can't verify non-semver ranges
      // e.g. git urls, file:, patch:, etc. Example:
      // "@ai-sdk/google": "patch:@ai-sdk/google@npm%3A2.0.43#~/.yarn/patches/@ai-sdk-google-npm-2.0.43-689ed559b3.patch"
      log.debug({ found, range }, "unable to validate semver version range, assuming match")
      return true
    }

    try {
      return semver.satisfies(found, range)
    } catch {
      // fallback: simple equality or basic prefix handling (^, ~)
      if (range.startsWith("^") || range.startsWith("~")) {
        const r = range.slice(1)
        return r === found
      }
      // if range is like "8.x" or "8.*" match major
      const m = range.match(/^(\d+)[.(*|x)]*/)
      const fm = found.match(/^(\d+)\./)
      if (m && fm) {
        return m[1] === fm[1]
      }
      return false
    }
  }

  /**
   * Upward search (hoisted)
   */
  upwardSearch(parentDir: string, pkgName: string, requiredRange?: string): Result {
    let current = path.resolve(parentDir)
    const root = path.parse(current).root
    while (true) {
      const candidate = path.join(current, "node_modules", pkgName, "package.json")
      if (fs.existsSync(candidate)) {
        const ver = this.readPackageVersion(candidate)
        if (ver && this.semverSatisfies(ver, requiredRange)) {
          return { packageDir: path.dirname(candidate), version: ver }
        }
        // otherwise keep searching upward (we may find a different hoisted version)
      }
      if (current === root) break
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }
    return null
  }

  /**
   * Breadth-first downward search from parentDir/node_modules
   * Looks for node_modules/\*\/node_modules/pkgName (and deeper)
   */
  downwardSearch(parentDir: string, pkgName: string, requiredRange?: string, maxExplored = 2000, maxDepth = 6): Result {
    const start = path.join(path.resolve(parentDir), "node_modules")
    if (!fs.existsSync(start) || !fs.statSync(start).isDirectory()) return null

    const visited = new Set<string>()
    const queue: Array<{ dir: string; depth: number }> = [{ dir: start, depth: 0 }]
    let explored = 0

    while (queue.length > 0) {
      const { dir, depth } = queue.shift()!
      if (explored++ > maxExplored) break
      if (depth > maxDepth) continue
      let entries: string[]
      try {
        entries = fs.readdirSync(dir)
      } catch (e) {
        continue
      }
      for (const entry of entries) {
        if (entry.startsWith(".")) continue
        const entryPath = path.join(dir, entry)
        // handle scoped packages @scope/name
        if (entry.startsWith("@")) {
          // queue the scope directory itself to explore its children
          if (fs.existsSync(entryPath) && fs.statSync(entryPath).isDirectory()) {
            const scopeEntries = fs.readdirSync(entryPath)
            for (const sc of scopeEntries) {
              const scPath = path.join(entryPath, sc)
              // check scPath/node_modules/pkgName
              const candidatePkgJson = path.join(scPath, "node_modules", pkgName, "package.json")
              if (fs.existsSync(candidatePkgJson)) {
                const ver = this.readPackageVersion(candidatePkgJson)
                if (ver && this.semverSatisfies(ver, requiredRange)) {
                  return { packageDir: path.dirname(candidatePkgJson), version: ver }
                }
              }
              // enqueue scPath/node_modules to explore further
              const scNodeModules = path.join(scPath, "node_modules")
              if (fs.existsSync(scNodeModules) && fs.statSync(scNodeModules).isDirectory()) {
                if (!visited.has(scNodeModules)) {
                  visited.add(scNodeModules)
                  queue.push({ dir: scNodeModules, depth: depth + 1 })
                }
              }
            }
          }
          continue
        }

        // check for direct candidate: entry/node_modules/pkgName
        try {
          const stat = fs.lstatSync(entryPath)
          if (!stat.isDirectory()) continue
        } catch (e) {
          continue
        }

        const candidatePkgJson = path.join(entryPath, "node_modules", pkgName, "package.json")
        if (fs.existsSync(candidatePkgJson)) {
          const ver = this.readPackageVersion(candidatePkgJson)
          if (ver && this.semverSatisfies(ver, requiredRange)) {
            return { packageDir: path.dirname(candidatePkgJson), version: ver }
          }
        }

        // also check entry/node_modules directly for pkgName (some layouts)
        const candidateDirect = path.join(entryPath, pkgName, "package.json")
        if (fs.existsSync(candidateDirect)) {
          const ver = this.readPackageVersion(candidateDirect)
          if (ver && this.semverSatisfies(ver, requiredRange)) {
            return { packageDir: path.dirname(candidateDirect), version: ver }
          }
        }

        // enqueue entry/node_modules for deeper traversal
        const nextNodeModules = path.join(entryPath, "node_modules")
        if (fs.existsSync(nextNodeModules) && fs.statSync(nextNodeModules).isDirectory()) {
          if (!visited.has(nextNodeModules)) {
            visited.add(nextNodeModules)
            queue.push({ dir: nextNodeModules, depth: depth + 1 })
          }
        }
      }
    }

    return null
  }

  /**
   * Public function: locatePackageVersion
   */
  async locatePackageVersion(parentDir: string, pkgName: string, requiredRange?: string): Promise<Result | null> {
    // 1) check direct parent node_modules/pkgName first
    const direct = path.join(path.resolve(parentDir), "node_modules", pkgName, "package.json")
    if (fs.existsSync(direct)) {
      const ver = this.readPackageVersion(direct)
      if (ver && this.semverSatisfies(ver, requiredRange)) {
        return { packageDir: path.dirname(direct), version: ver }
      }
    }

    // 2) upward hoisted search
    const up = this.upwardSearch(parentDir, pkgName, requiredRange)
    if (up) return up

    // 3) downward nested search
    const down = this.downwardSearch(parentDir, pkgName, requiredRange)
    if (down) return down

    return Promise.resolve(null)
  }
}
