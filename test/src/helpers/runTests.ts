import { spawn } from "child_process"
import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { copy, emptyDir, outputFile, readdir, readFileSync, readJson, unlink, remove } from "fs-extra-p"
import { Platform } from "out/metadata"
import { cpus, homedir, tmpdir } from "os"
import { TEST_DIR, ELECTRON_VERSION } from "./config"

// we set NODE_PATH in this file, so, we cannot use 'out/awaiter' path here
//noinspection JSUnusedLocalSymbols
const __awaiter = require("../../../out/util/awaiter")

const util = require("../../../out/util/util")
const utilSpawn = util.spawn
const isEmptyOrSpaces = util.isEmptyOrSpaces

const downloadElectron: (options: any) => Promise<any> = BluebirdPromise.promisify(require("electron-download"))
const packager = require("../../../out/packager")

const rootDir = path.join(__dirname, "..", "..", "..")
const testPackageDir = path.join(tmpdir(), "electron_builder_published")
const testNodeModules = path.join(testPackageDir, "node_modules")

async function main() {
  await BluebirdPromise.all([
    deleteOldElectronVersion(),
    downloadAllRequiredElectronVersions(),
    emptyDir(TEST_DIR),
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
  await exec(["install", "--cache-min", "999999999", "--production", rootDir])
  // prune stale packages
  await exec(["prune", "--production"])
  try {
    await runTests()
  }
  finally {
    await remove(TEST_DIR)
  }
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

  const cacheDir = path.join(homedir(), ".electron")
  try {
    const deletePromises: Array<Promise<any>> = []
    for (let file of (await readdir(cacheDir))) {
      if (file.endsWith(".zip") && !file.includes(ELECTRON_VERSION)) {
        console.log(`Remove old electron ${file}`)
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
        version: ELECTRON_VERSION,
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

/**
 * CIRCLE_NODE_INDEX=2 — test nodejs 4 (on Circle).
 */
function runTests(): BluebirdPromise<any> {
  const args: Array<string> = []
  const testFiles = process.env.TEST_FILES

  args.push(`--concurrency=${cpus().length}`)

  const baseDir = path.join("test", "out")
  const baseForLinuxTests = [path.join(baseDir, "ArtifactPublisherTest.js"), path.join(baseDir, "httpRequestTest.js"), path.join(baseDir, "RepoSlugTest.js")]
  let skipWin = false
  if (!isEmptyOrSpaces(testFiles)) {
    args.push(...testFiles.split(",").map((it: string) => path.join(baseDir, it.trim() + ".js")))
    if (process.platform === "linux") {
      // test it only on Linux in any case
      args.push(...baseForLinuxTests)
    }

    console.log(`Test files: ${args.join(", ")}`)
  }
  else if (!isEmptyOrSpaces(process.env.CIRCLE_NODE_INDEX)) {
    const circleNodeIndex = parseInt(process.env.CIRCLE_NODE_INDEX, 10)
    if (circleNodeIndex === 0 || circleNodeIndex === 2) {
      skipWin = true
      args.push(path.join(baseDir, "linuxPackagerTest.js"), path.join(baseDir, "BuildTest.js"), path.join(baseDir, "globTest.js"))
    }
    else {
      args.push(path.join(baseDir, "winPackagerTest.js"), path.join(baseDir, "nsisTest.js"), path.join(baseDir, "macPackagerTest.js"))
      args.push(...baseForLinuxTests)
    }
    console.log(`Test files for node ${circleNodeIndex}: ${args.join(", ")}`)
  }
  else if (process.platform === "win32") {
    args.push("test/out/*.js", "!test/out/macPackagerTest.js", "!test/out/linuxPackagerTest.js", "!test/out/CodeSignTest.js", "!test/out/ArtifactPublisherTest.js", "!test/out/httpRequestTest.js")
  }
  else if (!util.isCi()) {
    args.push("test/out/*.js", "!test/out/ArtifactPublisherTest.js", "!test/out/httpRequestTest.js")
  }

  return utilSpawn(path.join(rootDir, "node_modules", ".bin", "ava"), args, {
    cwd: rootDir,
    env: Object.assign({}, process.env, {
      NODE_PATH: path.join(testNodeModules, "electron-builder"),
      SKIP_WIN: skipWin,
      CSC_IDENTITY_AUTO_DISCOVERY: "false",
    }),
    shell: process.platform === "win32",
    stdio: "inherit"
  })
}

function exec(args: Array<string>) {
  return new BluebirdPromise((resolve, reject) => {
    let command = "npm"
    const npmExecPath = process.env.npm_execpath || process.env.NPM_CLI_JS
    if (npmExecPath != null) {
      args.unshift(npmExecPath)
      command = process.env.npm_node_execpath || process.env.NODE_EXE || "node"
    }

    const effectiveOptions = {
      stdio: ["ignore", "ignore", "inherit"],
      cwd: testPackageDir,
    }
    // console.log(`Execute ${command} ${args.join(" ")} (cwd: ${effectiveOptions.cwd})`)
    const child = spawn(command, args, effectiveOptions)
    child.on("close", (code: number) => {
      if (code === 0) {
        resolve()
      }
      else {
        try {
          console.error(readFileSync(path.join(testPackageDir, "npm-debug.log"), "utf8"))
        }
        catch (e) {
          // ignore
        }
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`))
      }
    })
    child.on("error", (error: Error) => {
      reject(new Error(`Failed to start child process: ${command} ${args.join(" ")}` + (error.stack || error)))
    })
  })
}