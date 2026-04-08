import { exists, log, retry, stripSensitiveEnvVars, TmpDir } from "builder-util"
import * as childProcess from "child_process"
<<<<<<< HEAD
<<<<<<< HEAD
import { createWriteStream } from "node:fs"
import _fsExtra from "fs-extra"
=======
import { createWriteStream } from "fs-extra"
>>>>>>> 850646b29 (move the manual node module traversal to the root abstract class. Add `env: { COREPACK_ENABLE_STRICT: "0", ...process.env },` to allow `npm list` to work across environments. extract fallback node collector (Traversal) to separate class due to differing parsing logic from NPM collector)
=======
import * as fs from "fs-extra"
import * as fsExtra from "fs-extra"
>>>>>>> 8a2e4e97f (tmp save. migrating fs-extra to namespace import)
import { Lazy } from "lazy-val"
import { hoist, type HoisterResult, type HoisterTree } from "./hoist.js"
import { ModuleCache } from "./moduleCache.js"
import { getPackageManagerCommand, PM } from "./packageManager.js"
import type { Dependency, DependencyGraph, NodeModuleInfo } from "./types.js"
import * as path from "path"
<<<<<<< HEAD
import { hoist, type HoisterResult, type HoisterTree } from "./hoist.js"
import { LogMessageByKey, ModuleManager } from "./moduleManager.js"
import { getPackageManagerCommand, PM } from "./packageManager.js"
import type { Dependency, DependencyGraph, NodeModuleInfo, PackageJson } from "./types.js"
=======
import * as semver from "semver"
<<<<<<< HEAD
import { hoist, type HoisterResult, type HoisterTree } from "./hoist.js"
import { ModuleCache } from "./moduleCache.js"
import { getPackageManagerCommand, PM } from "./packageManager.js"
import type { Dependency, DependencyGraph, NodeModuleInfo } from "./types.js"
type Result = { packageDir: string; version: string } | null
>>>>>>> 5a5d2b7d9 (tmp save for .js extension migration)
=======
import * as fs from "fs-extra"
>>>>>>> 850646b29 (move the manual node module traversal to the root abstract class. Add `env: { COREPACK_ENABLE_STRICT: "0", ...process.env },` to allow `npm list` to work across environments. extract fallback node collector (Traversal) to separate class due to differing parsing logic from NPM collector)

export abstract class NodeModulesCollector<ProdDepType extends Dependency<ProdDepType, OptionalDepType>, OptionalDepType> {
  private readonly nodeModules: NodeModuleInfo[] = []
  protected readonly allDependencies: Map<string, ProdDepType> = new Map()
  protected readonly productionGraph: DependencyGraph = {}
<<<<<<< HEAD
  protected readonly cache: ModuleManager = new ModuleManager()
=======
  protected readonly cache: ModuleCache = new ModuleCache()
  // private readonly manualNodeModulesCollector = new TraversalNodeModulesCollector<ProdDepType, OptionalDepType>(this.rootDir, this.tempDirManager)
>>>>>>> 850646b29 (move the manual node module traversal to the root abstract class. Add `env: { COREPACK_ENABLE_STRICT: "0", ...process.env },` to allow `npm list` to work across environments. extract fallback node collector (Traversal) to separate class due to differing parsing logic from NPM collector)

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

<<<<<<< HEAD
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

=======
  public async getNodeModules({ packageName }: { cancellationToken: CancellationToken; packageName: string }): Promise<NodeModuleInfo[]> {
    const tree: ProdDepType = await this.getDependenciesTree(this.installOptions.manager)
    await this.collectAllDependencies(tree, packageName)
    const realTree: ProdDepType = await this.getTreeFromWorkspaces(tree, packageName)
    await this.extractProductionDependencyGraph(realTree, packageName)
>>>>>>> 850646b29 (move the manual node module traversal to the root abstract class. Add `env: { COREPACK_ENABLE_STRICT: "0", ...process.env },` to allow `npm list` to work across environments. extract fallback node collector (Traversal) to separate class due to differing parsing logic from NPM collector)
    const hoisterResult: HoisterResult = hoist(this.transformToHoisterTree(this.productionGraph, packageName), {
      check: log.isDebugEnabled,
    })
    await this._getNodeModules(hoisterResult.dependencies, this.nodeModules)

    log.debug({ packageName, depCount: this.nodeModules.length }, "node modules collection complete")
<<<<<<< HEAD

    return { nodeModules: this.nodeModules, logSummary: this.cache.logSummary }
=======
    return this.nodeModules
>>>>>>> 850646b29 (move the manual node module traversal to the root abstract class. Add `env: { COREPACK_ENABLE_STRICT: "0", ...process.env },` to allow `npm list` to work across environments. extract fallback node collector (Traversal) to separate class due to differing parsing logic from NPM collector)
  }

