import { Platform } from "app-builder-lib"
import { assertElectronArchSupported } from "app-builder-lib/src/electron/electronArchSupport"
import { Arch, InvalidConfigurationError } from "builder-util"

const check =
  (platform: Platform, arch: Arch, electronVersion: string, config: any = {}) =>
  () =>
    assertElectronArchSupported(platform, arch, electronVersion, config)

const removedCombinations: Array<[Platform, Arch]> = [
  [Platform.WINDOWS, Arch.ia32],
  [Platform.LINUX, Arch.armv7l],
]

describe("assertElectronArchSupported", () => {
  for (const [platform, arch] of removedCombinations) {
    describe(`${platform.name} ${Arch[arch]}`, () => {
      test("Electron 43.x passes", ({ expect }) => {
        expect(check(platform, arch, "43.0.0")).not.toThrow()
        expect(check(platform, arch, "43.5.1")).not.toThrow()
      })

      test("Electron 44.0.0 throws InvalidConfigurationError", ({ expect }) => {
        expect(check(platform, arch, "44.0.0")).toThrow(InvalidConfigurationError)
        expect(check(platform, arch, "44.0.0")).toThrow(/electronVersion <= 43\.x/)
      })

      test("Electron 44 prereleases throw too (whole 44 line is unsupported, including alphas 1-3 that still shipped artifacts)", ({ expect }) => {
        expect(check(platform, arch, "44.0.0-alpha.1")).toThrow(InvalidConfigurationError)
        expect(check(platform, arch, "44.0.0-alpha.4")).toThrow(InvalidConfigurationError)
        expect(check(platform, arch, "44.0.0-beta.2")).toThrow(InvalidConfigurationError)
      })

      test("Electron 45+ throws", ({ expect }) => {
        expect(check(platform, arch, "45.0.0-nightly.20260714")).toThrow(InvalidConfigurationError)
        expect(check(platform, arch, "45.1.0")).toThrow(InvalidConfigurationError)
      })

      test("unparseable version is left to the download step", ({ expect }) => {
        expect(check(platform, arch, "not-a-version")).not.toThrow()
      })

      test("downgraded to a warning when electronDist is configured", ({ expect }) => {
        expect(check(platform, arch, "44.0.0", { electronDist: "./custom-electron" })).not.toThrow()
        expect(check(platform, arch, "44.0.0", { electronDist: () => "./custom-electron" })).not.toThrow()
        // empty string is not a custom dist
        expect(check(platform, arch, "44.0.0", { electronDist: "  " })).toThrow(InvalidConfigurationError)
      })

      test("downgraded to a warning when a custom mirror is configured", ({ expect }) => {
        expect(check(platform, arch, "44.0.0", { electronGet: { mirrorOptions: { mirror: "https://mirror.example.com/electron/" } } })).not.toThrow()
      })

      test("downgraded to a warning when the ELECTRON_MIRROR env var is set", ({ expect }) => {
        process.env.ELECTRON_MIRROR = "https://mirror.example.com/electron/"
        try {
          expect(check(platform, arch, "44.0.0")).not.toThrow()
        } finally {
          delete process.env.ELECTRON_MIRROR
        }
      })
    })
  }

  test("still-supported combinations never throw on Electron 44+", ({ expect }) => {
    expect(check(Platform.WINDOWS, Arch.x64, "44.0.0")).not.toThrow()
    expect(check(Platform.WINDOWS, Arch.arm64, "45.0.0")).not.toThrow()
    expect(check(Platform.LINUX, Arch.x64, "44.0.0")).not.toThrow()
    expect(check(Platform.LINUX, Arch.arm64, "44.0.0")).not.toThrow()
    expect(check(Platform.MAC, Arch.arm64, "44.0.0")).not.toThrow()
    expect(check(Platform.MAC, Arch.universal, "44.0.0")).not.toThrow()
  })

  test("ia32/armv7l on the other platform is out of scope", ({ expect }) => {
    // linux-ia32 zips already ended at Electron 19; win32-armv7l never existed — both fail at download as before
    expect(check(Platform.LINUX, Arch.ia32, "44.0.0")).not.toThrow()
    expect(check(Platform.WINDOWS, Arch.armv7l, "44.0.0")).not.toThrow()
  })
})
