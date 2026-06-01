import { afterEach, vi } from "vitest"
import { wincodesignChecksums, getWinCodesignPlatformFile } from "app-builder-lib/src/toolsets/winCodeSign"
import { nsisChecksums } from "app-builder-lib/src/toolsets/nsis"
import { appimageChecksums } from "app-builder-lib/src/toolsets/appimage"
import { fpmChecksums, getFpmPlatformFile } from "app-builder-lib/src/toolsets/fpm"

const SHA256_RE = /^[a-f0-9]{64}$/

// ─── wincodesignChecksums ────────────────────────────────────────────────────

describe("wincodesignChecksums", () => {
  const CROSS_PLATFORM_FILES = [
    "rcedit-windows-2_0_0.zip",
    "win-codesign-darwin-arm64.zip",
    "win-codesign-darwin-x86_64.zip",
    "win-codesign-linux-amd64.zip",
    "win-codesign-linux-arm64.zip",
    "win-codesign-linux-i386.zip",
    "win-codesign-windows-x64.zip",
    "windows-kits-bundle-10_0_26100_0.zip",
  ] as const

  for (const version of ["1.0.0", "1.1.0", "1.2.1"] as const) {
    describe(`version ${version}`, () => {
      test("contains all expected cross-platform files", ({ expect }) => {
        for (const f of CROSS_PLATFORM_FILES) {
          expect(wincodesignChecksums[version]).toHaveProperty(f)
        }
      })

      test("all checksums are valid SHA-256 hex strings", ({ expect }) => {
        for (const [file, checksum] of Object.entries(wincodesignChecksums[version])) {
          expect(checksum, `checksum for ${file} in ${version}`).toMatch(SHA256_RE)
        }
      })
    })
  }

  test("1.2.1 additionally contains the arm64 Windows binary", ({ expect }) => {
    expect(wincodesignChecksums["1.2.1"]).toHaveProperty("win-codesign-windows-arm64.zip")
    expect(wincodesignChecksums["1.2.1"]["win-codesign-windows-arm64.zip"]).toMatch(SHA256_RE)
  })

  test("0.0.0 is the legacy sentinel with no file entries", ({ expect }) => {
    expect(Object.keys(wincodesignChecksums["0.0.0"])).toHaveLength(0)
  })
})

// ─── getWinCodesignPlatformFile ──────────────────────────────────────────────

describe("getWinCodesignPlatformFile", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const cases: Array<{ platform: NodeJS.Platform; arch: NodeJS.Architecture; expected: string }> = [
    { platform: "linux", arch: "x64", expected: "win-codesign-linux-amd64.zip" },
    { platform: "linux", arch: "arm64", expected: "win-codesign-linux-arm64.zip" },
    { platform: "linux", arch: "ia32", expected: "win-codesign-linux-i386.zip" },
    { platform: "darwin", arch: "arm64", expected: "win-codesign-darwin-arm64.zip" },
    { platform: "darwin", arch: "x64", expected: "win-codesign-darwin-x86_64.zip" },
    { platform: "win32", arch: "x64", expected: "win-codesign-windows-x64.zip" },
  ]

  for (const { platform, arch, expected } of cases) {
    test(`${platform}/${arch} → ${expected}`, ({ expect }) => {
      vi.spyOn(process, "platform", "get").mockReturnValue(platform)
      vi.spyOn(process, "arch", "get").mockReturnValue(arch)
      expect(getWinCodesignPlatformFile()).toBe(expected)
    })
  }

  test("returned key is always present in wincodesignChecksums['1.0.0']", ({ expect }) => {
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin")
    vi.spyOn(process, "arch", "get").mockReturnValue("arm64")
    const file = getWinCodesignPlatformFile()
    expect(wincodesignChecksums["1.0.0"]).toHaveProperty(file)
  })
})

// ─── nsisChecksums ──────────────────────────────────────────────────────────

describe("nsisChecksums", () => {
  test("1.2.1 contains the unified bundle file with a valid SHA-256", ({ expect }) => {
    const file = "nsis-bundle-3.12.tar.gz"
    expect(nsisChecksums["1.2.1"]).toHaveProperty(file)
    expect(nsisChecksums["1.2.1"][file]).toMatch(SHA256_RE)
  })

  test("0.0.0 is the legacy sentinel with no file entries", ({ expect }) => {
    expect(Object.keys(nsisChecksums["0.0.0"])).toHaveLength(0)
  })
})

// ─── appimageChecksums ───────────────────────────────────────────────────────

describe("appimageChecksums", () => {
  for (const version of ["0.0.0", "1.0.2", "1.0.3"] as const) {
    test(`version ${version} has exactly one file with a valid SHA-256`, ({ expect }) => {
      const entries = Object.entries(appimageChecksums[version])
      expect(entries).toHaveLength(1)
      const [[, checksum]] = entries
      expect(checksum).toMatch(SHA256_RE)
    })
  }

  test("0.0.0 and 1.0.2 share the same filename but different checksums", ({ expect }) => {
    const f_002 = Object.keys(appimageChecksums["1.0.2"])[0]
    const f_003 = Object.keys(appimageChecksums["1.0.3"])[0]
    expect(f_002).toBe(f_003)
    expect(appimageChecksums["1.0.2"][f_002 as keyof (typeof appimageChecksums)["1.0.2"]]).not.toBe(
      appimageChecksums["1.0.3"][f_003 as keyof (typeof appimageChecksums)["1.0.3"]]
    )
  })
})

// ─── fpmChecksums / getFpmPlatformFile ───────────────────────────────────────

describe("fpmChecksums", () => {
  test("all entries have valid SHA-256 checksums", ({ expect }) => {
    for (const [file, checksum] of Object.entries(fpmChecksums)) {
      expect(checksum, `checksum for ${file}`).toMatch(SHA256_RE)
    }
  })
})

describe("getFpmPlatformFile", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const cases: Array<{ platform: NodeJS.Platform; arch: NodeJS.Architecture; expected: string }> = [
    { platform: "linux", arch: "x64", expected: "fpm-1.17.0-ruby-3.4.3-linux-amd64.7z" },
    { platform: "linux", arch: "arm64", expected: "fpm-1.17.0-ruby-3.4.3-linux-arm64v8.7z" },
    { platform: "linux", arch: "ia32", expected: "fpm-1.17.0-ruby-3.4.3-linux-i386.7z" },
    { platform: "darwin", arch: "arm64", expected: "fpm-1.17.0-ruby-3.4.3-darwin-arm64.7z" },
    { platform: "darwin", arch: "x64", expected: "fpm-1.17.0-ruby-3.4.3-darwin-x86_64.7z" },
  ]

  for (const { platform, arch, expected } of cases) {
    test(`${platform}/${arch} → ${expected}`, ({ expect }) => {
      vi.spyOn(process, "platform", "get").mockReturnValue(platform)
      vi.spyOn(process, "arch", "get").mockReturnValue(arch)
      expect(getFpmPlatformFile()).toBe(expected)
    })
  }

  test("returned key is always a valid entry in fpmChecksums", ({ expect }) => {
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin")
    vi.spyOn(process, "arch", "get").mockReturnValue("x64")
    const file = getFpmPlatformFile()
    expect(fpmChecksums).toHaveProperty(file)
  })
})
