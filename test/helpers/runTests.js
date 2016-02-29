"use strict"

const childProcess = require("child_process")
const path = require("path")
const Promise = require("bluebird")
const fs = Promise.promisifyAll(require("fs-extra"))
const readText = require("../../out/promisifed-fs").readText
const downloadElectron = Promise.promisify(require("electron-download"))
const packager = require("../../out/packager")

const rootDir = path.join(__dirname, "..", "..")
const testPackageDir = path.join(require("os").tmpdir(), "electron_builder_published")
const testNodeModules = path.join(testPackageDir, "node_modules")

const electronVersion = "0.36.9"

Promise.all([
    deleteOldElectronVersion(),
    downloadAllRequiredElectronVersions(),
    fs.outputFileAsync(path.join(testPackageDir, "package.json"), `{
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
    console.error(error)
    process.exit(1)
  })

function deleteOldElectronVersion() {
  if (process.env.CI) {
    const cacheDir = path.join(require("os").homedir(), ".electron")
    return fs.readdirAsync(cacheDir)
      .catch(error => {
        if (error.code === "ENOENT") {
          return []
        }
        else {
          throw error
        }
      })
      .then(it => {
        const deletePromises = []
        for (let file of it) {
          if (file.endsWith(".zip") && !file.includes(electronVersion)) {
            console.log("Remove old electron " + file)
            deletePromises.push(fs.unlinkAsync(path.join(cacheDir, file)))
          }
        }
        return Promise.all(deletePromises)
      })
  }
  else {
    return Promise.resolve()
  }
}

function downloadAllRequiredElectronVersions() {
  const downloadPromises = []
  for (let platform of packager.normalizePlatforms(["all"])) {
    for (let arch of packager.normalizeArchs(platform)) {
      downloadPromises.push(downloadElectron({
        version: electronVersion,
        arch: arch,
        platform: platform,
      }))
    }
  }
  return Promise.all(downloadPromises)
}

function copyDependencies() {
// npm is very slow and not reliable - so, just copy and then prune dev dependencies
  return fs.emptyDirAsync(testNodeModules)
    .then(() => readText(path.join(rootDir, "package.json")))
    .then(it => {
      const devDeps = Object.keys(JSON.parse(it).devDependencies)
      const filtered = new Set()
      /*eslint prefer-const: 0*/
      for (let name of devDeps) {
        filtered.add(path.join(rootDir, "node_modules", name))
      }

      filtered.add(path.join(rootDir, "node_modules", ".bin"))

      return fs.copyAsync(path.join(rootDir, "node_modules"), testNodeModules, {
        filter: it => {
          if (it.includes("node_modules" + path.sep + "babel-")) {
            return false
          }
          return !filtered.has(it)
        }
      })
    })
}

function install() {
// install from cache - all dependencies are already installed before run test
// https://github.com/npm/npm/issues/2568
  spawn("npm", ["install", "--cache-min", "999999999", "--production", rootDir], () => {
    // prune stale packages
    spawn("npm", ["prune", "--production"], () => {
      runTests()
    })
  })
}

function runTests() {
  spawn("npm", ["run", "test-" + (process.platform === "win32" ? "win" : "nix")], () => {
  }, {
    cwd: path.join(__dirname, "..", ".."),
    env: Object.assign({}, process.env, {
      NODE_PATH: path.join(testNodeModules, "electron-builder"),
      BABEL_ENV: "test",
    })
  })
}

function spawn(command, args, callback, options) {
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
  const child = childProcess.spawn(command, args, effectiveOptions)
  child.on("close", code => {
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
  child.on("error", error => {
    console.error(`Failed to start child process: ${command} ${args.join(" ")}` + (error.stack || error))
    process.exit(1)
  })
}