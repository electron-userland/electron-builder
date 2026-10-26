import { updateManifestPlatform } from "app-builder-lib/src/publish/updateManifestVerifier.js"

// the patterns the platform of a manifest was matched with, which updateManifestPlatform must agree with (on short names, where they are fast)
function byPatterns(name: string): string {
  return /-mac\.ya?ml$/.test(name) ? "mac" : /-linux(-[^.]+)?\.ya?ml$/.test(name) ? "linux" : "win"
}

describe("updateManifestPlatform", () => {
  test("names the platform of the manifests a build writes", ({ expect }) => {
    expect(updateManifestPlatform("/out/latest-mac.yml")).toBe("mac")
    expect(updateManifestPlatform("/out/beta-linux-arm64.yml")).toBe("linux")
    expect(updateManifestPlatform("/out/latest-linux.yaml")).toBe("linux")
    expect(updateManifestPlatform("/out/nsis-web/s3/latest.yml")).toBe("win")
  })

  test("agrees with the patterns", ({ expect }) => {
    const parts = ["-linux", "-mac", "-", ".", "a", ".yml", ".yaml"]
    // every name of up to 4 parts
    let names = [""]
    for (let length = 1; length <= 4; length++) {
      names = names.flatMap(name => parts.map(it => name + it))
      for (const name of names) {
        expect(updateManifestPlatform(name), JSON.stringify(name)).toBe(byPatterns(name))
      }
    }
  })

  test("runs in linear time on a name with many -linux", ({ expect }) => {
    // the input that makes /-linux(-[^.]+)?\.ya?ml$/ backtrack polynomially (CodeQL js/polynomial-redos)
    const name = "-linux-".repeat(50_000)
    const start = process.hrtime.bigint()
    expect(updateManifestPlatform(name)).toBe("win")
    expect(updateManifestPlatform(`${name}.yml`)).toBe("linux")
    expect(updateManifestPlatform(`${name}x`)).toBe("win")
    expect(Number(process.hrtime.bigint() - start) / 1e6).toBeLessThan(500)
  })
})
