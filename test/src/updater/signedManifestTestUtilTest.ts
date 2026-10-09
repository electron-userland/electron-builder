import { afterAll } from "vitest"
import { generateUpdateSigningKeypair, serializeToYaml, TmpDir } from "builder-util"
import { collectManifestSignatures, computeUpdateManifestKeyId, UpdateInfo, verifyManifestSignatures } from "builder-util-runtime"
import { copy, emptyDir, ensureDir, ensureSymlink, outputFile, readFile, readlink } from "fs-extra"
import { load } from "js-yaml"
import path from "path"
import { removeUnstableProperties } from "../helpers/packTester"
import { findFile, findUpdateManifests, readEmbeddedUpdateConfig, readUpdateManifest, resignManifest, rewriteServedManifests } from "./signedManifestTestUtil"

const tmpDir = new TmpDir("signed-manifest-test-util")
afterAll(() => tmpDir.cleanup())

function makeInfo(): UpdateInfo {
  return {
    version: "1.0.1",
    files: [{ url: "TestApp.zip", sha512: "hash", size: 100 }],
    path: "TestApp.zip",
    sha512: "hash",
    releaseDate: "2026-01-01T00:00:00.000Z",
  }
}

describe("resignManifest", () => {
  const keyA = generateUpdateSigningKeypair()
  const keyB = generateUpdateSigningKeypair()

  test("re-signs a manifest by the given keys only, dropping the previous signatures", ({ expect }) => {
    const signedByA = resignManifest(makeInfo(), [keyA.privateKeyPem])
    expect(signedByA.signatures?.map(it => it.keyId)).toEqual([computeUpdateManifestKeyId(keyA.publicKeyPem)])
    expect(signedByA.signature).toBe(signedByA.signatures![0].signature)

    const signedByB = resignManifest(signedByA, [keyB.privateKeyPem])
    expect(signedByB.signatures?.map(it => it.keyId)).toEqual([computeUpdateManifestKeyId(keyB.publicKeyPem)])
    expect(signedByB.signature).toBe(signedByB.signatures![0].signature)
    expect(verifyManifestSignatures(signedByB, [keyB.publicKeyPem]).ok).toBe(true)
    // the installed app trusting A only must refuse it — this is the key-rotation negative case
    expect(verifyManifestSignatures(signedByB, [keyA.publicKeyPem]).ok).toBe(false)
    expect(collectManifestSignatures(signedByB)).toHaveLength(1)
  })

  test("dual-signs in key order, the first key filling the legacy signature", ({ expect }) => {
    const info = resignManifest(makeInfo(), [keyA.privateKeyPem, keyB.privateKeyPem])
    expect(info.signatures?.map(it => it.keyId)).toEqual([computeUpdateManifestKeyId(keyA.publicKeyPem), computeUpdateManifestKeyId(keyB.publicKeyPem)])
    expect(info.signature).toBe(info.signatures![0].signature)
    expect(verifyManifestSignatures(info, [keyA.publicKeyPem]).ok).toBe(true)
    expect(verifyManifestSignatures(info, [keyB.publicKeyPem]).ok).toBe(true)
  })

  test("strips every signature when no key is given", ({ expect }) => {
    const unsigned = resignManifest(resignManifest(makeInfo(), [keyA.privateKeyPem]), [])
    expect(unsigned.signature).toBeUndefined()
    expect(unsigned.signatures).toBeUndefined()
    expect(collectManifestSignatures(unsigned)).toHaveLength(0)
    expect(unsigned).toEqual(makeInfo())
  })
})

