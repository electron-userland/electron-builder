import { exists, isEmptyOrSpaces, log, retry, TmpDir } from "builder-util"
import * as childProcess from "child_process"
import { CancellationToken } from "builder-util-runtime"
import * as fs from "fs-extra"
import { createWriteStream, readJson } from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { hoist, type HoisterResult, type HoisterTree } from "./hoist"
import { createModuleCache, type ModuleCache } from "./moduleCache"
import { getPackageManagerCommand, PM } from "./packageManager"
import type { Dependency, DependencyGraph, NodeModuleInfo, PackageJson } from "./types"

export abstract class NodeModulesCollector<ProdDepType extends Dependency<ProdDepType, OptionalDepType>, OptionalDepType> {
  private nodeModules: NodeModuleInfo[] = []
  protected allDependencies: Map<string, ProdDepType> = new Map()
  protected productionGraph: DependencyGraph = {}
  protected pkgJsonCache: Map<string, string> = new Map()
  protected memoResolvedModules = new Map<string, Promise<string | null>>()

  // Unified cache for all file system and module operations
  protected cache: ModuleCache = createModuleCache()

  protected isHoisted = new Lazy<boolean>(async () => {
    const { manager } = this.installOptions
    const command = getPackageManagerCommand(manager)

    const config = (await this.asyncExec(command, ["config", "list"])).stdout?.trim()
    if (isEmptyOrSpaces(config)) {
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
    const appPkgPath = path.join(this.rootDir, "package.json")
    return this.readJsonMemoized(appPkgPath)
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

          if (!(await this.existsMemoized(tempOutputFile))) {
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

  protected async existsMemoized(filePath: string): Promise<boolean> {
    if (!this.cache.exists.has(filePath)) {
      this.cache.exists.set(filePath, await exists(filePath))
    }
    return this.cache.exists.get(filePath)!
  }

  protected async readJsonMemoized(filePath: string): Promise<PackageJson> {
    if (!this.cache.packageJson.has(filePath)) {
      this.cache.packageJson.set(filePath, await readJson(filePath))
    }
    return this.cache.packageJson.get(filePath)!
  }

  protected async lstatMemoized(filePath: string): Promise<fs.Stats> {
    if (!this.cache.lstat.has(filePath)) {
      this.cache.lstat.set(filePath, await fs.lstat(filePath))
    }
    return this.cache.lstat.get(filePath)!
  }

  protected async realpathMemoized(filePath: string): Promise<string> {
    if (!this.cache.realPath.has(filePath)) {
      this.cache.realPath.set(filePath, await fs.realpath(filePath))
    }
    return this.cache.realPath.get(filePath)!
  }

  protected requireMemoized(pkgPath: string): PackageJson {
    if (!this.cache.packageJson.has(pkgPath)) {
      this.cache.packageJson.set(pkgPath, require(pkgPath))
    }
    return this.cache.packageJson.get(pkgPath)!
  }

  protected existsSyncMemoized(filePath: string): boolean {
    if (!this.cache.exists.has(filePath)) {
      this.cache.exists.set(filePath, fs.existsSync(filePath))
    }
    return this.cache.exists.get(filePath)!
  }

  protected async resolvePath(filePath: string): Promise<string> {
    // Check if we've already resolved this path
    if (this.cache.realPath.has(filePath)) {
      return this.cache.realPath.get(filePath)!
    }

    try {
      const stats = await this.lstatMemoized(filePath)
      if (stats.isSymbolicLink()) {
        const resolved = await this.realpathMemoized(filePath)
        this.cache.realPath.set(filePath, resolved)
        return resolved
      } else {
        this.cache.realPath.set(filePath, filePath)
        return filePath
      }
    } catch (error: any) {
      log.debug({ filePath, message: error.message || error.stack }, "error resolving path")
      this.cache.realPath.set(filePath, filePath)
      return filePath
    }
  }

  /**
   * Resolve a package directory purely from the filesystem.
   * Does NOT attempt to load the module or resolve an "exports" entrypoint.
   * Good for Yarn 4 because a package may not be resolvable as a module,
   * but still exists on disk.
   */
  protected async resolvePackage(packageName: string, fromDir: string): Promise<{ entry: string; packageDir: string } | null> {
    const cacheKey = `${packageName}::${fromDir}`
    if (this.cache.requireResolve.has(cacheKey)) {
      return this.cache.requireResolve.get(cacheKey)!
    }

    // 1. NESTED under fromDir/node_modules/<name>
    let candidate = path.join(fromDir, "node_modules", packageName)
    let pkgJson = path.join(candidate, "package.json")
    if (await this.existsMemoized(pkgJson)) {
      this.cache.requireResolve.set(cacheKey, { entry: pkgJson, packageDir: candidate })
      return { entry: pkgJson, packageDir: candidate }
    }

    // 2. HOISTED under rootDir/node_modules/<name>
    candidate = path.join(this.rootDir, "node_modules", packageName)
    pkgJson = path.join(candidate, "package.json")
    if (await this.existsMemoized(pkgJson)) {
      this.cache.requireResolve.set(cacheKey, { entry: pkgJson, packageDir: candidate })
      return { entry: pkgJson, packageDir: candidate }
    }

    // 3. FALLBACK: try parent directories BFS (classic Node-style search)
    let current = fromDir
    while (true) {
      const nm = path.join(current, "node_modules", packageName)
      const pkg = path.join(nm, "package.json")

      if (await this.existsMemoized(pkg)) {
        this.cache.requireResolve.set(cacheKey, { entry: pkg, packageDir: nm })
        return { entry: pkg, packageDir: nm }
      }

      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }

    // 4. LAST RESORT: DO NOT throw — just return null
    this.cache.requireResolve.set(cacheKey, null)
    return null
  }

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
        dir: await this.resolvePath(p),
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
}
