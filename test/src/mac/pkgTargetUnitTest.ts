import { afterEach, beforeEach } from "vitest"
import * as os from "os"
import * as path from "path"
import { mkdir, rm, writeFile } from "fs/promises"
import { prepareProductBuildArgs, resolvePkgBuildVersion, resolveScriptsDir } from "app-builder-lib/out/targets/pkg"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), `eb-pkg-unit-${Date.now()}`)
  await mkdir(dir, { recursive: true })
  return dir
}

function plistXml(data: Record<string, string | number | boolean>): string {
  const entries = Object.entries(data)
    .map(([key, value]) => {
      const valTag = typeof value === "string" ? `<string>${value}</string>` : typeof value === "number" ? `<integer>${value}</integer>` : `<${value}/>`
      return `\t<key>${key}</key>\n\t${valTag}`
    })
    .join("\n")
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${entries}
</dict>
</plist>`
}

async function writeInfoPlist(appDir: string, data: Record<string, string | number | boolean>): Promise<void> {
  const contentsDir = path.join(appDir, "Contents")
  await mkdir(contentsDir, { recursive: true })
  await writeFile(path.join(contentsDir, "Info.plist"), plistXml(data))
}

// ---------------------------------------------------------------------------
// resolvePkgBuildVersion
// ---------------------------------------------------------------------------

describe("resolvePkgBuildVersion", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await makeTempDir()
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  test("returns CFBundleShortVersionString from Info.plist when present", async ({ expect }) => {
    const appDir = path.join(tmpDir, "MyApp.app")
    await writeInfoPlist(appDir, { CFBundleShortVersionString: "3.2.1", CFBundleVersion: "321" })

    const version = await resolvePkgBuildVersion(appDir, "0.0.0")
    expect(version).toBe("3.2.1")
  })

  test("falls back to provided fallback when Info.plist is missing", async ({ expect }) => {
    const appDir = path.join(tmpDir, "NoApp.app")
    // No Info.plist written

    const version = await resolvePkgBuildVersion(appDir, "1.2.3")
    expect(version).toBe("1.2.3")
  })

  test("falls back when CFBundleShortVersionString key is absent from plist", async ({ expect }) => {
    const appDir = path.join(tmpDir, "NoVersionApp.app")
    await writeInfoPlist(appDir, { CFBundleName: "Test" })

    const version = await resolvePkgBuildVersion(appDir, "9.9.9")
    expect(version).toBe("9.9.9")
  })

  test("falls back when CFBundleShortVersionString is an empty string", async ({ expect }) => {
    const appDir = path.join(tmpDir, "EmptyVersionApp.app")
    await writeInfoPlist(appDir, { CFBundleShortVersionString: "" })

    const version = await resolvePkgBuildVersion(appDir, "5.0.0")
    expect(version).toBe("5.0.0")
  })

  test("prefers CFBundleShortVersionString over fallback even when CFBundleVersion also present", async ({ expect }) => {
    const appDir = path.join(tmpDir, "BothVersionApp.app")
    await writeInfoPlist(appDir, { CFBundleShortVersionString: "2.0.0", CFBundleVersion: "2000" })

    const version = await resolvePkgBuildVersion(appDir, "0.0.0")
    expect(version).toBe("2.0.0")
  })

  test("falls back when Info.plist contains malformed content", async ({ expect }) => {
    const appDir = path.join(tmpDir, "BadPlistApp.app")
    const contentsDir = path.join(appDir, "Contents")
    await mkdir(contentsDir, { recursive: true })
    await writeFile(path.join(contentsDir, "Info.plist"), "this is not a valid plist")

    const version = await resolvePkgBuildVersion(appDir, "4.0.0")
    expect(version).toBe("4.0.0")
  })
})

// ---------------------------------------------------------------------------
// resolveScriptsDir
// ---------------------------------------------------------------------------

describe("resolveScriptsDir", () => {
  const buildResourcesDir = "/some/build/resources"

  test("returns null when scripts is explicitly null (disabled)", ({ expect }) => {
    expect(resolveScriptsDir(buildResourcesDir, null)).toBeNull()
  })

  test("returns default pkg-scripts dir when scripts is undefined", ({ expect }) => {
    expect(resolveScriptsDir(buildResourcesDir, undefined)).toBe(path.join(buildResourcesDir, "pkg-scripts"))
  })

  test("resolves custom scripts path relative to buildResourcesDir", ({ expect }) => {
    const result = resolveScriptsDir(buildResourcesDir, "my-scripts")
    expect(result).toBe(path.resolve(buildResourcesDir, "my-scripts"))
  })

  test("resolves absolute custom scripts path as-is", ({ expect }) => {
    const absoluteScripts = "/absolute/path/to/scripts"
    expect(resolveScriptsDir(buildResourcesDir, absoluteScripts)).toBe(absoluteScripts)
  })

  test("resolves nested custom scripts path", ({ expect }) => {
    const result = resolveScriptsDir(buildResourcesDir, "sub/dir/scripts")
    expect(result).toBe(path.resolve(buildResourcesDir, "sub/dir/scripts"))
  })
})

// ---------------------------------------------------------------------------
// prepareProductBuildArgs
// ---------------------------------------------------------------------------

describe("prepareProductBuildArgs", () => {
  test("returns empty array when identity is null and keychain is null", ({ expect }) => {
    expect(prepareProductBuildArgs(null, null)).toEqual([])
  })

  test("returns empty array when identity is null and keychain is provided", ({ expect }) => {
    expect(prepareProductBuildArgs(null, "/path/to/keychain")).toEqual([])
  })

  test("includes --sign with identity hash when identity is provided", ({ expect }) => {
    const identity = { hash: "ABCDEF123456", name: "Developer ID Installer: Acme Corp", expired: false }
    const args = prepareProductBuildArgs(identity, null)
    expect(args).toContain("--sign")
    expect(args).toContain("ABCDEF123456")
    expect(args).not.toContain("--keychain")
  })

  test("includes --sign and --keychain when both identity and keychain are provided", ({ expect }) => {
    const identity = { hash: "DEADBEEF", name: "Developer ID Installer: Example", expired: false }
    const args = prepareProductBuildArgs(identity, "/path/to/login.keychain")
    expect(args).toEqual(["--sign", "DEADBEEF", "--keychain", "/path/to/login.keychain"])
  })

  test("omits --keychain when keychain is undefined", ({ expect }) => {
    const identity = { hash: "CAFEBABE", name: "Developer ID Installer: Test", expired: false }
    const args = prepareProductBuildArgs(identity, undefined)
    expect(args).toEqual(["--sign", "CAFEBABE"])
    expect(args).not.toContain("--keychain")
  })
})
