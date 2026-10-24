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
    // Compile once with the real UAC plugin too; runtime cases below only replace state detection.
    for (const defines of [[], ["!define SIMULATE_UAC"]]) {
      await spawnAndWriteWithOutput(makensis.path, ["-WX", "-V2", "-"], [...defines, script].join("\n"), { env: { ...process.env, ...makensis.env } })
    }

    // Exercise compiled MUI pre callbacks with controlled state, not real UAC or GUI navigation.
    for (const language of multilingual ? ["1033", "1031"] : ["1033"]) {
      for (const { inner, admin, updated } of [
        { inner: 1, admin: 1, updated: 0 },
        { inner: 0, admin: 0, updated: 0 },
        { inner: 0, admin: 1, updated: 0 },
        { inner: 0, admin: 0, updated: 1 },
        { inner: 1, admin: 1, updated: 1 },
      ]) {
        for (const page of ["license", "directory"]) {
          const result = path.join(dir, "result.txt")
          await fs.rm(result, { force: true })
          await exec(installer, ["/S", `--inner=${inner}`, `--admin=${admin}`, `--updated=${updated}`, `--language=${language}`, `--page=${page}`], { timeout: 30_000 })
          expect(await fs.readFile(result, "utf8"), `${page}: inner=${inner}, admin=${admin}, updated=${updated}, language=${language}`).toBe(
            updated || (page === "license" && inner) ? "skipped" : "shown"
          )
        }
      }

      // A real (non-silent) NSIS wizard: initial license skipped, directory -> Back
      // -> license -> Next -> directory -> Quit. No elevation or installation.
      const result = path.join(dir, "result.txt")
      await fs.rm(result, { force: true })
      await exec(installer, ["--inner=1", "--admin=1", "--updated=0", `--language=${language}`, "--page=navigation"], { timeout: 30_000 })
      expect(await fs.readFile(result, "utf8"), `Back must revisit the license: language=${language}`).toBe("directory\r\nlicense\r\ndirectory\r\nclosed\r\n")
    }
  })
}
