import { getMakeNsisPath, getNsisPluginsPath } from "app-builder-lib/src/toolsets/nsis"
import { exec, spawnAndWriteWithOutput } from "builder-util"
import { createHash } from "crypto"
import * as fs from "fs/promises"
import { createServer } from "http"
import * as path from "path"

const templates = path.resolve(__dirname, "../../../packages/app-builder-lib/templates/nsis/include")
const fixture = path.resolve(__dirname, "../../fixtures/nsis-web-package-selection/installer.nsi")
const machines = ["32", "64", "ARM64"]
const cases = [
  { packages: ["ARM64"], expected: ["ARM64", "ARM64", "ARM64"] },
  { packages: ["64"], expected: ["64", "64", "64"] },
  { packages: ["32"], expected: ["32", "32", "32"] },
  { packages: ["64", "ARM64"], expected: ["64", "64", "ARM64"] },
  { packages: ["32", "ARM64"], expected: ["32", "32", "ARM64"] },
  { packages: ["32", "64"], expected: ["32", "64", "64"] },
  { packages: ["32", "64", "ARM64"], expected: ["32", "64", "ARM64"] },
]
const payload = (arch: string) => `package for ${arch}`
const hash = (arch: string) => createHash("sha512").update(payload(arch)).digest("hex").toUpperCase()

for (const { packages, expected, completeUrl } of [...cases.map(value => ({ ...value, completeUrl: false })), { ...cases[0], completeUrl: true }]) {
  test.ifWindows(`NSIS web package selection: ${packages.join(" + ")}${completeUrl ? " (complete URL)" : ""}`, async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const installer = path.join(dir, "installer.exe")
    const requests: string[] = []
    const server = createServer((req, res) => {
      requests.push(req.url!)
      const arch = /app-(32|64|ARM64)\.7z$/.exec(req.url!)?.[1]
      res.writeHead(arch != null && packages.includes(arch) ? 200 : 404)
      res.end(arch == null ? "invalid package" : payload(arch))
    })
    try {
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
      const address = server.address()
      if (address == null || typeof address === "string") {
        throw new Error("Expected a TCP server address")
      }
      const url = `http://127.0.0.1:${address.port}`
      const makensis = await getMakeNsisPath(undefined, dir)
      const plugins = await getNsisPluginsPath(undefined, dir)
      const script = [
        `!addincludedir "${templates}"`,
        `!addplugindir /x86-unicode "${path.join(plugins, "x86-unicode")}"`,
        `!define APP_PACKAGE_URL "${completeUrl ? `${url}/app-ARM64.7z` : url}"`,
        ...(completeUrl ? [] : ["!define APP_PACKAGE_URL_IS_INCOMPLETE"]),
        `!define UNINSTALLER_OUT_FILE "${fixture}"`,
        ...packages.flatMap(arch => [`!define APP_${arch}_NAME "app-${arch}.7z"`, `!define APP_${arch}_HASH "${hash(arch)}"`]),
        `OutFile "${installer}"`,
        await fs.readFile(fixture, "utf8"),
      ].join("\n")
      // Undefined package constants must fail compilation, even if the bad branch isn't taken.
      await spawnAndWriteWithOutput(makensis.path, ["-WX", "-V2", "-"], script, { env: { ...process.env, ...makensis.env } })
      const run = async (arch: string, packageFile?: string) => {
        requests.length = 0
        await fs.rm(path.join(dir, "result.txt"), { force: true })
        const args = ["/S", `--arch=${arch}`, ...(packageFile == null ? [] : [`--package-file=${packageFile}`])]
        await exec(installer, args)
        return (await fs.readFile(path.join(dir, "result.txt"), "utf8")).split("\n")
      }
      for (const [index, machine] of machines.entries()) {
        const arch = expected[index]
        const name = `app-${arch}.7z`
        const adjacent = path.join(dir, name)
        const downloaded = await run(machine)
        expect(requests).toEqual([`/${name}`])
        expect(downloaded[1]).toBe(hash(arch))
        expect(downloaded[2]).toBe(`${url}/${name}`)

        await fs.writeFile(adjacent, payload(arch))
        const local = await run(machine)
        expect(requests).toEqual([])
        expect(local[0].replace(/\\/g, "/").endsWith(`/${name}`)).toBe(true)
        expect(local[1]).toBe(hash(arch))
        await fs.writeFile(adjacent, "wrong checksum")
        await run(machine)
        expect(requests).toEqual([`/${name}`])
        await fs.rm(adjacent)
      }
      // Explicit packages bypass filename selection and checksum verification.
      const explicit = path.join(dir, "explicit.7z")
      await fs.writeFile(explicit, "user supplied package")
      const local = await run("ARM64", explicit)
      expect(requests).toEqual([])
      expect(local[0]).toBe(explicit)

      // A missing explicit file must still select the correct download independently.
      await fs.rm(explicit)
      await run("ARM64", explicit)
      expect(requests).toEqual([`/app-${expected[2]}.7z`])
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))
    }
  })
}
