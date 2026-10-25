import { getMakeNsisPath, getNsisPluginsPath } from "app-builder-lib/src/toolsets/nsis"
import { exec, spawnAndWriteWithOutput } from "builder-util"
import * as fs from "fs/promises"
import * as path from "path"

const templates = path.resolve(__dirname, "../../../packages/app-builder-lib/templates/nsis")
const fixture = path.resolve(__dirname, "../../fixtures/nsis-license-page/installer.nsi")

for (const multilingual of [false, true]) {
  test.ifWindows(`assisted license pre callback${multilingual ? " (multilingual)" : ""}`, async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const installer = path.join(dir, "installer.exe")
    const license = path.join(dir, "license.txt")
    await fs.writeFile(license, "Test license")
    const makensis = await getMakeNsisPath(undefined, dir)
    const plugins = await getNsisPluginsPath(undefined, dir)
    const script = [
      `!addincludedir "${templates}"`,
      `!addincludedir "${path.join(templates, "include")}"`,
      `!addplugindir /x86-unicode "${path.join(plugins, "x86-unicode")}"`,
      `OutFile "${installer}"`,
      `!define LICENSE_FILE "${license}"`,
      ...(multilingual ? ["!define MULTILINGUAL"] : []),
      await fs.readFile(fixture, "utf8"),
    ].join("\n")
    // Compile with the real UAC plugin and global-read macro too; runtime simulates both.
    for (const defines of [[], ["!define SIMULATE_UAC"]]) {
      await spawnAndWriteWithOutput(makensis.path, ["-WX", "-V2", "-"], [...defines, script].join("\n"), { env: { ...process.env, ...makensis.env } })
    }

    // Exercise compiled MUI pre callbacks with controlled state, not real UAC or GUI navigation.
    for (const language of multilingual ? ["1033", "1031"] : ["1033"]) {
      for (const { inner, admin, updated, outerAccepted = 0 } of [
        { inner: 1, admin: 1, updated: 0, outerAccepted: 0 },
        { inner: 1, admin: 1, updated: 0, outerAccepted: 1 },
        { inner: 0, admin: 0, updated: 0 },
        { inner: 0, admin: 1, updated: 0 },
        { inner: 0, admin: 0, updated: 1 },
        { inner: 1, admin: 1, updated: 1 },
      ]) {
        for (const page of ["license", "directory"]) {
          const result = path.join(dir, "result.txt")
          await fs.rm(result, { force: true })
          await exec(
            installer,
            ["/S", `--inner=${inner}`, `--admin=${admin}`, `--updated=${updated}`, `--outer-accepted=${outerAccepted}`, `--language=${language}`, `--page=${page}`],
            { timeout: 30_000 }
          )
          expect(await fs.readFile(result, "utf8"), `${page}: inner=${inner}, admin=${admin}, updated=${updated}, outerAccepted=${outerAccepted}, language=${language}`).toBe(
            updated || (page === "license" && inner && outerAccepted) ? "skipped" : "shown"
          )
        }
      }

      // The actual outer MUI LEAVE must set the flag, without losing a user's callback.
      const outerResult = path.join(dir, "result.txt")
      await fs.rm(outerResult, { force: true })
      await exec(installer, ["--inner=0", "--admin=0", "--updated=0", `--language=${language}`, "--page=navigation"], { timeout: 30_000 })
      expect(await fs.readFile(outerResult, "utf8"), `Outer acceptance: language=${language}`).toBe(
        "license\r\naccepted=1,customLeave=1\r\ndirectory\r\nlicense\r\naccepted=1,customLeave=1\r\ndirectory\r\nclosed\r\n"
      )

      // Real (non-silent) NSIS page loops, with simulated UAC state/outer globals.
      // No elevation or installation. Back must revisit the license in both cases.
      for (const outerAccepted of [0, 1]) {
        const result = path.join(dir, "result.txt")
        await fs.rm(result, { force: true })
        await exec(installer, ["--inner=1", "--admin=1", "--updated=0", `--outer-accepted=${outerAccepted}`, `--language=${language}`, "--page=navigation"], { timeout: 30_000 })
        expect(await fs.readFile(result, "utf8"), `Back: outerAccepted=${outerAccepted}, language=${language}`).toBe(
          `${outerAccepted ? "" : "license\r\n"}directory\r\nlicense\r\ndirectory\r\nclosed\r\n`
        )
      }
    }
  })
}
