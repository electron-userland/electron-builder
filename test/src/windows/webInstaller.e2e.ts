import { Arch, Platform } from "electron-builder"
import * as path from "path"
import * as fs from "fs/promises"
import { archiveContains, listArchiveEntries, listArchiveMethods, NON_DECODABLE_NSIS_FILTER } from "../helpers/archiveHelper"
import { app } from "../helpers/packTester"

// nsis-web builds: the web installer plus the *.nsis.7z app packages are built and inspected (or listed in the artifact
// snapshot incl. latest.yml). APP_PACKAGE_URL define resolution is unit-tested offline in webInstallerTest.ts.

test("web installer", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64, Arch.arm64),
      config: {
        publish: {
          provider: "s3",
          bucket: "develar",
          path: "test",
        },
        electronFuses: {
          runAsNode: true,
          enableCookieEncryption: true,
          enableNodeOptionsEnvironmentVariable: true,
          enableNodeCliInspectArguments: true,
          enableEmbeddedAsarIntegrityValidation: true,
          onlyLoadAppFromAsar: true,
          loadBrowserProcessSpecificV8Snapshot: true,
          grantFileProtocolExtraPrivileges: undefined, // unsupported on current electron version in our tests
        },
      },
    },
    {
      packed: async context => {
        // The persistent web app package (*.nsis.7z) is the one place elevate.exe must live —
        // it is injected straight into the archive, never via appOutDir (#9852). This is the
        // cross-platform positive counterpart to the win-unpacked/Squirrel "absent" assertions.
        const archives = (await fs.readdir(context.outDir, { recursive: true })).filter(f => f.endsWith(".nsis.7z"))
        expect(archives.length, "expected at least one .nsis.7z web app package").toBeGreaterThan(0)
        for (const rel of archives) {
          const archivePath = path.join(context.outDir, rel)
          expect(await archiveContains(archivePath, "resources/elevate.exe"), `${rel} must contain resources/elevate.exe`).toBe(true)

          // #9983: the install-time Nsis7z decoder silently drops entries packed with a CPU branch
          // filter it can't read (BCJ2 on x64, ARM64 on arm64) — the main exe and every native
          // binary go missing. The whole payload (x64 + arm64, plus the appended elevate.exe) must
          // use only decoder-readable codecs (plain LZMA2/Copy or the single-stream BCJ).
          const methods = await listArchiveMethods(archivePath)
          expect(methods.length, `${rel} should report codec methods`).toBeGreaterThan(0)
          for (const method of methods) {
            expect(method, `${rel} entry packed with a non-decodable branch filter: "${method}"`).not.toMatch(NON_DECODABLE_NSIS_FILTER)
          }

          // Tie "no branch filter" to the literal #9983 symptom: the payload must actually contain
          // the main app exe (a PE that would have been the first thing silently dropped), not just
          // the appended elevate.exe and the data files.
          const entries = await listArchiveEntries(archivePath)
          const appExes = entries.filter(e => e.toLowerCase().endsWith(".exe") && !e.toLowerCase().endsWith("elevate.exe"))
          expect(appExes.length, `${rel} must contain the main app exe (PE files must not be dropped); entries: ${entries.join(", ")}`).toBeGreaterThan(0)
        }
      },
    }
  ))

test("web installer (default github)", ({ expect }) =>
  app(expect, {
    targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.ia32, Arch.x64, Arch.arm64),
    config: {
      publish: {
        provider: "github",
        // test form without owner
        repo: "foo/bar",
      },
    },
  }))

test("web installer, safe name on github", ({ expect }) =>
  app(expect, {
    targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64),
    config: {
      productName: "WorkFlowy",
      publish: {
        provider: "github",
        repo: "foo/bar",
      },
      nsisWeb: {
        //tslint:disable-next-line:no-invalid-template-strings
        artifactName: "${productName}.${ext}",
      },
    },
  }))
