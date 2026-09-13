import * as path from "path"
import { mkdir, writeFile } from "fs/promises"
import { applyRootVolumeOnly, prepareProductBuildArgs, resolvePkgBuildVersion, resolveScriptsDir } from "app-builder-lib/src/targets/mac/pkg"

// Only run these tests on macOS since they rely on macOS-specific filesystem structure and conventions.
// The functions being tested are also only relevant in the context of building macOS pkg installers.
describe("mac pkg", () => {
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

  describe("resolvePkgBuildVersion", () => {
    test("returns CFBundleShortVersionString from Info.plist when present", async ({ expect, tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const appDir = path.join(tmpDirPath, "MyApp.app")
      await writeInfoPlist(appDir, { CFBundleShortVersionString: "3.2.1", CFBundleVersion: "321" })

      const version = await resolvePkgBuildVersion(appDir, "0.0.0")
      expect(version).toBe("3.2.1")
    })

    test("falls back to provided fallback when Info.plist is missing", async ({ expect, tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const appDir = path.join(tmpDirPath, "NoApp.app")
      // No Info.plist written

      const version = await resolvePkgBuildVersion(appDir, "1.2.3")
      expect(version).toBe("1.2.3")
    })

    test("falls back when CFBundleShortVersionString key is absent from plist", async ({ expect, tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const appDir = path.join(tmpDirPath, "NoVersionApp.app")
      await writeInfoPlist(appDir, { CFBundleName: "Test" })

      const version = await resolvePkgBuildVersion(appDir, "9.9.9")
      expect(version).toBe("9.9.9")
    })

    test("falls back when CFBundleShortVersionString is an empty string", async ({ expect, tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const appDir = path.join(tmpDirPath, "EmptyVersionApp.app")
      await writeInfoPlist(appDir, { CFBundleShortVersionString: "" })

      const version = await resolvePkgBuildVersion(appDir, "5.0.0")
      expect(version).toBe("5.0.0")
    })

    test("prefers CFBundleShortVersionString over fallback even when CFBundleVersion also present", async ({ expect, tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const appDir = path.join(tmpDirPath, "BothVersionApp.app")
      await writeInfoPlist(appDir, { CFBundleShortVersionString: "2.0.0", CFBundleVersion: "2000" })

      const version = await resolvePkgBuildVersion(appDir, "0.0.0")
      expect(version).toBe("2.0.0")
    })

    test("falls back when Info.plist contains malformed content", async ({ expect, tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const appDir = path.join(tmpDirPath, "BadPlistApp.app")
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

  // ---------------------------------------------------------------------------
  // applyRootVolumeOnly
  // ---------------------------------------------------------------------------

  describe("applyRootVolumeOnly", () => {
    // Trimmed `productbuild --synthesize` output, keeping the elements PkgTarget later works with.
    const synthesized = `<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="1">
    <options customize="never" require-scripts="false"/>
    <volume-check>
        <allowed-os-versions>
            <os-version min="10.13"/>
        </allowed-os-versions>
    </volume-check>
</installer-gui-script>
`

    test("adds rootVolumeOnly when both user-home install domains are disabled", ({ expect }) => {
      const result = applyRootVolumeOnly(synthesized, { allowAnywhere: false, allowCurrentUserHome: false })
      expect(result).toContain('<options rootVolumeOnly="true" customize="never" require-scripts="false"/>')
    })

    test("leaves <options> untouched when it can still be installed anywhere", ({ expect }) => {
      expect(applyRootVolumeOnly(synthesized, { allowAnywhere: true, allowCurrentUserHome: false })).toBe(synthesized)
    })

    test("leaves <options> untouched when it can still be installed into the user home", ({ expect }) => {
      expect(applyRootVolumeOnly(synthesized, { allowAnywhere: false, allowCurrentUserHome: true })).toBe(synthesized)
    })

    test("leaves <options> untouched for the default install domains", ({ expect }) => {
      expect(applyRootVolumeOnly(synthesized, {})).toBe(synthesized)
    })

    test("leaves <options> untouched when neither domain is explicitly disabled", ({ expect }) => {
      expect(applyRootVolumeOnly(synthesized, { allowAnywhere: null, allowCurrentUserHome: null })).toBe(synthesized)
    })

    test("keeps the rest of the distribution document intact", ({ expect }) => {
      const result = applyRootVolumeOnly(synthesized, { allowAnywhere: false, allowCurrentUserHome: false })
      expect(result).toBe(synthesized.replace("<options ", '<options rootVolumeOnly="true" '))
      expect(result).toContain("<volume-check>")
      expect(result).toContain('<os-version min="10.13"/>')
      expect(result.trimEnd().endsWith("</installer-gui-script>")).toBe(true)
    })
  })
})
