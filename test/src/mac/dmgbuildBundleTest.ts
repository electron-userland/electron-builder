import { getDmgbuildBundle } from "dmg-builder/internal"

// Bundles and digests published at
// https://github.com/electron-userland/electron-builder-binaries/releases/tag/dmg-builder%401.2.7
describe("dmgbuild bundle", () => {
  test.for([
    ["arm64", "dmgbuild-bundle-arm64-cc96fa2.tar.gz", "2b5b01f3900c702a8dcbaec5d502ae0e3dea9f3abe83097fb16f5bed11c252c6"],
    ["x86_64", "dmgbuild-bundle-x86_64-cc96fa2.tar.gz", "fa3d91c8f9c4ac44c32cd223349a4154bdd94b09ec072c7a3cb62b11fe83f023"],
  ] as const)("%s resolves to the dmg-builder@1.2.7 bundle", ([arch, filename, sha256], { expect }) => {
    const bundle = getDmgbuildBundle(arch)
    expect(bundle.releaseName).toBe("dmg-builder@1.2.7")
    expect(bundle.filenameWithExt).toBe(filename)
    expect(bundle.checksums[bundle.filenameWithExt]).toBe(sha256)
  })

  test("pins a checksum for every published bundle and nothing else", ({ expect }) => {
    expect(Object.keys(getDmgbuildBundle("arm64").checksums).sort()).toEqual(["dmgbuild-bundle-arm64-cc96fa2.tar.gz", "dmgbuild-bundle-x86_64-cc96fa2.tar.gz"])
  })
})
