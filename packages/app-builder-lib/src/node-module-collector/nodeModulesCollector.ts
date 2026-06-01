import { exists, log, retry, stripSensitiveEnvVars, TmpDir } from "builder-util"
import * as childProcess from "child_process"
import { randomBytes } from "crypto"
import * as fs from "fs-extra"
import { createWriteStream } from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { hoist, type HoisterResult, type HoisterTree } from "./hoist"
import { LogMessageByKey, ModuleManager } from "./moduleManager"
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
      log.debug({ manager }, "unable to determine node-linker setting; assuming non-hoisted (virtual store) layout")
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

  /**
   * Retrieves and collects all Node.js modules for a given package.
   *
   * This method orchestrates the entire module collection process by:
   * 1. Fetching the dependency tree from the package manager
   * 2. Collecting all dependencies recursively
   * 3. Extracting workspace references if applicable
   * 4. Building a production dependency graph
   * 5. Hoisting the dependencies to their final locations
   * 6. Resolving and returning module information
   */
  public async getNodeModules({ packageName }: { packageName: string }): Promise<{
    nodeModules: NodeModuleInfo[]
    logSummary: ModuleManager["logSummary"]
  }> {
    const tree: ProdDepType = await this.getDependenciesTree(this.installOptions.manager)

    await this.collectAllDependencies(tree, packageName)
    const realTree: ProdDepType = this.getTreeFromWorkspaces(tree, packageName)
    await this.extractProductionDependencyGraph(realTree, packageName)

    const hoisterResult: HoisterResult = hoist(this.transformToHoisterTree(this.productionGraph, packageName), {
      check: log.isDebugEnabled,
    })

    await this._getNodeModules(hoisterResult.dependencies, this.nodeModules)

    log.debug({ packageName, depCount: this.nodeModules.length }, "node modules collection complete")

    return { nodeModules: this.nodeModules, logSummary: this.cache.logSummary }
  }

  public abstract readonly installOptions: {
    manager: PM
    lockfile: string
  }

  protected abstract getArgs(): string[]
  protected abstract extractProductionDependencyGraph(tree: Dependency<ProdDepType, OptionalDepType>, dependencyId: string): Promise<void>
  protected abstract collectAllDependencies(tree: Dependency<ProdDepType, OptionalDepType>, appPackageName: string): Promise<void>

  /**
   * Retrieves the dependency tree from the package manager.
   *
   * Executes the appropriate package manager command to fetch the dependency tree and writes
   * the output to a temporary file. Includes retry logic to handle transient failures such as
   * incomplete JSON output or missing files. Will retry up to 1 time with exponential backoff.
   */
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
        const result = await Promise.resolve(this.parseDependenciesTree(shellOutput))
        return result
      },
      {
        retries: 1,
        interval: 2000,
        backoff: 2000,
        shouldRetry: async (error: any) => {
          const fields: Record<string, string> = { error: error.message, tempOutputFile, cwd: this.rootDir, packageManager: pm }

          if (!(await exists(tempOutputFile))) {
            log.debug(fields, "dependency tree output file missing, retrying")
            return true
          }

          const fileContent = await fs.readFile(tempOutputFile, { encoding: "utf8" })
          fields.fileContentLength = fileContent.length.toString()

          if (fileContent.trim().length === 0) {
            log.debug(fields, "dependency tree output file empty, retrying")
            return true
          }

          // extract small start/end sample for debugging purposes (e.g. polluted console output)
          const lines = fileContent.split("\n")
          const lineSampleSize = Math.min(5, lines.length / 2)
          if (2 * lineSampleSize > 5) {
            fields.sampleStart = lines.slice(0, lineSampleSize).join("\n")
            fields.sampleEnd = lines.slice(-lineSampleSize).join("\n")
          } else {
            fields.content = fileContent
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

  /**
   * Parses the dependencies tree from shell command output.
   *
   **/
  protected parseDependenciesTree(shellOutput: string): ProdDepType | Promise<ProdDepType> {
    return this.extractJsonFromPollutedOutput<ProdDepType>(shellOutput)
  }

  protected extractJsonFromPollutedOutput<T>(shellOutput: string): T {
    const consoleOutput = shellOutput.trim()
    try {
      // Please for the love of all that is holy, this should cover 99% of cases where npm/pnpm/yarn output is clean JSON
      return JSON.parse(consoleOutput)
    } catch {
      // ignore
    }

    // DEDICATED FALLBACK FOR POLLUTED OUTPUT, non-trivial to implement correctly, not needed in most cases, and highly inefficient

    // Find the first index that starts with { or [
    const bracketOpen = Math.max(consoleOutput.indexOf("{"), 0)
    const bracketOpenSquare = Math.max(consoleOutput.indexOf("["), 0)
    const start = Math.min(bracketOpen, bracketOpenSquare) // always non-negative due to Math.max above

    for (let i = start; i < consoleOutput.length; i++) {
      const slice = consoleOutput.slice(start, i + 1)
      try {
        return JSON.parse(slice)
      } catch {
        // ignore, try next
      }
    }
    throw new Error("No JSON content found in output")
  }

  protected cacheKey(pkg: Pick<ProdDepType, "name" | "version" | "path">): string {
    const rel = path.relative(this.rootDir, pkg.path)
    return `${pkg.name}::${pkg.version}::${rel ?? "."}`
  }

  // We use the key (alias name) instead of value.name for npm aliased packages
  // e.g., { "foo": { name: "@scope/bar", ... } } should be stored as "foo@version"
  protected normalizePackageVersion(key: string, pkg: ProdDepType) {
    return { id: `${key}@${pkg.version}`, pkgOverride: { ...pkg, name: key } }
  }

  /**
   * Determines if a given dependency is a production dependency of a package.
   *
   * Checks both the dependencies and optionalDependencies of a package to see if
   * the specified dependency name is listed.
   *
   * @param depName - The name of the dependency to check
   * @param pkg - The package to search for the dependency in
   * @returns True if the dependency is found in either dependencies or optionalDependencies, false otherwise
   */
  protected isProdDependency(depName: string, pkg: ProdDepType): boolean {
    const prodDeps = { ...pkg.dependencies, ...pkg.optionalDependencies }
    return prodDeps[depName] != null
  }

  protected async locatePackageWithVersion(depTree: Pick<ProdDepType, "name" | "version" | "path">): Promise<{ packageDir: string; packageJson: PackageJson } | null> {
    const result = await this.cache.locatePackageVersion({
      parentDir: depTree.path,
      pkgName: depTree.name,
      requiredRange: depTree.version,
    })
    return result
  }
  /**
   * Parses a dependency identifier string into name and version components.
   *
   * Handles both scoped packages (e.g., "@scope/pkg@1.2.3") and regular packages (e.g., "pkg@1.2.3").
   * If the identifier is malformed or cannot be parsed, defaults to treating the entire string as
   * the package name with an "unknown" version.
   */
  protected parseNameVersion(identifier: string): { name: string; version: string } {
    let at: number
    if (identifier.startsWith("@")) {
      // Scoped package: find the version separator after the scope (e.g. "@scope/pkg@1.2.3")
      const slashIndex = identifier.indexOf("/")
      if (slashIndex === -1) {
        return { name: identifier, version: "unknown" }
      }
      at = identifier.indexOf("@", slashIndex + 1)
    } else {
      at = identifier.indexOf("@")
    }
    if (at <= 0) {
      return { name: identifier, version: "unknown" }
    }
    return { name: identifier.slice(0, at), version: identifier.slice(at + 1) }
  }

  /**
   * Retrieves the dependency tree and handles workspace package self-references.
   *
   * If the project is a workspace project, this method removes the root package's self-reference
   * from the dependency tree to avoid circular dependencies. It promotes the root package's
   * direct dependencies to the top level of the tree.
   *
   * @param tree - The original dependency tree
   * @param packageName - The name of the package to check for and remove from the tree
   * @returns The extracted dependency subtree
   */
  protected getTreeFromWorkspaces(tree: ProdDepType, packageName: string): ProdDepType {
    if (tree.workspaces && tree.dependencies) {
      for (const [key, value] of Object.entries(tree.dependencies)) {
        if (key === packageName) {
          return value
        }
      }
    }

    return tree
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
      const key = `${d.name}@${reference}`
      // Normalize the path to handle mixed separators from pnpm JSON output on Windows
      const rawPath = this.allDependencies.get(key)?.path
      const p = rawPath != null ? path.normalize(rawPath) : undefined
      if (p === undefined) {
        this.cache.logSummary[LogMessageByKey.PKG_NOT_FOUND].push(key)
        continue
      }

      // fix npm list issue
      // https://github.com/npm/cli/issues/8535
      if (!(await this.cache.exists[p])) {
        this.logMissingDependency(key)
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

  protected logMissingDependency(pkgName: string) {
    const PLATFORM_PACKAGE_RE = /(linux|win32|darwin|freebsd|android)[-_](x64|arm64|ia32|arm|ppc64|s390x|loong64|riscv64|universal)/
    const diskLogKey = PLATFORM_PACKAGE_RE.test(pkgName) ? LogMessageByKey.PKG_OPTIONAL_PLATFORM_NOT_INSTALLED : LogMessageByKey.PKG_NOT_ON_DISK
    this.cache.logSummary[diskLogKey].push(pkgName)
  }

  protected async asyncExec(command: string, args: string[], cwd: string = this.rootDir): Promise<{ stdout: string | undefined; stderr: string | undefined }> {
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

  /**
   * Executes a command and streams its output to a file.
   *
   * Spawns a child process to execute the specified command with arguments, capturing stdout
   * to a file. Handles Windows-specific quirks by wrapping .cmd files in a temporary .bat file
   * when necessary. Enables corepack strict mode by default but allows process.env overrides.
   *
   * Special handling for `npm list` exit code 1, which is expected in certain scenarios.
   *
   * @param command - The command to execute
   * @param args - Array of command-line arguments
   * @param cwd - The working directory to execute the command in
   * @param tempOutputFile - The path to the temporary file where stdout will be written
   * @returns Promise that resolves when the command completes successfully or rejects if it fails
   * @throws {Error} If the child process spawn fails or exits with a non-zero code
   */
  protected async streamCollectorCommandToFile(command: string, args: string[], cwd: string, tempOutputFile: string) {
    // Capture execName from the original command before resolveWindowsCommand may rewrite it to
    // cmd.exe — shouldIgnore must key off the original invocation (e.g. "npm", not "cmd").
    const execName = path.basename(command, path.extname(command))

    if (process.platform === "win32") {
      const resolved = await this.resolveWindowsCommand(command, args)
      command = resolved.command
      args = resolved.args
    }
    const isWindows = process.platform === "win32"

    // shell: true is required on Windows — see https://github.com/electron-userland/electron-builder/issues/9488
    // On non-Windows, shell:false means args are passed directly to the process with no shell
    // interpretation, so the metacharacter guard is only necessary on Windows.
    if (isWindows) {
      // Guard against cmd.exe metacharacters. Parentheses are intentionally excluded because they
      // appear in legitimate Windows paths (e.g. "C:\Program Files (x86)").
      const SHELL_INJECTION_RE = /[;&|`${}[\]<>!%^]/
      for (const arg of args) {
        if (SHELL_INJECTION_RE.test(arg)) {
          throw new Error(`Refusing to spawn "${command}": argument "${arg}" contains shell metacharacters. Possible injection attempt.`)
        }
      }
    }

    await new Promise<void>((resolve, reject) => {
      const outStream = createWriteStream(tempOutputFile)

      const child = childProcess.spawn(command, args, {
        cwd,
        // Package manager invocations do not need signing/publishing credentials.
        env: { COREPACK_ENABLE_STRICT: "0", ...stripSensitiveEnvVars(process.env) },
        shell: isWindows, // shell: true is required on Windows — see https://github.com/electron-userland/electron-builder/issues/9488
      })

      let stderr = ""
      child.stdout.pipe(outStream)
      child.stderr.on("data", chunk => {
        stderr += chunk.toString()
      })
      child.on("error", err => {
        reject(new Error(`Node module collector spawn (${command} ${JSON.stringify(args)}) failed: ${err.message}`))
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
          // Only surface stderr as a user-visible warning when the exit code itself is unexpected.
          // When shouldIgnore is true (npm list exit code 1) the stderr is an anticipated side
          // effect of package-manager features like yarn resolutions or npm overrides that cause
          // npm to report ELSPROBLEMS for aliased packages it considers "invalid".
          if (!shouldIgnore) {
            this.cache.logSummary[LogMessageByKey.PKG_COLLECTOR_OUTPUT].push(stderr)
          }
        }
        const shouldResolve = code === 0 || shouldIgnore
        return shouldResolve ? resolve() : reject(new Error(`Node module collector process exited with code ${code}:\n${stderr}`))
      })
    })
  }

  /**
   * Windows-only. Wraps .cmd files and executables at paths containing spaces in a temporary .bat
   * file so that cmd.exe spawns them correctly. Returns the original command/args unchanged when
   * no wrapping is required. Must only be called on win32.
   */
  private async resolveWindowsCommand(command: string, args: string[]): Promise<{ command: string; args: string[] }> {
    if (process.platform !== "win32") {
      throw new Error("resolveWindowsCommand should only be called on Windows platforms")
    }

    const ext = path.extname(command).toLowerCase()
    // Wrap .cmd files and any Windows executable path that contains spaces (e.g. extensionless
    // shims from tools like Volta installed at "C:\Program Files\Volta\") to ensure the path is
    // quoted correctly when passed to `spawn(..., { shell: true })`.
    const needsWrap = ext === ".cmd" || command.includes(" ")
    if (!needsWrap) {
      return { command, args }
    }

    const execName = path.basename(command, ext)
    const tempBatFile = await this.tempDirManager.getTempFile({
      prefix: execName + "-" + randomBytes(8).toString("hex"),
      suffix: ".bat",
    })
    const escapedCommand = command.replace(/"/g, `""`)
    const batScript = `@echo off\r\n"${escapedCommand}" %*\r\n` // <-- CRLF required for .bat
    await fs.writeFile(tempBatFile, batScript, { encoding: "utf8", mode: 0o600 })
    return { command: "cmd.exe", args: ["/c", `"${tempBatFile}"`, ...args] }
  }
}
