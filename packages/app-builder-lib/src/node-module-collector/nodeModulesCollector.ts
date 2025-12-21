import { log, retry, TmpDir } from "builder-util"
import * as childProcess from "child_process"
import * as fs from "fs-extra"
import { createWriteStream } from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { hoist, type HoisterResult, type HoisterTree } from "./hoist"
import { ModuleManager } from "./moduleManager"
import { getPackageManagerCommand, PM } from "./packageManager"
import type { Dependency, DependencyGraph, NodeModuleInfo, PackageJson } from "./types"

export abstract class NodeModulesCollector<ProdDepType extends Dependency<ProdDepType, OptionalDepType>, OptionalDepType> {
  private readonly nodeModules: NodeModuleInfo[] = []
  protected readonly allDependencies: Map<string, ProdDepType> = new Map()
  protected readonly productionGraph: DependencyGraph = {}
  protected readonly cache: ModuleManager = new ModuleManager()

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

  constructor(
    protected readonly rootDir: string,
    private readonly tempDirManager: TmpDir
  ) {}

  public async getNodeModules({ packageName }: { packageName: string }): Promise<NodeModuleInfo[]> {
    const tree: ProdDepType = await this.getDependenciesTree(this.installOptions.manager)

    await this.collectAllDependencies(tree, packageName)
    const realTree: ProdDepType = await this.getTreeFromWorkspaces(tree, packageName)
    await this.extractProductionDependencyGraph(realTree, packageName)

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
        return await this.parseDependenciesTree(shellOutput.trim())
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

  protected cacheKey(pkg: Pick<ProdDepType, "name" | "version" | "path">): string {
    const rel = path.relative(this.rootDir, pkg.path)
    return `${pkg.name}::${pkg.version}::${rel ?? "."}`
  }

  protected packageVersionString(pkg: Pick<ProdDepType, "name" | "version">): string {
    return `${pkg.name}@${pkg.version}`
  }

  protected isProdDependency(depName: string, pkg: ProdDepType): boolean {
    const prodDeps = { ...pkg.dependencies, ...pkg.optionalDependencies }
    return prodDeps[depName] != null
  }

  protected async locatePackageWithVersion(depTree: Pick<ProdDepType, "name" | "version" | "path">): Promise<{ packageDir: string; packageJson: PackageJson } | null> {
    const key = this.cache.versionedCacheKey({ name: depTree.name, semver: depTree.version, path: depTree.path })
    const result = await this.cache.packageData[key]
    return result
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
        log.warn({ name: d.name, reference }, "cannot find path for dependency")
        continue
      }

      // fix npm list issue
      // https://github.com/npm/cli/issues/8535
      if (!(await this.cache.exists[p])) {
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
        env: { COREPACK_ENABLE_STRICT: "0", ...process.env }, // allow `process.env` overrides
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
