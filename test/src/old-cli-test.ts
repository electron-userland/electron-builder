import { Promise as BluebirdPromise } from "bluebird"
import test from "./helpers/avaEx"
import { stat, remove } from "fs-extra-p"
const execFileAsync: (path: string, args: Array<string>, options?: any) => Promise<any> = BluebirdPromise.promisify(require("child_process").execFile)
import * as path from "path"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

const exampleAppPath = path.join(__dirname,  "..", "..", "example-app")
const cliPath = path.join(process.env.NODE_PATH, "..", ".bin", "electron-builder") + (process.platform === "win32" ? ".cmd" : "")

function exec(args: Array<string>): Promise<any> {
  return execFileAsync(cliPath, args, {
    cwd: exampleAppPath,
    shell: process.platform === "win32"
  })
}

test('Cli - no input', t => {
  t.throws(exec([]), /Path to electron app not provided/)
})

test('Cli - config file provided but not found', t => {
  t.throws(exec(['Example.app', '--platform=osx', '--config=no-builder.json']), /Could not load config file/)
})

if (process.platform === "darwin") {
  test('Cli - osx - config file provided', async (t) => {
    await exec(['Example.app', '--platform=osx', '--config=builder.json'])
    t.ok(await stat(exampleAppPath + '/Builder\ Config\ osx\ Example.dmg'), 'dmg created')
    await remove(exampleAppPath + '/Builder\ Config\ osx\ Example.dmg')
  })

  test('Cli - osx - no config file provided', async (t) => {
    await exec(['Example.app', '--platform=osx'])
    t.ok(await stat(exampleAppPath + '/Electron\ Builder\ Example.dmg'), 'dmg created')
    await remove(exampleAppPath + '/Electron\ Builder\ Example.dmg')
  })
}

if (!process.env.CI || process.platform === "win32") {
  test.serial('Cli - windows - config file provided', async (t) => {
    await exec(['Example-win32-ia32', '--platform=win', '--config=builder.json'])
    t.ok(await stat(path.join(exampleAppPath, 'Builder\ Config\ Windows\ example\ Setup.exe')), 'exe created')
    await remove(path.join(exampleAppPath, 'Builder\ Config\ Windows\ example\ Setup.exe'))
  })

  test.serial('Cli - windows - no config file provided', async (t) => {
    await exec(['Example-win32-ia32', '--platform=win'])
    t.ok(await stat(path.join(exampleAppPath, 'Electron\ Builder\ Example\ Setup.exe')), 'exe created')
    await remove(path.join(exampleAppPath, 'Electron\ Builder\ Example\ Setup.exe'))
  })
}