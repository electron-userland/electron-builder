import { filterCFBundleIdentifier } from "app-builder-lib/src/appInfo.js"
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

// productbuild names the component's pkg-ref after the app's CFBundleIdentifier, which is the filtered app id
const synthesized = (bundleId: string) => `<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
    <pkg-ref id="${bundleId}">
        <bundle-version>
            <bundle CFBundleShortVersionString="1.0.0" CFBundleVersion="1.0.0" id="${bundleId}" path="My.app"/>
        </bundle-version>
    </pkg-ref>
    <options customize="never" require-scripts="false" hostArchitectures="arm64"/>
    <choices-outline>
        <line choice="default">
            <line choice="${bundleId}"/>
        </line>
    </choices-outline>
    <choice id="default"/>
    <choice id="${bundleId}" visible="false">
        <pkg-ref id="${bundleId}"/>
    </choice>
    <pkg-ref id="${bundleId}" version="1.0.0" onConclusion="none">${bundleId}.pkg</pkg-ref>
</installer-gui-script>
`

beforeEach(() => {
  vi.spyOn(Executables, "resolve").mockImplementation(name => `/usr/bin/${name}`)
  vi.mocked(exec).mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function writeDistribution(outDir: string, appId: string, pkgOptions: Record<string, any>, resourceDir: string, componentBundleId: string): Promise<string> {
  vi.mocked(exec).mockImplementation(async (_file, args) => {
    // the distribution file is the last argument of `productbuild --synthesize`
    const distInfoFile = args?.[args.length - 1]
    if (args?.[0] === "--synthesize" && distInfoFile != null) {
      await writeFile(distInfoFile, synthesized(componentBundleId))
    }
    return ""
  })
  const packager: any = {
    // mirrors AppInfo.macBundleIdentifier
    appInfo: {
      id: appId,
      macBundleIdentifier: filterCFBundleIdentifier(appId),
    },
    platformOptions: {},
    getOptionsForTarget: () => pkgOptions,
    tempDirManager: {
      getTempFile: ({ suffix }: { suffix: string }) => Promise.resolve(path.join(outDir, `requirements${suffix}`)),
    },
    // every configured resource is found, at a path under resourceDir
    getResource: (custom: string | null | undefined) => Promise.resolve(custom == null ? null : path.join(resourceDir, custom)),
    emitPkgDistributionCreated: () => Promise.resolve(),
  }
  const target: any = new PkgTarget(packager, outDir)
  const distInfoFile = path.join(outDir, "distribution.xml")
  await target.customizeDistributionConfiguration(distInfoFile, "/out/mac-arm64/My.app", null, Arch.arm64)
  return await readFile(distInfoFile, "utf-8")
}

const parse = (xml: string) =>
  new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    isArray: name => name === "pkg-ref" || name === "app",
  }).parse(xml)["installer-gui-script"]

// the top-level pkg-refs that carry must-close, and the ids of the component pkg-refs productbuild synthesized
function mustCloseRefs(root: any): {
  refs: Array<{ id: string; apps: Array<string> }>
  componentIds: Array<string>
} {
  const refs: Array<any> = root["pkg-ref"]
  return {
    refs: refs
      .filter(it => it["must-close"] != null)
      .map(it => ({
        id: it.id,
        apps: it["must-close"].app.map((app: any) => app.id),
      })),
    componentIds: refs.filter(it => it["must-close"] == null).map(it => it.id),
  }
}

test("config values with XML special characters and $ patterns give a well-formed distribution.xml that keeps them as written", async ({ expect, tmpDir }) => {
  const outDir = await tmpDir.createTempDir({ prefix: "pkg-distribution" })
  const resourceDir = path.join(outDir, `Tom & Jerry's "<build>" $&`)
  const appId = `com.example.a&b"<c>$&`
  const mustClose = [`com.example.x&y`, `com.example."q"<z>`, `com.example.$&`, `com.example.$1$'`]
  const xml = await writeDistribution(
    outDir,
    appId,
    {
      mustClose,
      background: { file: "background.png" },
      welcome: "welcome.html",
      license: "license.txt",
      conclusion: "conclusion.html",
    },
    resourceDir,
    "com.example.abc"
  )

  expect(XMLValidator.validate(xml)).toBe(true)
  // the inserted elements come before the single closing tag, which a `$&` expansion would have duplicated
  expect(xml.match(/<\/installer-gui-script>/g)).toHaveLength(1)

  const root = parse(xml)
  const { refs, componentIds } = mustCloseRefs(root)
  // must-close attaches to the component's pkg-ref (the filtered bundle id), not the raw app id
  expect(refs).toEqual([{ id: "com.example.abc", apps: mustClose }])
  expect(componentIds).toContain("com.example.abc")
  expect(root.background.file).toBe(path.join(resourceDir, "background.png"))
  expect(root["background-darkAqua"].file).toBe(path.join(resourceDir, "background.png"))
  expect(root.welcome.file).toBe(path.join(resourceDir, "welcome.html"))
  expect(root.license.file).toBe(path.join(resourceDir, "license.txt"))
  expect(root.conclusion.file).toBe(path.join(resourceDir, "conclusion.html"))
})

test("plain values are written unchanged", async ({ expect, tmpDir }) => {
  const outDir = await tmpDir.createTempDir({ prefix: "pkg-distribution" })
  const xml = await writeDistribution(outDir, "com.example.app", { mustClose: ["com.example.helper"], welcome: "welcome.html" }, "/build", "com.example.app")

  expect(xml).toContain(`    <pkg-ref id="com.example.app">\n        <must-close>\n            <app id="com.example.helper"/>\n        </must-close>\n    </pkg-ref>\n`)
  expect(xml).toContain(`    <welcome file="${path.join("/build", "welcome.html")}"/>\n`)
  expect(XMLValidator.validate(xml)).toBe(true)
})

test("mustClose attaches to the component pkg-ref when bundle-id filtering changes the app id", async ({ expect, tmpDir }) => {
  const outDir = await tmpDir.createTempDir({ prefix: "pkg-distribution" })
  // CFBundleIdentifier (and so productbuild's pkg-ref id) drops `_` and turns spaces into `-`
  const xml = await writeDistribution(outDir, "com.my_company.my app", { mustClose: ["com.example.helper"] }, "/build", "com.mycompany.my-app")

  expect(XMLValidator.validate(xml)).toBe(true)
  const { refs, componentIds } = mustCloseRefs(parse(xml))
  expect(refs).toEqual([{ id: "com.mycompany.my-app", apps: ["com.example.helper"] }])
  expect(componentIds).toContain("com.mycompany.my-app")
})