  public abstract readonly installOptions: {
    manager: PM
    lockfile: string
  }

  protected abstract getArgs(): string[]
<<<<<<< HEAD
  protected abstract extractProductionDependencyGraph(tree: Dependency<ProdDepType, OptionalDepType>, dependencyId: string): Promise<void>
  protected abstract collectAllDependencies(tree: Dependency<ProdDepType, OptionalDepType>, appPackageName: string): Promise<void>

  /**
   * Retrieves the dependency tree from the package manager.
   *
   * Executes the appropriate package manager command to fetch the dependency tree and writes
   * the output to a temporary file. Includes retry logic to handle transient failures such as
   * incomplete JSON output or missing files. Will retry up to 1 time with exponential backoff.
   */
=======
  protected abstract parseDependenciesTree(jsonBlob: string): Promise<ProdDepType>
  protected abstract collectAllDependencies(tree: Dependency<ProdDepType, OptionalDepType>, appPackageName: string): Promise<void>

  protected async extractProductionDependencyGraph(tree: ProdDepType, dependencyId: string): Promise<void> {
    if (this.productionGraph[dependencyId]) {
      return
    }
    // Initialize with empty dependencies array first to mark this dependency as "in progress"
    // After initialization, if there are libraries with the same name+version later, they will not be searched recursively again
    // This will prevents infinite loops when circular dependencies are encountered.
    this.productionGraph[dependencyId] = { dependencies: [] }

    const resolvedDeps = tree.dependencies
    const collectedDependencies: string[] = []
    if (resolvedDeps && Object.keys(resolvedDeps).length > 0) {
      for (const packageName in resolvedDeps) {
        if (!this.isProdDependency(packageName, tree)) {
          continue
        }
        const dependency = resolvedDeps[packageName]
        const childDependencyId = this.packageVersionString(dependency)
        await this.extractProductionDependencyGraph(dependency, childDependencyId)
        collectedDependencies.push(childDependencyId)
      }
    }
    this.productionGraph[dependencyId] = { dependencies: collectedDependencies }
  }

>>>>>>> 850646b29 (move the manual node module traversal to the root abstract class. Add `env: { COREPACK_ENABLE_STRICT: "0", ...process.env },` to allow `npm list` to work across environments. extract fallback node collector (Traversal) to separate class due to differing parsing logic from NPM collector)
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
        const shellOutput = await _fsExtra.readFile(tempOutputFile, { encoding: "utf8" })
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

          const fileContent = await _fsExtra.readFile(tempOutputFile, { encoding: "utf8" })
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

          // Both indicate truncated/polluted PM output (a transient that re-running the command clears).
          if (error.message?.includes("Unexpected end of JSON input") || error.message?.includes("No JSON content found in output")) {
            log.debug(fields, "JSON parse error in dependency tree, retrying")
            return true
          }

          log.error(fields, "error parsing dependencies tree")
          return false
        },
      }
    )
  }

