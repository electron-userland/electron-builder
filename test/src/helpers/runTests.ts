import { spawn } from "child_process"
import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import * as fs from "fs-extra-p"

// we set NODE_PATH in this file, so, we cannot use 'out/awaiter' path here
//noinspection JSUnusedLocalSymbols
const __awaiter = require("../../../out/awaiter")

const downloadElectron: (options: any) => Promise<any> = BluebirdPromise.promisify(require("electron-download"))
const packager = require("../../../out/packager")

const rootDir = path.join(__dirname, "..", "..", "..")
const testPackageDir = path.join(require("os").tmpdir(), "electron_builder_published")
const testNodeModules = path.join(testPackageDir, "node_modules")

const electronVersion = "0.36.10"

BluebirdPromise.all([
    deleteOldElectronVersion(),
    downloadAllRequiredElectronVersions(),
    fs.outputFile(path.join(testPackageDir, "package.json"), `{
    "private": true,
    "version": "1.0.0",
    "name": "test",
    "dependencies": {
      "electron-builder": "file:${path.posix.join(__dirname.replace(/\\/g, "/"), "..", "..")}"
    }
  }`)
      .then(() => copyDependencies())
  ])
  .then(() => install())
  .catch(error => {
    console.error(error.stack || error)
    process.exit(1)
  })

function deleteOldElectronVersion(): Promise<any> {
  if (process.env.CI) {
    const cacheDir = path.join(require("os").homedir(), ".electron")
    return fs.readdir(cacheDir)
      .catch(error => {
        if (error.code === "ENOENT") {
          return []
        }
        else {
          throw error
        }
      })
      .then(it => {
        const deletePromises: Array<Promise<any>> = []
        for (let file of it) {
          if (file.endsWith(".zip") && !file.includes(electronVersion)) {
            console.log("Remove old electron " + file)
            deletePromises.push(fs.unlink(path.join(cacheDir, file)))
          }
        }
        return BluebirdPromise.all(deletePromises)
      })
  }
  else {
    return BluebirdPromise.resolve()
  }
}

function downloadAllRequiredElectronVersions(): Promise<any> {
  const downloadPromises: Array<Promise<any>> = []
  for (let platform of packager.normalizePlatforms(["all"])) {
    for (let arch of packager.normalizeArchs(platform)) {
      downloadPromises.push(downloadElectron({
        version: electronVersion,
        arch: arch,
        platform: platform,
      }))
    }
  }
  return BluebirdPromise.all(downloadPromises)
}

function copyDependencies() {
// npm is very slow and not reliable - so, just copy and then prune dev dependencies
  return fs.emptyDir(testNodeModules)
    .then(() => fs.readJson(path.join(rootDir, "package.json"), "utf-8"))
    .then((it: any) => {
      const devDeps = Object.keys(it.devDependencies)
      const filtered = new Set()
      /*eslint prefer-const: 0*/
      for (let name of devDeps) {
        filtered.add(path.join(rootDir, "node_modules", name))
      }

      filtered.add(path.join(rootDir, "node_modules", ".bin"))

      return fs.copy(path.join(rootDir, "node_modules"), testNodeModules, {
        filter: it => {
          if (it.includes("node_modules" + path.sep + "babel-")) {
            return false
          }
          return !filtered.has(it)
        }
      })
    })
}

function install(): void {
// install from cache - all dependencies are already installed before run test
// https://github.com/npm/npm/issues/2568
  exec("npm", ["install", "--cache-min", "999999999", "--production", rootDir], () => {
    // prune stale packages
    exec("npm", ["prune", "--production"], () => {
      runTests()
    })
  })
}

function runTests(): void {
  exec("npm", ["run", "test-" + (process.platform === "win32" ? "win" : "nix")], () => {
  }, {
    cwd: path.join(__dirname, "..", ".."),
    env: Object.assign({}, process.env, {
      NODE_PATH: path.join(testNodeModules, "electron-builder"),
      TEST_MODE: "true",
    })
  })
}

function exec(command: string, args: Array<string>, callback: () => void, options?: any) {
  if (command === "npm") {
    const npmExecPath = process.env.npm_execpath || process.env.NPM_CLI_JS
    if (npmExecPath != null) {
      args.unshift(npmExecPath)
      command = process.env.npm_node_execpath || process.env.NODE_EXE || "node"
    }
  }

  const effectiveOptions = Object.assign({
    stdio: "inherit",
    cwd: testPackageDir,
  }, options)
  console.log("Execute " + command + " " + args.join(" ") + " (cwd: " + effectiveOptions.cwd + ")")
  const child = spawn(command, args, effectiveOptions)
  child.on("close", (code: number) => {
    if (code === 0) {
      callback()
    }
    else {
      console.error(`${command} ${args.join(" ")} exited with code ${code}`)

      if (command === "npm") {
        try {
          console.error(fs.readFileSync(path.join(testPackageDir, "npm-debug.log"), "utf8"))
        }
        catch (e) {
          // ignore
        }
      }

      process.exit(1)
    }
  })
  child.on("error", (error: Error) => {
    console.error(`Failed to start child process: ${command} ${args.join(" ")}` + (error.stack || error))
    process.exit(1)
  })
}