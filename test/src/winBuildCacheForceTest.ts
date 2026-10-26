import { WinPackager } from "app-builder-lib"
import { AuthenticodeSignerInfo } from "app-builder-lib/src/codeSign/win/authenticodeSignature"
import { BuildCacheManager } from "app-builder-lib/src/util/cacheManager"
import { Arch } from "builder-util"
import * as path from "path"
import { afterEach, beforeEach, vi } from "vitest"

// signAndEditResources uses the build cache only off CI. app-builder-lib resolves its own copy of ci-info (another
// version than the test package's), so it is mocked by its physical path, like @electron/notarize in notarizeApiKeyTest.
vi.mock("../../packages/app-builder-lib/node_modules/ci-info/index.js", () => ({ isCI: false, default: { isCI: false } }))

beforeEach(() => {
  vi.stubEnv("ELECTRON_BUILDER_DISABLE_BUILD_CACHE", undefined)
  // a cache hit: the executable is restored instead of being edited and signed
  vi.spyOn(BuildCacheManager.prototype, "copyIfValid").mockResolvedValue(true)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

// just enough of a WinPackager for signAndEditResources to reach the cache-hit branch
function makePackager(signer: AuthenticodeSignerInfo, forceCodeSigning: boolean, platformSpecificBuildOptions: any = {}): any {
  const packager = Object.create(WinPackager.prototype)
  packager.platformSpecificBuildOptions = platformSpecificBuildOptions
  packager.info = { config: { electronVersion: "30.0.0" } }
  packager.appInfo = { productName: "App", copyright: "", buildVersion: "1.0.0", getVersionInWeirdWindowsForm: () => "1.0.0.0" }
  // a certificate is configured: only then is the build cache used
  packager.signingManager = { value: Promise.resolve({ cscInfo: { value: Promise.resolve({ file: null }) } }) }
  packager.getIconPath = () => Promise.resolve(null)
  packager.getResourcesDir = (appOutDir: string) => path.join(appOutDir, "resources")
  packager.readAuthenticodeSignature = vi.fn(() => Promise.resolve(signer))
  Object.defineProperty(packager, "forceCodeSigning", { value: forceCodeSigning })
  return packager
}

const outDir = path.join(__dirname, "nonexistent-out")
const exe = path.join(outDir, "win-unpacked", "App.exe")

test("an executable restored from the build cache is read back under forceCodeSigning", async ({ expect }) => {
  const packager = makePackager({ type: "signed", subject: "CN=Test", status: 0 }, true)
  await expect(packager.signAndEditResources(exe, Arch.x64, outDir)).resolves.toBe("signed")
  expect(packager.readAuthenticodeSignature).toHaveBeenCalledWith(exe)
})

test("an unsigned executable restored from the build cache fails under forceCodeSigning", async ({ expect }) => {
  const packager = makePackager({ type: "unsigned", reason: "empty PE certificate table" }, true)
  await expect(packager.signAndEditResources(exe, Arch.x64, outDir)).rejects.toThrow(
    /forceCodeSigning is enabled, but the executable restored from the build cache .*App\.exe carries no Authenticode signature.*Clear the build cache/
  )
})

test("a build-cache hit is not read back without forceCodeSigning, or for an executable excluded via signExts", async ({ expect }) => {
  const unsigned: AuthenticodeSignerInfo = { type: "unsigned", reason: "empty PE certificate table" }
  for (const packager of [makePackager(unsigned, false), makePackager(unsigned, true, { signExts: ["!.exe"] })]) {
    await expect(packager.signAndEditResources(exe, Arch.x64, outDir)).resolves.toBe("signed")
    expect(packager.readAuthenticodeSignature).not.toHaveBeenCalled()
  }
})
