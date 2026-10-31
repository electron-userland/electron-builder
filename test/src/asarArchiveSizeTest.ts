import { readFile, appendFile } from "fs/promises"
import * as path from "path"
import { appThrows, linuxDirTarget, modifyPackageJson } from "./helpers/packTester.js"

// electron-userland/electron-builder#10443: `statFile` reads only the header, so bytes after the last packed file passed the sanity check.
test.ifNotWindows("a packed app.asar longer than its header describes fails the sanity check", ({ expect }) =>
  appThrows(
    expect,
    {
      targets: linuxDirTarget,
      config: {
        // the packager neither installs nor rebuilds dependencies (packager.ts: a `false` from beforeBuild means node_modules is handled externally)
        beforeBuild: async () => false,
        afterPack: async context => {
          await appendFile(path.join(context.appOutDir, "resources", "app.asar"), Buffer.alloc(2482))
        },
      },
    },
    {
      // the repo's own pinned package manager, so Corepack uses the pnpm version the repo already has
      projectDirCreated: async projectDir => {
        const { packageManager } = JSON.parse(await readFile(path.join(__dirname, "..", "..", "package.json"), "utf8"))
        await modifyPackageJson(projectDir, data => {
          data.packageManager = packageManager
        })
      },
    },
    error => {
      expect(error.message).toMatch(/is corrupted: the header describes an archive of \d+ bytes, but it is \d+ bytes/)
    }
  )
)
