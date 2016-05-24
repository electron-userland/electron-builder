import { spawn } from "child_process"
import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { copy, readJson, emptyDir, unlink, readdir, outputFile, readFileSync } from "fs-extra-p"
import { Platform } from "out/metadata"

// we set NODE_PATH in this file, so, we cannot use 'out/awaiter' path here
//noinspection JSUnusedLocalSymbols
const __awaiter = require("../../../out/awaiter")

const utilSpawn = require("../../../out/util").spawn

const downloadElectron: (options: any) => Promise<any> = BluebirdPromise.promisify(require("electron-download"))
const packager = require("../../../out/packager")

const rootDir = path.join(__dirname, "..", "..", "..")
const testPackageDir = path.join(require("os").tmpdir(), "electron_builder_published")
const testNodeModules = path.join(testPackageDir, "node_modules")

const electronVersion = "0.37.8"

async function main() {
  await BluebirdPromise.all([
    deleteOldElectronVersion(),
    downloadAllRequiredElectronVersions(),
    outputFile(path.join(testPackageDir, "package.json"), `{
      "private": true,
      "version": "1.0.0",
      "name": "test",
      "dependencies": {
        "electron-builder": "file:${path.posix.join(__dirname.replace(/\\/g, "/"), "..", "..")}"
      }
    }`)
      .then(() => copyDependencies())
  ])

  // install from cache - all dependencies are already installed before run test
  // https://github.com/npm/npm/issues/2568
  await exec("npm", ["install", "--cache-min", "999999999", "--production", rootDir])
  // prune stale packages
  await exec("npm", ["prune", "--production"])
  await runTests()
}

main()
  .catch(error => {
    console.error(error.stack || error)
    process.exit(1)
  })

async function deleteOldElectronVersion(): Promise<any> {
  if (!process.env.CI) {
    return
  }

  const cacheDir = path.join(require("os").homedir(), ".electron")
  try {
    const deletePromises: Array<Promise<any>> = []
    for (let file of (await readdir(cacheDir))) {
      if (file.endsWith(".zip") && !file.includes(electronVersion)) {
        console.log("Remove old electron " + file)
        deletePromises.push(unlink(path.join(cacheDir, file)))
      }
    }
    return await BluebirdPromise.all(deletePromises)
  }
  catch (e) {
    if (e.code === "ENOENT") {
      return []
    }
    else {
      throw e
    }
  }
}

function downloadAllRequiredElectronVersions(): Promise<any> {
  const downloadPromises: Array<Promise<any>> = []

  const platforms = packager.normalizePlatforms(["all"]).map((it: Platform) => it.nodeName)
  if (process.platform === "darwin") {
    platforms.push("mas")
  }

  for (let platform of platforms) {
    for (let arch of (platform === "mas" || platform === "darwin" ? ["x64"] : ["ia32", "x64"])) {
      downloadPromises.push(downloadElectron({
        version: electronVersion,
        arch: arch,
        platform: platform,
      }))
    }
  }
  return BluebirdPromise.all(downloadPromises)
}

// npm is very slow and not reliable - so, just copy and then prune dev dependencies
async function copyDependencies() {
  await emptyDir(testNodeModules)
  const devDeps = Object.keys((await readJson(path.join(rootDir, "package.json"), "utf-8")).devDependencies)
  const filtered = new Set()
  /*eslint prefer-const: 0*/
  for (let name of devDeps) {
    filtered.add(path.join(rootDir, "node_modules", name))
  }

  filtered.add(path.join(rootDir, "node_modules", ".bin"))

  return copy(path.join(rootDir, "node_modules"), testNodeModules, {
    filter: it => {
      if (it.includes("node_modules" + path.sep + "babel-")) {
        return false
      }
      return !filtered.has(it)
    }
  })
}

function runTests(): BluebirdPromise<any> {
  return utilSpawn(path.join(rootDir, "node_modules", ".bin", "ava"), null, {
    cwd: rootDir,
    env: Object.assign({}, process.env, {
      NODE_PATH: path.join(testNodeModules, "electron-builder"),
    }),
    shell: process.platform === "win32",
    stdio: "inherit"
  })
}

function exec(command: string, args: Array<string>) {
  return new BluebirdPromise((resolve, reject) => {
    const isPruneCommand = args != null && args.length > 0 && args[0] === "prune"
    if (command === "npm") {
      const npmExecPath = process.env.npm_execpath || process.env.NPM_CLI_JS
      if (npmExecPath != null) {
        args.unshift(npmExecPath)
        command = process.env.npm_node_execpath || process.env.NODE_EXE || "node"
      }
    }

    const effectiveOptions = {
      stdio: isPruneCommand ? ["ignore", "ignore", "inherit"] : ["ignore", "inherit", "inherit"],
      cwd: testPackageDir,
    }
    console.log(`Execute ${command} ${args.join(" ")} (cwd: ${effectiveOptions.cwd})`)
    const child = spawn(command, args, effectiveOptions)
    child.on("close", (code: number) => {
      if (code === 0) {
        resolve()
      }
      else {
        if (command === "npm") {
          try {
            console.error(readFileSync(path.join(testPackageDir, "npm-debug.log"), "utf8"))
          }
          catch (e) {
            // ignore
          }
        }

        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`))
      }
    })
    child.on("error", (error: Error) => {
      reject(new Error(`Failed to start child process: ${command} ${args.join(" ")}` + (error.stack || error)))
    })
  })
}