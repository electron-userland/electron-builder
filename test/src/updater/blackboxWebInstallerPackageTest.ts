import { TmpDir } from "builder-util"
import { hashFile, WindowsUpdateInfo } from "builder-util-runtime"
import { copy, existsSync, outputFile, readFile } from "fs-extra"
import path from "path"
import { TestContext } from "vitest"
import { createLocalServer } from "../helpers/launchAppCrossPlatform"
import { readInstalledPackageType, runWindowsInstaller } from "./blackboxInstallWindows"
import { optionsForFlakyE2E } from "./blackboxUpdateHelpers"
import { appExe, buildWebInstaller, packageFileName, resetNativeInstall, storedPackage, stubName, uninstaller } from "./blackboxWebInstallerHelpers"
import { readEmbeddedUpdateConfig, readUpdateManifest } from "./signedManifestTestUtil"

// A file of its own, next to blackboxWebInstallerTest.ts: the CI sharder packs whole files and this test runs the web installer
// five times (~10 min).
describe.heavy("web installer (nsis-web) blackbox", optionsForFlakyE2E, () => {
  // A web installer built without appPackageUrl downloads <publish url>/<package file name>, which names exactly the package it was
  // built with: that download, a package next to it and a --package-file (as electron-updater passes one) must match that package.
  // Each installer run starts from a machine without an install, so the runs don't depend on each other.
  test(
    "web installer with a publish-derived package URL checks downloaded, adjacent and --package-file packages",
    { ...optionsForFlakyE2E, retry: 1 },
    async (context: TestContext) => {
      const { expect } = context
      if (process.platform !== "win32") {
        context.skip()
        return
      }

      const tmpDir = new TmpDir("web-installer-package-e2e")
      let server: import("http").Server | undefined
      const requests: Array<string> = []
      try {
        const serverRoot = await tmpDir.getTempDir({ prefix: "pkg-server" })
        let port: number
        ;({ server, port } = await createLocalServer(serverRoot, "127.0.0.1", url => requests.push(url)))
        // no trailing slash: the installer appends "/<package file name>"
        const builtDir = await buildWebInstaller(expect, tmpDir, { nsisWeb: {}, publish: { provider: "generic", url: `http://127.0.0.1:${port}` } })

        const nsisWebDir = path.join(builtDir, "nsis-web")
        const packageFile = path.join(nsisWebDir, packageFileName)
        const servedPackage = path.join(serverRoot, packageFileName)
        const sha512 = ((await readUpdateManifest(nsisWebDir)) as WindowsUpdateInfo).packages!.x64.sha512
        expect(sha512).toBe(await hashFile(packageFile))
        // unsigned: there is no publisher name to derive, and none is required (electron-builder signs with a certificate from
        // CSC_LINK / WIN_CSC_LINK when one is set, even without signedWin)
        if (!process.env.CSC_LINK && !process.env.WIN_CSC_LINK) {
          expect((await readEmbeddedUpdateConfig(builtDir)).publisherName).toBeUndefined()
        }

        /** A copy of the web installer in a directory of its own, optionally with a file named like its package next to it. */
        const webInstallerIn = async (prefix: string, adjacentPackageContent?: string) => {
          const dir = await tmpDir.getTempDir({ prefix })
          await copy(path.join(nsisWebDir, stubName), path.join(dir, stubName))
          if (adjacentPackageContent != null) {
            await outputFile(path.join(dir, packageFileName), adjacentPackageContent)
          }
          return path.join(dir, stubName)
        }
        /** The --package-file argument as electron-updater passes it; a path with whitespace would need quoting. */
        const packageFileArg = (file: string) => {
          expect(file).not.toMatch(/\s/)
          return `--package-file=${file}`
        }
        /** Runs the web installer silently on a machine without an install; asynchronously, as it downloads from this process. */
        const run = async (webInstaller: string, ...args: Array<string>) => {
          await resetNativeInstall()
          requests.length = 0
          return await runWindowsInstaller(webInstaller, ["/S", ...args])
        }
        const expectNotInstalled = () => {
          expect(existsSync(appExe)).toBe(false)
          expect(existsSync(uninstaller)).toBe(false)
          expect(existsSync(storedPackage)).toBe(false)
        }
        const expectInstalled = async () => {
          expect(existsSync(appExe)).toBe(true)
          expect(await readInstalledPackageType(appExe)).toBe("nsis-web")
          // the package is stored for differential updates
          expect(await hashFile(storedPackage)).toBe(sha512)
        }

        // A download that doesn't match the package of the installer is refused.
        await outputFile(servedPackage, "different package content")
        expect(await run(await webInstallerIn("download-other"))).toBe(2)
        expect(new Set(requests)).toEqual(new Set([`/${packageFileName}`]))
        expectNotInstalled()

        // A --package-file that doesn't match is refused as well, without downloading the package instead; the file is left as is.
        await copy(packageFile, servedPackage, { overwrite: true })
        const otherPackage = path.join(await tmpDir.getTempDir({ prefix: "other-package" }), "other.7z")
        await outputFile(otherPackage, "other package content")
        expect(await run(await webInstallerIn("explicit-other"), packageFileArg(otherPackage))).toBe(2)
        expect(requests).toEqual([])
        expectNotInstalled()
        expect(await readFile(otherPackage, "utf8")).toBe("other package content")

        // The package downloaded from <url>/<package file name> matches.
        expect(await run(await webInstallerIn("download"))).toBe(0)
        expect(new Set(requests)).toEqual(new Set([`/${packageFileName}`]))
        await expectInstalled()

        // A matching --package-file is installed under any name, without a download; the installer installs a copy of it.
        const explicitPackage = path.join(await tmpDir.getTempDir({ prefix: "explicit-package" }), "app-package.7z")
        await copy(packageFile, explicitPackage)
        expect(await run(await webInstallerIn("explicit"), packageFileArg(explicitPackage))).toBe(0)
        expect(requests).toEqual([])
        await expectInstalled()
        expect(await hashFile(explicitPackage)).toBe(sha512)

        // A file next to the installer that doesn't match its package is left in place, and the package is downloaded.
        const adjacentOther = await webInstallerIn("adjacent-other", "adjacent package content")
        expect(await run(adjacentOther)).toBe(0)
        expect(new Set(requests)).toEqual(new Set([`/${packageFileName}`]))
        await expectInstalled()
        expect(await readFile(path.join(path.dirname(adjacentOther), packageFileName), "utf8")).toBe("adjacent package content")
      } finally {
        await resetNativeInstall().catch(error => console.warn("Failed to uninstall TestApp", error))
        server?.close()
        await tmpDir.cleanup().catch(() => {})
      }
    }
  )
})
