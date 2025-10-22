import { hoist, type HoisterTree, type HoisterResult } from "./hoist"
import * as path from "path"
import * as fs from "fs-extra"
import type { NodeModuleInfo, DependencyGraph, Dependency } from "./types"
import { exists, log, retry, TmpDir } from "builder-util"
import { getPackageManagerCommand, PM } from "./packageManager"
import { exec, spawn } from "child_process"
import { promisify } from "util"
import { createWriteStream } from "fs"
import { Lazy } from "lazy-val"

const execAsync = promisify(exec)

export abstract class NodeModulesCollector<T extends Dependency<T, OptionalsType>, OptionalsType> {
  protected allDependencies: Map<string, T> = new Map()
  protected productionGraph: DependencyGraph = {}

  protected isHoisted = new Lazy<boolean>(async () => {
    const command = getPackageManagerCommand(this.installOptions.manager)
    try {
      const config = await this.asyncExec(command, ["config", "list"])
      const lines = Object.fromEntries(config.split("\n").map(line => line.split("=").map(s => s.trim())))
      return lines["node-linker"] === "hoisted"
    } catch (error: any) {
      log.debug({ error: error.message, stack: error.stack }, "error checking if node modules are hoisted, falling back to non-hoisted")
    }
    return false
  })

  constructor(
    protected readonly rootDir: string,
    private readonly tempDirManager: TmpDir
  ) {}

  public async getNodeModules(): Promise<NodeModuleInfo[]> {
    const tree: T = await this.getDependenciesTree(this.installOptions.manager)
    await this.collectAllDependencies(tree) // Parse from the root, as npm list can host and deduplicate across projects in the workspace
    const realTree: T = this.getTreeFromWorkspaces(tree)
    await this.extractProductionDependencyGraph(realTree, "." /*root project name*/)

    const hoisterResult: HoisterResult = hoist(this.transToHoisterTree(this.productionGraph, "."), { check: true })
    const nodeModules: NodeModuleInfo[] = await this._getNodeModules(hoisterResult.dependencies)

    return nodeModules
  }

  public abstract readonly installOptions: {
    manager: PM
    lockfile: string
  }

  protected abstract getArgs(): string[]
  protected abstract parseDependenciesTree(jsonBlob: string): Promise<T>
  protected abstract extractProductionDependencyGraph(tree: Dependency<T, OptionalsType>, dependencyId: string): Promise<void>
  protected abstract collectAllDependencies(tree: Dependency<T, OptionalsType>): Promise<void>

  protected async getDependenciesTree(pn: PM): Promise<T> {
    const command = getPackageManagerCommand(pn)
    const args = this.getArgs()

    const tempOutputFile = await this.tempDirManager.getTempFile({
      prefix: path.basename(command, path.extname(command)),
      suffix: "output.json",
    })

    return retry(
      async () => {
        await this.streamCollectorCommandToJsonFile(command, args, this.rootDir, tempOutputFile)
        const shellOutput = await fs.readFile(tempOutputFile, { encoding: "utf8" })
        return await this.parseDependenciesTree(shellOutput)
      },
      {
        retries: 2,
        interval: 2000,
        backoff: 2000,
        shouldRetry: async (error: any) => {
          if (!(await exists(tempOutputFile))) {
            log.debug({ error: error.message || error.stack, tempOutputFile, cwd: this.rootDir }, "error getting dependencies tree, unable to find output; retrying")
            return true
          }
          const fileContent = await fs.readFile(tempOutputFile, { encoding: "utf8" })
          if (fileContent.trim().length === 0) {
            // If the output file is empty or contains invalid JSON, we retry
            // This can happen if the command fails or if the output is not as expected
            log.debug({ error: error.message || error.stack, tempOutputFile, cwd: this.rootDir }, "dependency tree output file is empty, retrying")
            return true
          }
          if (error.message?.includes("Unexpected end of JSON input")) {
            // If the output file is empty or contains invalid JSON, we retry
            // This can happen if the command fails or if the output is not as expected
            log.debug({ error: error.message || error.stack, tempOutputFile, cwd: this.rootDir, fileContent }, "expected JSON data (check `fileContent`), retrying")
            return true
          }
          log.error({ message: error.message, stack: error.stack, cwd: this.rootDir, fileContent }, "error parsing dependencies tree")
          return false
        },
      }
    )
  }

  protected async resolveModuleDir(pkg: string, base: string): Promise<string> {
    const isHoisted = await this.isHoisted.value
    const searchRoot = isHoisted ? this.rootDir : base

    try {
      const resolved = require.resolve(path.join(pkg, "package.json"), { paths: [searchRoot] })
      const real = await fs.realpath(resolved)
      const packageJsonDirectory = path.dirname(real)
      if (await exists(packageJsonDirectory)) {
        return packageJsonDirectory
      }
      log.debug({ pkg, searchRoot, base }, "failed to resolve module path's package.json, falling back to manual node_modules path construction")
    } catch (error: any) {
      log.debug({ error: error.message, stack: error.stack, pkg, searchRoot, base }, "cannot resolve module path's package.json")
    }
    const searchPath = path.join(searchRoot, "node_modules", pkg)
    return searchPath
  }

  protected moduleKeyGenerator(pkg: T): string {
    return `${pkg.name}@${pkg.version}`
  }

  /**
   * Parse a dependency identifier like "@scope/pkg@1.2.3" or "pkg@1.2.3"
   */
  protected parseNameVersion(identifier: string): { name: string; version: string } {
    const match = identifier.match(/^(@[^/]+\/[^@]+)@(.+)$/) || identifier.match(/^([^@]+)@(.+)$/)
    if (match) {
      return { name: match[1], version: match[2] }
    }
    return { name: identifier, version: "unknown" }
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

  private transToHoisterTree(obj: DependencyGraph, key: string, nodes: Map<string, HoisterTree> = new Map()): HoisterTree {
    let node = nodes.get(key)
    const { name, version: reference } = this.parseNameVersion(key)
    // const reference = key.match(/@?[^@]+@?(.+)?/)![1] || ``
    if (!node) {
      node = {
        name,
        identName: name,
        reference,
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

  private async _getNodeModules(dependencies: Set<HoisterResult>): Promise<NodeModuleInfo[]> {
    const result: NodeModuleInfo[] = []

    if (dependencies.size === 0) {
      return result
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
      if (!(await exists(p))) {
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
        node.dependencies = await this._getNodeModules(d.dependencies)
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }

  async asyncExec(command: string, args: string[], cwd: string = this.rootDir): Promise<string> {
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
        if (code === 1 && "npm" === execName.toLowerCase() && args.includes("list")) {
          // This is a known issue with npm list command, it can return code 1 even when the command is "technically" successful
          if (this.installOptions.manager === PM.NPM) {
            log.debug({ code, stderr }, "`npm list` returned non-zero exit code, but it MIGHT be expected (https://github.com/npm/npm/issues/17624). Check stderr for details.")
          }
          return resolve()
        }
        if (code !== 0) {
          return reject(new Error(`Node module collector process exited with code ${code}:\n${stderr}`))
        }
        resolve()
      })
    })
  }
}
