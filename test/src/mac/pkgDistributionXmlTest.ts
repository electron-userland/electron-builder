import { PkgTarget } from "app-builder-lib/src/targets/mac/pkg.js"
import { Arch, exec, Executables } from "builder-util"
import { XMLParser, XMLValidator } from "fast-xml-parser"
import { readFile, writeFile } from "fs/promises"
import * as path from "path"
import { afterEach, beforeEach, vi } from "vitest"

// productbuild only exists on macOS: the stub writes what `productbuild --synthesize` produces, so these tests run on every host
vi.mock("builder-util", async importOriginal => {
  const actual = await importOriginal<typeof import("builder-util")>()
  return { ...actual, exec: vi.fn() }
})

const SYNTHESIZED = `<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
    <options customize="never" require-scripts="false" hostArchitectures="arm64"/>
    <choices-outline>
        <line choice="default"/>
    </choices-outline>
</installer-gui-script>
`

beforeEach(() => {
  vi.spyOn(Executables, "resolve").mockImplementation(name => `/usr/bin/${name}`)
  vi.mocked(exec)
    .mockReset()
    .mockImplementation(async (_file, args) => {
      // the distribution file is the last argument of `productbuild --synthesize`
      const distInfoFile = args?.[args.length - 1]
      if (args?.[0] === "--synthesize" && distInfoFile != null) {
        await writeFile(distInfoFile, SYNTHESIZED)
      }
      return ""
    })
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function writeDistribution(outDir: string, appId: string, pkgOptions: Record<string, any>, resourceDir: string): Promise<string> {
  const packager: any = {
    appInfo: { id: appId },
    platformOptions: {},
    getOptionsForTarget: () => pkgOptions,
    tempDirManager: { getTempFile: ({ suffix }: { suffix: string }) => Promise.resolve(path.join(outDir, `requirements${suffix}`)) },
    // every configured resource is found, at a path under resourceDir
    getResource: (custom: string | null | undefined) => Promise.resolve(custom == null ? null : path.join(resourceDir, custom)),
    emitPkgDistributionCreated: () => Promise.resolve(),
  }
  const target: any = new PkgTarget(packager, outDir)
  const distInfoFile = path.join(outDir, "distribution.xml")
  await target.customizeDistributionConfiguration(distInfoFile, "/out/mac-arm64/My.app", null, Arch.arm64)
  return await readFile(distInfoFile, "utf-8")
}

const parse = (xml: string) => new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" }).parse(xml)["installer-gui-script"]

test("config values with XML special characters and $ patterns give a well-formed distribution.xml that keeps them as written", async ({ expect, tmpDir }) => {
  const outDir = await tmpDir.createTempDir({ prefix: "pkg-distribution" })
  const resourceDir = path.join(outDir, `Tom & Jerry's "<build>" $&`)
  const appId = `com.example.a&b"<c>$&`
  const mustClose = [`com.example.x&y`, `com.example."q"<z>`, `com.example.$&`, `com.example.$1$'`]
  const xml = await writeDistribution(
    outDir,
    appId,
    { mustClose, background: { file: "background.png" }, welcome: "welcome.html", license: "license.txt", conclusion: "conclusion.html" },
    resourceDir
  )

  expect(XMLValidator.validate(xml)).toBe(true)
  // the inserted elements come before the single closing tag, which a `$&` expansion would have duplicated
  expect(xml.match(/<\/installer-gui-script>/g)).toHaveLength(1)

  const root = parse(xml)
  expect(root["pkg-ref"].id).toBe(appId)
  expect(root["pkg-ref"]["must-close"].app.map((it: any) => it.id)).toEqual(mustClose)
  expect(root.background.file).toBe(path.join(resourceDir, "background.png"))
  expect(root["background-darkAqua"].file).toBe(path.join(resourceDir, "background.png"))
  expect(root.welcome.file).toBe(path.join(resourceDir, "welcome.html"))
  expect(root.license.file).toBe(path.join(resourceDir, "license.txt"))
  expect(root.conclusion.file).toBe(path.join(resourceDir, "conclusion.html"))
})

test("plain values are written unchanged", async ({ expect, tmpDir }) => {
  const outDir = await tmpDir.createTempDir({ prefix: "pkg-distribution" })
  const xml = await writeDistribution(outDir, "com.example.app", { mustClose: ["com.example.helper"], welcome: "welcome.html" }, "/build")

  expect(xml).toContain(`    <pkg-ref id="com.example.app">\n        <must-close>\n            <app id="com.example.helper"/>\n        </must-close>\n    </pkg-ref>\n`)
  expect(xml).toContain(`    <welcome file="${path.join("/build", "welcome.html")}"/>\n`)
  expect(XMLValidator.validate(xml)).toBe(true)
})
