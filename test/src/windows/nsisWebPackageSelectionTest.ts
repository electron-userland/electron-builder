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

async function compile(dir: string, packages: string[], defines: string[], args = ["-WX", "-V2"]): Promise<{ installer: string; stdout: string }> {
  const installer = path.join(dir, "installer.exe")
  const makensis = await getMakeNsisPath(undefined, dir)
  const plugins = await getNsisPluginsPath(undefined, dir)
  const script = [
    `!addincludedir "${templates}"`,
    `!addplugindir /x86-unicode "${path.join(plugins, "x86-unicode")}"`,
    ...defines,
    `!define UNINSTALLER_OUT_FILE "${fixture}"`,
    ...packages.flatMap(arch => [`!define APP_${arch}_NAME "app-${arch}.7z"`, `!define APP_${arch}_HASH "${hash(arch)}"`]),
    `OutFile "${installer}"`,
    await fs.readFile(fixture, "utf8"),
  ].join("\n")
  // With -WX (the default), undefined package constants must fail compilation, even if the bad branch isn't taken.
  const { stdout } = await spawnAndWriteWithOutput(makensis.path, [...args, "-"], script, { env: { ...process.env, ...makensis.env } })
  return { installer, stdout }
}

// Package verification branches (explicit --package-file, versioned download) must compile warning-free in every configuration,
// and are checked on every OS in the preprocessed script: the explicit package check unless unverified packages are allowed, the
// download check only for a versioned URL.
for (const incomplete of [false, true]) {
  for (const allowUnverified of [false, true]) {
    test(`NSIS web package verification compiles: ${incomplete ? "versioned" : "complete"} URL${allowUnverified ? ", unverified allowed" : ""}`, async ({ expect, tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const packages = ["32", "64", "ARM64"]
      const defines = [
        `!define APP_PACKAGE_URL "http://127.0.0.1/app.7z"`,
        ...(incomplete ? ["!define APP_PACKAGE_URL_IS_INCOMPLETE"] : []),
        ...(allowUnverified ? ["!define ALLOW_UNVERIFIED_APP_PACKAGE"] : []),
      ]
      await compile(dir, packages, defines)
      const { stdout } = await compile(dir, packages, defines, ["-PPO"])
      expect(stdout.includes("doesn't match any package of this installer")).toBe(!allowUnverified)
      expect(stdout.includes("doesn't match this installer")).toBe(incomplete && !allowUnverified)
    })
  }
}

for (const { packages, expected, completeUrl, allowUnverified } of [
  ...cases.map(value => ({ ...value, completeUrl: false, allowUnverified: false })),
  { ...cases[0], completeUrl: true, allowUnverified: false },
  { ...cases[cases.length - 1], completeUrl: false, allowUnverified: true },
]) {
  const suffix = `${completeUrl ? " (complete URL)" : ""}${allowUnverified ? " (unverified allowed)" : ""}`
  test.ifWindows(`NSIS web package selection: ${packages.join(" + ")}${suffix}`, async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const requests: string[] = []
    let mismatched = false
    const server = createServer((req, res) => {
      requests.push(req.url!)
      const arch = /app-(32|64|ARM64)\.7z$/.exec(req.url!)?.[1]
      res.writeHead(arch != null && packages.includes(arch) ? 200 : 404)
      res.end(arch == null ? "invalid package" : mismatched ? "different package" : payload(arch))
    })
    try {
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
      const address = server.address()
      if (address == null || typeof address === "string") {
        throw new Error("Expected a TCP server address")
      }
      const url = `http://127.0.0.1:${address.port}`
      const { installer } = await compile(dir, packages, [
        `!define APP_PACKAGE_URL "${completeUrl ? `${url}/app-ARM64.7z` : url}"`,
        ...(completeUrl ? [] : ["!define APP_PACKAGE_URL_IS_INCOMPLETE"]),
        ...(allowUnverified ? ["!define ALLOW_UNVERIFIED_APP_PACKAGE"] : []),
      ])
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
      // Explicit packages skip filename selection: a package of any arch built with this installer is accepted.
      const explicit = path.join(dir, "explicit.7z")
      for (const arch of packages) {
        await fs.writeFile(explicit, payload(arch))
        const local = await run("ARM64", explicit)
        expect(requests).toEqual([])
        expect(local[0]).toBe(explicit)
      }
      // A foreign explicit package aborts the installation without a fallback download, unless unverified packages are allowed.
      await fs.writeFile(explicit, "user supplied package")
      if (allowUnverified) {
        const local = await run("ARM64", explicit)
        expect(local[0]).toBe(explicit)
      } else {
        await expect(run("ARM64", explicit)).rejects.toMatchObject({ exitCode: 2 })
      }
      expect(requests).toEqual([])

      // A missing explicit file must still select the correct download independently.
      await fs.rm(explicit)
      await run("ARM64", explicit)
      expect(requests).toEqual([`/app-${expected[2]}.7z`])

      // A versioned download must match the selected package; a complete URL (explicit appPackageUrl) isn't verified.
      mismatched = true
      if (completeUrl || allowUnverified) {
        const downloaded = await run("ARM64")
        expect(downloaded[2]).toBe(`${url}/app-${expected[2]}.7z`)
      } else {
        await expect(run("ARM64")).rejects.toMatchObject({ exitCode: 2 })
      }
      expect(requests).toEqual([`/app-${expected[2]}.7z`])
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))
    }
  })
}
