import { hoist, type HoisterTree, type HoisterResult } from "./hoist"
import * as path from "path"
import * as fs from "fs-extra"
import type { NodeModuleInfo, DependencyGraph, Dependency } from "./types"
import { exists, log, retry, TmpDir } from "builder-util"
import { getPackageManagerCommand, PM } from "./packageManager"
import { exec, spawn } from "child_process"
import { promisify } from "util"
import { createWriteStream } from "fs"

const execAsync = promisify(exec)

export abstract class NodeModulesCollector<T extends Dependency<T, OptionalsType>, OptionalsType> {
  private nodeModules: NodeModuleInfo[] = []
  protected allDependencies: Map<string, T> = new Map()
  protected productionGraph: DependencyGraph = {}

  constructor(
    protected readonly rootDir: string,
    private readonly tempDirManager: TmpDir
  ) {}

  public async getNodeModules(): Promise<NodeModuleInfo[]> {
    const tree: T = await this.getDependenciesTree()
    this.collectAllDependencies(tree) // Parse from the root, as npm list can host and deduplicate across projects in the workspace
    const realTree: T = this.getTreeFromWorkspaces(tree)
    await this.extractProductionDependencyGraph(realTree, "." /*root project name*/)

    const hoisterResult: HoisterResult = hoist(this.transToHoisterTree(this.productionGraph), { check: true })
    this._getNodeModules(hoisterResult.dependencies, this.nodeModules)

    return this.nodeModules
  }

  public abstract readonly installOptions: {
    manager: PM
    lockfile: string
  }

  protected abstract getArgs(): string[]
  protected abstract parseDependenciesTree(jsonBlob: string): T
  protected abstract extractProductionDependencyGraph(tree: Dependency<T, OptionalsType>, dependencyId: string): Promise<void>
  protected abstract collectAllDependencies(tree: Dependency<T, OptionalsType>): void

  protected async getDependenciesTree(): Promise<T> {
    const command = getPackageManagerCommand(this.installOptions.manager)
    const args = this.getArgs()

    const tempOutputFile = await this.tempDirManager.getTempFile({
      prefix: path.basename(command, path.extname(command)),
      suffix: "output.json",
    })

    return retry(
      async () => {
        await this.streamCollectorCommandToJsonFile(command, args, this.rootDir, tempOutputFile)
        const dependencies = await fs.readFile(tempOutputFile, { encoding: "utf8" })
        try {
          return this.parseDependenciesTree(dependencies)
        } catch (error: any) {
          log.debug({ message: error.message, stack: error.stack, shellOutput: dependencies, cwd: this.rootDir }, "error parsing dependencies tree")
          throw new Error(
            `Failed to parse dependencies tree in ${this.rootDir} -> ${error.message || error.stack}. Use DEBUG=electron-builder env var to see the dependency query output.`
          )
        }
      },
      {
        retries: 2,
        interval: 2000,
        backoff: 2000,
        shouldRetry: async (error: any) => {
          if (!(await exists(tempOutputFile))) {
            log.error({ error: error.message || error.stack, tempOutputFile, cwd: this.rootDir }, "error getting dependencies tree, unable to find output; retrying")
            return true
          }
          const dependencies = await fs.readFile(tempOutputFile, { encoding: "utf8" })
          if (dependencies.trim().length === 0 || error.message?.includes("Unexpected end of JSON input")) {
            // If the output file is empty or contains invalid JSON, we retry
            // This can happen if the command fails or if the output is not as expected
            log.error({ error: error.message || error.stack, tempOutputFile, cwd: this.rootDir }, "dependency tree output file is empty, retrying")
            return true
          }
          return false
        },
      }
    )
  }

  // protected resolvePath(filePath: string): string {
  //   try {
  //     const stats = fs.lstatSync(filePath)
  //     if (stats.isSymbolicLink()) {
  //       return fs.realpathSync(filePath)
  //     } else {
  //       return filePath
  //     }
  //   } catch (error: any) {
  //     log.debug({ message: error.message || error.stack }, "error resolving path")
  //     return filePath
  //   }
  // }

