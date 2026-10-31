import { Arch } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import * as fs from "fs/promises"
import * as path from "path"
import { computeLicensePage } from "app-builder-lib/src/targets/win/nsis/nsisLicense"
import { NsisTarget } from "app-builder-lib/src/targets/win/nsis/NsisTarget"
import { NsisScriptGenerator } from "app-builder-lib/src/targets/win/nsis/nsisScriptGenerator"

// Each path written into the generated NSIS script must fail the build when it would end the quoted string.
const unsafe = /contains a double quote, backtick, line break or NUL character/

// Only the packager fields read before each sink is reached.
function createPackager(buildResourcesDir: string, overrides: Record<string, unknown> = {}): any {
  return {
    config: {},
    platformOptions: {},
    metadata: {},
    appInfo: {
      id: "com.example.app",
      name: "app",
      productName: "App",
      productFilename: "App",
      sanitizedName: "app",
      description: "",
      version: "1.0.0",
      buildVersion: "1.0.0",
      copyright: "",
      getVersionInWeirdWindowsForm: () => "1.0.0.0",
    },
    projectDir: buildResourcesDir,
    buildResourcesDir,
    cancellationToken: new CancellationToken(),
    fileAssociations: [],
    resourceList: Promise.resolve([]),
    expandArtifactNamePattern: () => "App Setup 1.0.0.exe",
    emitArtifactBuildStarted: () => Promise.resolve(),
    getResource: () => Promise.resolve(null),
    getIconPath: () => Promise.resolve(null),
    ...overrides,
  }
}

function createTarget(packager: any, outDir: string, name = "nsis"): any {
  return new NsisTarget(packager, outDir, name, { refCount: 0 } as any)
}

describe("NSIS script path quoting", () => {
  test("license page rejects an unsafe license file", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "nsis-quote-license" })
    const packager = createPackager(dir, { getResource: () => Promise.resolve(path.join(dir, 'license".txt')) })
    await expect(computeLicensePage(packager, {}, new NsisScriptGenerator(), ["en_US"])).rejects.toThrow(unsafe)
  })

  test("HTML license copy rejects an unsafe license file", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "nsis-quote-license-html" })
    const packager = createPackager(dir, { getResource: () => Promise.resolve(path.join(dir, "lic`ense.html")) })
    await expect(computeLicensePage(packager, {}, new NsisScriptGenerator(), ["en_US"])).rejects.toThrow(unsafe)
  })

  test("localized license page rejects an unsafe license file before rewriting it", async ({ expect, tmpDir }) => {
    const resources = path.join(await tmpDir.getTempDir({ prefix: "nsis-quote-license-localized" }), 'build"res')
    await fs.mkdir(resources, { recursive: true })
    const license = path.join(resources, "license_en.txt")
    await fs.writeFile(license, "terms")
    const packager = createPackager(resources, { resourceList: Promise.resolve(["license_en.txt"]) })
    await expect(computeLicensePage(packager, {}, new NsisScriptGenerator(), ["en_US", "de_DE"])).rejects.toThrow(unsafe)
    // no BOM was added to the file
    expect(await fs.readFile(license, "utf8")).toBe("terms")
  })

  test("OutFile rejects an unsafe installer path", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "nsis-quote-outfile" })
    const target = createTarget(createPackager(dir), path.join(dir, 'out"\n!system "id'))
    await expect(target.buildInstaller(new Map([[Arch.x64, dir]]))).rejects.toThrow(unsafe)
  })

  test("portable Icon rejects an unsafe icon path", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "nsis-quote-icon" })
    const target = createTarget(createPackager(dir, { getIconPath: () => Promise.resolve(path.join(dir, 'icon".ico')) }), dir, "portable")
    await expect(target.buildInstaller(new Map([[Arch.x64, dir]]))).rejects.toThrow(unsafe)
  })

  test("file association icon rejects an unsafe icon path", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "nsis-quote-assoc" })
    const packager = createPackager(dir, {
      fileAssociations: [{ ext: "foo", icon: "assoc" }],
      getResource: (custom: string | undefined) => Promise.resolve(custom === "assoc.ico" ? path.join(dir, "assoc\r.ico") : null),
    })
    await expect(createTarget(packager, dir).computeFinalScript("", true, new Map())).rejects.toThrow(unsafe)
  })

  test("pre-compressed file copy rejects an unsafe file name", async ({ expect, tmpDir }) => {
    const appOutDir = await tmpDir.getTempDir({ prefix: "nsis-quote-precompressed" })
    await fs.mkdir(path.join(appOutDir, "resources"), { recursive: true })
    await fs.writeFile(path.join(appOutDir, "resources", 'clip".mp4'), "video")
    const target = createTarget(createPackager(appOutDir), appOutDir)
    await expect(target.computeFinalScript("", false, new Map([[Arch.x64, appOutDir]]))).rejects.toThrow(unsafe)
  })
})
