import * as path from "path"
import BluebirdPromise from "bluebird-lst-c"
import { emptyDir, readdir, unlink, removeSync } from "fs-extra-p"
import { cpus, homedir } from "os"
import { TEST_DIR, ELECTRON_VERSION } from "./config"

// we set NODE_PATH in this file, so, we cannot use 'out/awaiter' path here
const util = require("../../../out/util/util")
const utilSpawn = util.spawn
const isEmptyOrSpaces = util.isEmptyOrSpaces

const downloadElectron: (options: any) => Promise<any> = BluebirdPromise.promisify(require("electron-download"))

const rootDir = path.join(__dirname, "..", "..", "..")

async function main() {
  const testDir = TEST_DIR
  await BluebirdPromise.all([
    deleteOldElectronVersion(),
    downloadAllRequiredElectronVersions(),
    emptyDir(testDir),
  ])

  process.on("SIGINT", () => {
    removeSync(testDir)
  })
  try {
    await runTests()
  }
  finally {
    removeSync(testDir)
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

  const platforms = process.platform === "win32" ? ["win32"] : ["darwin", "linux", "win32"]
  if (process.platform === "darwin") {
    platforms.push("mas")
  }

  for (let platform of platforms) {
    const archs = (platform === "mas" || platform === "darwin") ? ["x64"] : (platform === "win32" ? ["ia32", "x64"] : ["ia32", "x64", "armv7l"])
    for (let arch of archs) {
      downloadPromises.push(downloadElectron({
        version: ELECTRON_VERSION,
        arch: arch,
        platform: platform,
      }))
    }
  }
  return BluebirdPromise.all(downloadPromises)
}

/**
 * CIRCLE_NODE_INDEX=2 — test nodejs 4 (on Circle).
 */
function runTests(): BluebirdPromise<any> {
  const args: Array<string> = []
  const testFiles = process.env.TEST_FILES

  args.push(`--concurrency=${cpus().length}`)

  if (process.env.FAIL_FAST === "true") {
    args.push("--fail-fast")
  }

  const baseDir = path.join("test", "out")
  const baseForLinuxTests = [path.join(baseDir, "ArtifactPublisherTest.js"), path.join(baseDir, "httpRequestTest.js"), path.join(baseDir, "RepoSlugTest.js")]
  let skipWin = false
  if (!isEmptyOrSpaces(testFiles)) {
    args.push(...testFiles.split(",").map((it: string) => path.join(baseDir, it.trim() + ".js")))
    if (process.platform === "linux") {
      // test it only on Linux in any case
      args.push(...baseForLinuxTests)
    }
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
    args.push("test/out/*.js", "!test/out/httpRequestTest.js")
  }

  console.log(args)
  return utilSpawn(path.join(rootDir, "node_modules", ".bin", "ava"), args, {
    cwd: rootDir,
    env: Object.assign({}, process.env, {
      NODE_PATH: rootDir,
      SKIP_WIN: skipWin,
      CSC_IDENTITY_AUTO_DISCOVERY: "false",
      TEST_DIR: TEST_DIR,
    }),
    shell: process.platform === "win32",
    stdio: "inherit"
  })
}
