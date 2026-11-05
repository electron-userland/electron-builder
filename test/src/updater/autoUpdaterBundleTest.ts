import { spawnSync } from "child_process"
import { mkdir, writeFile } from "fs/promises"
import * as path from "path"
import { build, type Plugin } from "vite"
import { describe, expect, test } from "vitest"

// Apps commonly bundle their Electron main process (Vite/Rollup, esbuild) with electron-updater inlined. The
// `autoUpdater` export must still find its platform updater inside the bundle, and loading the bundle must not
// depend on `import.meta.url`, which esbuild leaves empty in a CommonJS bundle.

const PACKAGES_DIR = path.resolve(__dirname, "../../../packages")
const toPosix = (file: string) => file.replace(/\\/g, "/")

// Electron resolves "electron" to its built-in API from any base directory. Emulate that in plain Node with a stub of
// what the updater constructors touch, and fake process.platform so doLoadAutoUpdater picks each platform's updater. On Linux it
// reads the package type from resources/package-type, which the preload points at a directory of the test.
const PRELOAD = `
const Module = require("node:module")
const { EventEmitter } = require("node:events")
Object.defineProperty(process, "platform", { value: process.env.FAKE_PLATFORM })
process.resourcesPath = process.env.FAKE_RESOURCES_PATH
const app = Object.assign(new EventEmitter(), {
  whenReady: () => Promise.resolve(), getVersion: () => "1.0.0", getName: () => "bundled-app", getAppPath: () => __dirname,
  getPath: () => __dirname, isPackaged: false, quit() {}, relaunch() {},
})
const electron = {
  app, autoUpdater: new EventEmitter(), powerMonitor: new EventEmitter(), BrowserWindow: { getAllWindows: () => [] },
  session: { fromPartition: () => ({}) }, net: {}, Notification: class {},
}
const load = Module._load
Module._load = function (request, ...args) {
  return request === "electron" ? electron : load.call(this, request, ...args)
}
`

const ENTRY = `
import { autoUpdater } from ${JSON.stringify(toPosix(path.join(PACKAGES_DIR, "electron-updater/src/index.ts")))}
console.log("UPDATER=" + autoUpdater.constructor.name)
`

// esbuild --format=cjs replaces import.meta with an empty object
const emptyImportMeta: Plugin = {
  name: "empty-import-meta",
  transform: code => (code.includes("import.meta.url") ? code.replaceAll("import.meta.url", "undefined") : null),
}

const bundles = [
  { name: "CommonJS bundle", format: "cjs", file: "main.cjs", plugins: [] },
  { name: "ES module bundle", format: "es", file: "main.mjs", plugins: [] },
  { name: "CommonJS bundle without import.meta.url", format: "cjs", file: "main.cjs", plugins: [emptyImportMeta] },
] as const

// the package type is written to resources/package-type for the deb, rpm and pacman targets; an AppImage has none
const expectedUpdaters = [
  ["win32", null, "NsisUpdater"],
  ["darwin", null, "MacUpdater"],
  ["linux", null, "AppImageUpdater"],
  ["linux", "deb", "DebUpdater"],
  ["linux", "rpm", "RpmUpdater"],
  ["linux", "pacman", "PacmanUpdater"],
] as const

describe("autoUpdater inlined into a bundled main process", () => {
  for (const bundle of bundles) {
    test(bundle.name, { timeout: 120_000 }, async context => {
      const dir = await context.tmpDir.createTempDir()
      const preloadFile = path.join(dir, "preload.cjs")
      await writeFile(preloadFile, PRELOAD)
      await writeFile(path.join(dir, "entry.mjs"), ENTRY)

      await build({
        configFile: false,
        root: dir,
        logLevel: "silent",
        plugins: [...bundle.plugins],
        resolve: {
          alias: [
            { find: /^builder-util-runtime\/internal$/, replacement: path.join(PACKAGES_DIR, "builder-util-runtime/src/indexInternal.ts") },
            { find: /^builder-util-runtime$/, replacement: path.join(PACKAGES_DIR, "builder-util-runtime/src/index.ts") },
          ],
        },
        build: {
          ssr: "entry.mjs",
          outDir: "out",
          target: "node22",
          minify: false,
          rollupOptions: {
            external: ["electron"],
            // the sources re-export interfaces without `export type`, which tsc erases but Rollup sees as missing
            shimMissingExports: true,
            output: { format: bundle.format, entryFileNames: bundle.file },
          },
        },
        ssr: { noExternal: true, target: "node" },
      })

      for (const [platform, packageType, updater] of expectedUpdaters) {
        const resourcesPath = path.join(dir, "resources", packageType ?? "none")
        await mkdir(resourcesPath, { recursive: true })
        if (packageType != null) {
          await writeFile(path.join(resourcesPath, "package-type"), packageType)
        }
        const result = spawnSync(process.execPath, ["--require", preloadFile, path.join(dir, "out", bundle.file)], {
          env: { ...process.env, FAKE_PLATFORM: platform, FAKE_RESOURCES_PATH: resourcesPath },
          encoding: "utf8",
        })
        expect({ platform, packageType, status: result.status, output: result.stdout + result.stderr }).toMatchObject({
          status: 0,
          output: expect.stringMatching(new RegExp(`^UPDATER=.*${updater}`, "m")),
        })
      }
    })
  }
})