  protected resolveModuleDir(pkg: string, base: string): string {
    if (pkg === ".") {
      return base
    }
    try {
      const packageJsonDirectory = path.dirname(require.resolve(path.join(pkg, "package.json"), { paths: [base] }))
      if (fs.existsSync(packageJsonDirectory)) {
        return packageJsonDirectory
      }
    } catch {
      // ignore, use fallback
    }
    const searchPath = path.join(base, "node_modules", pkg)
    log.debug({ pkg, searchPath }, "failed to resolve module path, falling back to manual node_modules path construction")
    return searchPath
  }

  private getTreeFromWorkspaces(tree: T): T {
    if (tree.workspaces && tree.dependencies) {
      const packageJson: Dependency<string, string> = require(path.join(this.rootDir, "package.json"))
      const dependencyName = packageJson.name
      for (const [key, value] of Object.entries(tree.dependencies)) {
        if (key === dependencyName) {
          return value
        }
      }
    }

    return tree
  }

  private transToHoisterTree(obj: DependencyGraph, key: string = `.`, nodes: Map<string, HoisterTree> = new Map()): HoisterTree {
    let node = nodes.get(key)
    const name = key.match(/@?[^@]+/)![0]
    if (!node) {
      node = {
        name,
        identName: name,
        reference: key.match(/@?[^@]+@?(.+)?/)![1] || ``,
        dependencies: new Set<HoisterTree>(),
        peerNames: new Set<string>([]),
      }
      nodes.set(key, node)

      const deps = (obj[key] || {}).dependencies || []
      for (const dep of deps) {
        node.dependencies.add(this.transToHoisterTree(obj, dep, nodes))
      }
    }
    return node
  }

  private _getNodeModules(dependencies: Set<HoisterResult>, result: NodeModuleInfo[]) {
    if (dependencies.size === 0) {
      return
    }

    for (const d of dependencies.values()) {
      const reference = [...d.references][0]
      const dep = this.allDependencies.get(`${d.name}@${reference}`)
      const p = dep?.path
      if (p === undefined) {
        log.debug({ name: d.name, reference }, "cannot find path for dependency")
        continue
      }

      // fix npm list issue
      // https://github.com/npm/cli/issues/8535
      if (!fs.existsSync(p)) {
        log.debug({ name: d.name, reference, p }, "dependency path does not exist")
        continue
      }

      const node: NodeModuleInfo = {
        name: d.name,
        version: reference,
        dir: p,
      }
      result.push(node)
      if (d.dependencies.size > 0) {
        node.dependencies = []
        this._getNodeModules(d.dependencies, node.dependencies)
      }
    }
    result.sort((a, b) => a.name.localeCompare(b.name))
  }

  static async safeExec(command: string, args: string[], cwd: string): Promise<string> {
    const payload = await execAsync([`"${command}"`, ...args].join(" "), { cwd, maxBuffer: 100 * 1024 * 1024 }) // 100MB buffer LOL, some projects can have extremely large dependency trees
    return payload.stdout.trim()
  }

  async streamCollectorCommandToJsonFile(command: string, args: string[], cwd: string, tempOutputFile: string) {
    const execName = path.basename(command, path.extname(command))
    const isWindowsScriptFile = process.platform === "win32" && path.extname(command).toLowerCase() === ".cmd"
    if (isWindowsScriptFile) {
      // If the command is a Windows script file (.cmd), we need to wrap it in a .bat file to ensure it runs correctly with cmd.exe
      // This is necessary because .cmd files are not directly executable in the same way as .bat files.
      // We create a temporary .bat file that calls the .cmd file with the provided arguments. The .bat file will be executed by cmd.exe.
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

      const child = spawn(command, args, {
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
        if (code === 1 && ["npm", "yarn"].includes(execName.toLowerCase()) && args.includes("list")) {
          // This is a known issue with npm list command, it can return code 1 even when the command is "technically" successful
          log.debug({ code, stderr }, "`npm list` returned non-zero exit code, but it MIGHT be expected (https://github.com/npm/npm/issues/17624). Check stderr for details.")
          resolve()
          return
        }
        if (code !== 0) {
          return reject(new Error(`Node module collector process exited with code ${code}:\n${stderr}`))
        }
        resolve()
      })
    })
  }

  async isProjectHoisted() {
    const command = getPackageManagerCommand(this.installOptions.manager)
    const config = await NodeModulesCollector.safeExec(command, ["config", "list"], this.rootDir)
    const lines = Object.fromEntries(config.split("\n").map(line => line.split("=").map(s => s.trim())))
    return lines["node-linker"] === "hoisted"
  }

}
