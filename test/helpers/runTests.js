const childProcess = require("child_process")
const path = require("path")
const fs = require("bluebird").promisifyAll(require("fs-extra"))

const testPackageDir = path.join(__dirname, "..")

// npm is very slow and not reliable - so, just copy and then prune dev dependencies
const dest = path.join(testPackageDir, "node_modules")
fs.emptyDirAsync(dest)
  .then(() => fs.copyAsync(path.join(testPackageDir, "..", "node_modules"), dest))
  .then(() => install())
  .catch(error => {
    console.error(error)
    process.exit(1)
  })

function install() {
// install from cache - all dependencies are already installed before run test
// https://github.com/npm/npm/issues/2568
  spawn("npm", ["install", "--cache-min", "999999999", "--production", path.join(testPackageDir, "..")], () => {
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
      NODE_PATH: path.join(testPackageDir, "node_modules")
    })
  })
}

function spawn(command, args, callback, options) {
  if (command == "npm") {
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