describe("served manifest files", () => {
  test("rewriteServedManifests rewrites every latest*.yml and restores the originals byte-for-byte", async ({ expect }) => {
    const keyA = generateUpdateSigningKeypair()
    const keyB = generateUpdateSigningKeypair()
    const root = await tmpDir.getTempDir({ prefix: "server-root" })
    const original = serializeToYaml(resignManifest(makeInfo(), [keyA.privateKeyPem]), false, true)
    await outputFile(path.join(root, "latest-mac.yml"), original)
    await outputFile(path.join(root, "TestApp.zip"), "not a manifest")

    expect((await findUpdateManifests(root)).map(it => path.basename(it))).toEqual(["latest-mac.yml"])

    const restore = await rewriteServedManifests(root, info => resignManifest(info, [keyB.privateKeyPem]))
    const rewritten = load(await readFile(path.join(root, "latest-mac.yml"), "utf8")) as UpdateInfo
    expect(rewritten.version).toBe("1.0.1")
    expect(verifyManifestSignatures(rewritten, [keyB.publicKeyPem]).ok).toBe(true)
    expect(verifyManifestSignatures(rewritten, [keyA.publicKeyPem]).ok).toBe(false)
    // the served manifest round-trips through YAML like updateInfoBuilder's output does
    expect(await readUpdateManifest(root)).toEqual(rewritten)

    await restore()
    expect(await readFile(path.join(root, "latest-mac.yml"), "utf8")).toBe(original)
    expect(await readFile(path.join(root, "TestApp.zip"), "utf8")).toBe("not a manifest")
  })

  test("readUpdateManifest requires exactly one latest*.yml", async ({ expect }) => {
    const dir = await tmpDir.getTempDir({ prefix: "dist" })
    await ensureDir(dir)
    await expect(readUpdateManifest(dir)).rejects.toThrow(/exactly one latest\*\.yml/)
    await outputFile(path.join(dir, "latest.yml"), serializeToYaml(makeInfo()))
    await outputFile(path.join(dir, "latest-linux.yml"), serializeToYaml(makeInfo()))
    await expect(readUpdateManifest(dir)).rejects.toThrow(/latest-linux\.yml, latest\.yml/)
  })

  test("readEmbeddedUpdateConfig finds the app-update.yml of the packaged app below the dist dir", async ({ expect }) => {
    const { publicKeyPem } = generateUpdateSigningKeypair()
    const dist = await tmpDir.getTempDir({ prefix: "dist" })
    const embedded = path.join(dist, "mac", "TestApp.app", "Contents", "Resources", "app-update.yml")
    await outputFile(embedded, serializeToYaml({ provider: "s3", bucket: "develar", path: "test", updateManifestPublicKey: publicKeyPem }))
    await outputFile(path.join(dist, "TestApp.zip"), "")

    expect(await findFile(dist, "app-update.yml")).toBe(embedded)
    expect(await findFile(dist, "missing.yml")).toBeNull()
    expect((await readEmbeddedUpdateConfig(dist)).updateManifestPublicKey).toBe(publicKeyPem)
    const empty = await tmpDir.getTempDir({ prefix: "empty" })
    await ensureDir(empty)
    await expect(readEmbeddedUpdateConfig(empty)).rejects.toThrow(/No app-update\.yml/)
  })
})

describe("serving several dists from one server root", () => {
  // The unpacked mac app carries relative framework symlinks (`Versions/Current -> A`). fs-extra `copy` with
  // `overwrite` refuses to replace such a symlink with an identical one (it compares the link targets, 'A' == 'A'),
  // so a second dist can only be copied into the served root after it was emptied — see runKeyRotationTest.
  test("a dist with relative symlinks can only be copied over a previous one after emptyDir", async ({ expect }) => {
    const base = await tmpDir.getTempDir({ prefix: "symlink-dist" })
    const dist = path.join(base, "dist")
    const serverRoot = path.join(base, "server-root")
    await outputFile(path.join(dist, "TestApp.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework"), "v2")
    await ensureSymlink("A", path.join(dist, "TestApp.app/Contents/Frameworks/Electron Framework.framework/Versions/Current"))

    await copy(dist, serverRoot, { recursive: true, overwrite: true })
    await expect(copy(dist, serverRoot, { recursive: true, overwrite: true })).rejects.toThrow(/Cannot copy 'A' to a subdirectory of itself/)

    await emptyDir(serverRoot)
    await copy(dist, serverRoot, { recursive: true, overwrite: true })
    expect(await readlink(path.join(serverRoot, "TestApp.app/Contents/Frameworks/Electron Framework.framework/Versions/Current"))).toBe("A")
  })
})

test("removeUnstableProperties scrubs manifest signatures and key ids for snapshots", ({ expect }) => {
  const { privateKeyPem } = generateUpdateSigningKeypair()
  const info = resignManifest(makeInfo(), [privateKeyPem])
  expect(removeUnstableProperties(info)).toEqual({
    version: "1.0.1",
    files: [{ url: "TestApp.zip", sha512: "@sha512", size: "@size" }],
    path: "TestApp.zip",
    sha512: "@sha512",
    releaseDate: "@releaseDate",
    signature: "@signature",
    signatures: [{ keyId: "@keyId", signature: "@signature" }],
  })
})
