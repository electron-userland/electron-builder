'use strict';

const Promise = require("bluebird")
const test = require('ava-tf')
const fs = Promise.promisifyAll(require('fs-extra'))
const execFileAsync = Promise.promisify(require('child_process').execFile)
const path = require('path')

const exampleAppPath = path.join(__dirname, '..', 'example-app')
const cliPath = path.join(__dirname, 'node_modules', '.bin', 'electron-builder') + (process.platform === "win32" ? ".cmd" : "")

function exec(args) {
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
  test('Cli - osx - config file provided', async t => {
    await exec(['Example.app', '--platform=osx', '--config=builder.json'])
    t.ok(await fs.statAsync(exampleAppPath + '/Builder\ Config\ osx\ Example.dmg'), 'dmg created')
    await fs.removeAsync(exampleAppPath + '/Builder\ Config\ osx\ Example.dmg')
  })

  test('Cli - osx - no config file provided', async t => {
    await exec(['Example.app', '--platform=osx'])
    t.ok(await fs.statAsync(exampleAppPath + '/Electron\ Builder\ Example.dmg'), 'dmg created')
    await fs.removeAsync(exampleAppPath + '/Electron\ Builder\ Example.dmg')
  })
}

if (!process.env.CI || process.platform === "win32") {
  test('Cli - windows - config file provided', async (t) => {
    await exec(['Example-win32-ia32', '--platform=win', '--config=builder.json'])
    t.ok(await fs.statAsync(path.join(exampleAppPath, 'Builder\ Config\ Windows\ example\ Setup.exe')), 'exe created')
    await fs.removeAsync(path.join(exampleAppPath, 'Builder\ Config\ Windows\ example\ Setup.exe'))
  })

  test('Cli - windows - no config file provided', async t => {
    await exec(['Example-win32-ia32', '--platform=win'])
    t.ok(await fs.statAsync(path.join(exampleAppPath, 'Electron\ Builder\ Example\ Setup.exe')), 'exe created')
    await fs.removeAsync(path.join(exampleAppPath, 'Electron\ Builder\ Example\ Setup.exe'))
  })
}