<<<<<<< HEAD
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
=======
  protected async getTreeFromWorkspaces(tree: ProdDepType, packageName: string): Promise<ProdDepType> {
    if (!(tree.workspaces && tree.dependencies)) {
      return tree
>>>>>>> 850646b29 (move the manual node module traversal to the root abstract class. Add `env: { COREPACK_ENABLE_STRICT: "0", ...process.env },` to allow `npm list` to work across environments. extract fallback node collector (Traversal) to separate class due to differing parsing logic from NPM collector)
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

<<<<<<< HEAD
  protected logMissingDependency(pkgName: string) {
    const PLATFORM_PACKAGE_RE = /(linux|win32|darwin|freebsd|android)[-_](x64|arm64|ia32|arm|ppc64|s390x|loong64|riscv64|universal)/
    const diskLogKey = PLATFORM_PACKAGE_RE.test(pkgName) ? LogMessageByKey.PKG_OPTIONAL_PLATFORM_NOT_INSTALLED : LogMessageByKey.PKG_NOT_ON_DISK
    this.cache.logSummary[diskLogKey].push(pkgName)
  }

  protected async asyncExec(command: string, args: string[], cwd: string = this.rootDir): Promise<{ stdout: string | undefined; stderr: string | undefined }> {
    const file = await this.tempDirManager.getTempFile({ prefix: "exec-", suffix: ".txt" })
    try {
      await this.streamCollectorCommandToFile(command, args, cwd, file)
      const result = await _fsExtra.readFile(file, { encoding: "utf8" })
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
   * to a file. On Windows, wraps the invocation in `powershell.exe -EncodedCommand` (UTF-16LE
   * base64) to avoid spawning `.cmd` shims directly and to eliminate shell-injection surface area.
   * Enables corepack strict mode by default but allows process.env overrides.
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
    // Derive execName from the original command so the npm-list shouldIgnore check below keys off the
    // real invocation (e.g. "npm"), not the "powershell" wrapper we spawn on Windows.
    const execName = path.basename(command, path.extname(command))

    // On Windows the package-manager command is typically a `.cmd` shim (npm.cmd/pnpm.cmd/yarn.cmd),
    // which Node can no longer spawn directly (CVE-2024-27980). Rather than spawn with `shell: true` —
    // which emits the DEP0190 "args with shell" deprecation warning and forces manual metacharacter
    // escaping — wrap the invocation in a single PowerShell `-EncodedCommand`. The base64 (UTF-16LE)
    // payload sidesteps every shell-quoting layer, and `powershell.exe` is a real executable we spawn
    // directly with no shell. See buildPowerShellEncodedArgs for the UTF-8 / exit-code handling.
    const [spawnCommand, spawnArgs] = process.platform === "win32" ? (["powershell.exe", buildPowerShellEncodedArgs(command, args)] as const) : ([command, args] as const)

    await new Promise<void>((resolve, reject) => {
      const outStream = createWriteStream(tempOutputFile)

      const child = childProcess.spawn(spawnCommand, spawnArgs, {
        cwd,
        // Package manager invocations do not need signing/publishing credentials.
        env: { COREPACK_ENABLE_STRICT: "0", ...stripSensitiveEnvVars(process.env) },
      })

      let stderr = ""
      // The process can close before all piped stdout has been flushed to disk. Resolving on the
      // child's "close" alone races the write stream and lets the caller read a TRUNCATED file
      // (manifesting as "No JSON content found in output"). Gate the settle on BOTH the child exit
      // (for the code/stderr) and the write stream's "finish" (all bytes flushed).
      let exitCode: number | null = null
      let childClosed = false
      let streamFinished = false
      let settled = false

      // `pipe` ends `outStream` when stdout EOFs, which triggers its "finish" once flushed.
      child.stdout.pipe(outStream)
      child.stderr.on("data", chunk => {
        stderr += chunk.toString()
      })

      const fail = (err: Error) => {
        if (settled) {
          return
        }
        settled = true
        // Best-effort cleanup: stop the child and close the stream so we don't
        // waste CPU writing to a broken fd after rejection.
        try {
          child.kill()
        } catch {
          // ignore
        }
        try {
          outStream.destroy()
        } catch {
          // ignore
        }
        reject(err)
      }

      const settle = () => {
        if (settled || !childClosed || !streamFinished) {
          return
        }
        const code = exitCode
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
        settled = true
        const shouldResolve = code === 0 || shouldIgnore
        return shouldResolve ? resolve() : reject(new Error(`Node module collector process exited with code ${code}:\n${stderr}`))
      }

      outStream.on("error", err => fail(new Error(`Node module collector failed writing output (${command}): ${err.message}`)))
      outStream.on("finish", () => {
        streamFinished = true
        settle()
      })
      child.on("error", err => {
        fail(new Error(`Node module collector spawn (${command} ${JSON.stringify(args)}) failed: ${err.message}`))
      })
      child.on("close", code => {
        exitCode = code
        childClosed = true
        settle()
      })
    })
  }
}

/**
 * Build the argv for invoking a Windows command through `powershell.exe -EncodedCommand`.
 *
 * Each token is wrapped in a PowerShell single-quoted string (with embedded single quotes doubled),
 * so no character is interpreted by a shell. The script:
 *   - pins `[Console]::OutputEncoding` to UTF-8 *without* a BOM so the JSON dependency tree is not
 *     corrupted by the console's OEM code page (and no BOM is prepended to break `JSON.parse`),
 *   - invokes the command via the call operator `&`,
 *   - re-emits the command's own exit code via `exit $LASTEXITCODE` (e.g. `npm list` returns 1 in
 *     expected scenarios, which the caller's shouldIgnore logic relies on).
 *
 * The whole script is base64-encoded as UTF-16LE per PowerShell's `-EncodedCommand` contract.
 */
export function buildPowerShellEncodedArgs(command: string, args: string[]): string[] {
  const psQuote = (value: string) => `'${value.replace(/'/g, "''")}'`
  const invocation = ["&", psQuote(command), ...args.map(psQuote)].join(" ")
  const script = `[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); ${invocation}; exit $LASTEXITCODE`
  const encoded = Buffer.from(script, "utf16le").toString("base64")
  return ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded]
=======
  protected isProdDependency(packageName: string, tree: ProdDepType): boolean {
    return tree.dependencies?.[packageName] != null || tree.optionalDependencies?.[packageName] != null
  }

  // ----- PROTECTED HELPERS FOR ALL COLLECTORS -----
  protected cacheKey(pkg: ProdDepType): string {
    const rel = path.relative(this.rootDir, pkg.path)
    return `${pkg.name}::${pkg.version}::${rel ?? "."}`
  }

  protected packageVersionString(pkg: Pick<ProdDepType, "name" | "version">): string {
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

  // ----------------------------------------------------------------
  // ----- PROTECTED HELPERS FOR MANUAL NODE_MODULES TRAVERSAL ------
  // ----------------------------------------------------------------

  protected async locatePackageVersion(parentDir: string, pkgName: string, requiredRange?: string): Promise<{ packageDir: string; version: string } | null> {
    // 1) check direct parent node_modules/pkgName first
    const direct = path.join(path.resolve(parentDir), "node_modules", pkgName, "package.json")
    if (await this.cache.exists[direct]) {
      const ver = await this.readPackageVersion(direct)
      if (ver && this.semverSatisfies(ver, requiredRange)) {
        return { packageDir: path.dirname(direct), version: ver }
      }
    }

    // 2) upward hoisted search, then 3) downward non-hoisted search
    return (await this.upwardSearch(parentDir, pkgName, requiredRange)) || (await this.downwardSearch(parentDir, pkgName, requiredRange)) || null
  }

  protected async readPackageVersion(pkgJsonPath: string): Promise<string | null> {
    return await this.cache.packageJson[pkgJsonPath].then(pkg => pkg.version).catch(() => null)
  }

  protected semverSatisfies(found: string, range?: string): boolean {
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
  private async upwardSearch(parentDir: string, pkgName: string, requiredRange?: string): Promise<{ packageDir: string; version: string } | null> {
    let current = path.resolve(parentDir)
    const root = path.parse(current).root
    while (true) {
      const candidate = path.join(current, "node_modules", pkgName, "package.json")
      if (await this.cache.exists[candidate]) {
        const ver = await this.readPackageVersion(candidate)
        if (ver && this.semverSatisfies(ver, requiredRange)) {
          return { packageDir: path.dirname(candidate), version: ver }
        }
        // otherwise keep searching upward (we may find a different hoisted version)
      }
      if (current === root) {
        break
      }
      const parent = path.dirname(current)
      if (parent === current) {
        break
      }
      current = parent
    }
    return null
  }

  /**
   * Breadth-first downward search from parentDir/node_modules
   * Looks for node_modules/\*\/node_modules/pkgName (and deeper)
   */
  private async downwardSearch(
    parentDir: string,
    pkgName: string,
    requiredRange?: string,
    maxExplored = 2000,
    maxDepth = 6
  ): Promise<{ packageDir: string; version: string } | null> {
    const start = path.join(path.resolve(parentDir), "node_modules")
    if (!(await this.cache.exists[start]) || !(await this.cache.lstat[start]).isDirectory()) {
      return null
    }

    const visited = new Set<string>()
    const queue: Array<{ dir: string; depth: number }> = [{ dir: start, depth: 0 }]
    let explored = 0

    while (queue.length > 0) {
      const { dir, depth } = queue.shift()!
      if (explored++ > maxExplored) {
        break
      }
      if (depth > maxDepth) {
        continue
      }
      let entries: string[]
      try {
        entries = await fs.readdir(dir)
      } catch (e) {
        continue
      }
      for (const entry of entries) {
        if (entry.startsWith(".")) {
          continue
        }
        const entryPath = path.join(dir, entry)
        // handle scoped packages @scope/name
        if (entry.startsWith("@")) {
          // queue the scope directory itself to explore its children
          if ((await this.cache.exists[entryPath]) && (await this.cache.lstat[entryPath]).isDirectory()) {
            const scopeEntries = await fs.readdir(entryPath)
            for (const sc of scopeEntries) {
              const scPath = path.join(entryPath, sc)
              // check scPath/node_modules/pkgName
              const candidatePkgJson = path.join(scPath, "node_modules", pkgName, "package.json")
              if (await this.cache.exists[candidatePkgJson]) {
                const ver = await this.readPackageVersion(candidatePkgJson)
                if (ver && this.semverSatisfies(ver, requiredRange)) {
                  return { packageDir: path.dirname(candidatePkgJson), version: ver }
                }
              }
              // enqueue scPath/node_modules to explore further
              const scNodeModules = path.join(scPath, "node_modules")
              if ((await this.cache.exists[scNodeModules]) && (await this.cache.lstat[scNodeModules]).isDirectory()) {
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
          const stat = await this.cache.lstat[entryPath]
          if (!stat.isDirectory()) {
            continue
          }
        } catch {
          continue
        }

        const candidatePkgJson = path.join(entryPath, "node_modules", pkgName, "package.json")
        if (await this.cache.exists[candidatePkgJson]) {
          const ver = await this.readPackageVersion(candidatePkgJson)
          if (ver && this.semverSatisfies(ver, requiredRange)) {
            return { packageDir: path.dirname(candidatePkgJson), version: ver }
          }
        }

        // also check entry/node_modules directly for pkgName (some layouts)
        const candidateDirect = path.join(entryPath, pkgName, "package.json")
        if (await this.cache.exists[candidateDirect]) {
          const ver = await this.readPackageVersion(candidateDirect)
          if (ver && this.semverSatisfies(ver, requiredRange)) {
            return { packageDir: path.dirname(candidateDirect), version: ver }
          }
        }

        // enqueue entry/node_modules for deeper traversal
        const nextNodeModules = path.join(entryPath, "node_modules")
        if ((await this.cache.exists[nextNodeModules]) && (await this.cache.lstat[nextNodeModules]).isDirectory()) {
          if (!visited.has(nextNodeModules)) {
            visited.add(nextNodeModules)
            queue.push({ dir: nextNodeModules, depth: depth + 1 })
          }
        }
      }
    }

    return null
  }

  // ----------------------------------------------------------------
  // ----- FANCY HELPERS FOR COMMAND EXECUTION -----
  // ----------------------------------------------------------------

  async asyncExec(command: string, args: string[], cwd: string = this.rootDir): Promise<{ stdout: string | undefined; stderr: string | undefined }> {
    const file = await this.tempDirManager.getTempFile({ prefix: "exec-", suffix: ".txt" })
    try {
      await this.streamCollectorCommandToFile(command, args, cwd, file)
      const result = await fs.readFile(file, { encoding: "utf8" })
      return { stdout: result?.trim(), stderr: undefined }
    } catch (error: any) {
      log.debug({ command, args, error: error.message }, "failed to execute command")
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
      const outStream = fsExtra.createWriteStream(tempOutputFile)

      const child = childProcess.spawn(command, args, {
        cwd,
        env: { COREPACK_ENABLE_STRICT: "0", ...process.env },
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
      // this.cancellationToken.onCancel(() => {
      //   outStream.close()
      //   child.kill("SIGINT")
      //   reject(new Error("Node module collector process was cancelled"))
      // })
    })
  }
>>>>>>> 850646b29 (move the manual node module traversal to the root abstract class. Add `env: { COREPACK_ENABLE_STRICT: "0", ...process.env },` to allow `npm list` to work across environments. extract fallback node collector (Traversal) to separate class due to differing parsing logic from NPM collector)
}
