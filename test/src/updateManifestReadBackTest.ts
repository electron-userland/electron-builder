import { UpdateInfoFileTask, writeUpdateInfoFiles } from "app-builder-lib/internal"
import { generateUpdateSigningKeypair, parsePrivateKey, TmpDir } from "builder-util"
import { existsSync } from "fs"
import * as path from "path"
import { vi } from "vitest"

// writeUpdateInfoFiles reads every signed manifest back before writing any of them. Simulate a serialization bug for
// one manifest only - the .exe one, whose signature is computed over different content than what is written - and
// make sure that it is the one sorted LAST (zip manifests are processed first), so the test proves that a manifest
// which already verified is not written either.
vi.mock("builder-util", async importOriginal => {
  const actual = await importOriginal<typeof import("builder-util")>()
  return {
    ...actual,
    createUpdateManifestSignatures: vi.fn((info: any, keys: any) =>
      actual.createUpdateManifestSignatures(info.files[0].url.endsWith(".exe") ? { ...info, version: "9.9.9" } : info, keys)
    ),
  }
})

test("writeUpdateInfoFiles writes and uploads nothing when a signed manifest does not verify after serialization", async ({ expect }) => {
  const key = parsePrivateKey(generateUpdateSigningKeypair().privateKeyPem)
  const taskPackager: any = { updateSigningKeys: { value: Promise.resolve([key]) }, requireUpdateSigningKeys: () => Promise.resolve([key]) }
  const tmpDir = new TmpDir("eb-manifest-readback")
  try {
    const dir = await tmpDir.createTempDir()
    const task = (file: string, url: string): UpdateInfoFileTask => ({
      file: path.join(dir, file),
      info: { version: "1.0.0", files: [{ url, sha512: "c2hhNTEy" }] } as any,
      publishConfiguration: { provider: "s3", bucket: "test-bucket" } as any,
      packager: taskPackager,
      arch: null,
    })
    const emitArtifactCreated = vi.fn().mockResolvedValue(undefined)

    // listed first, but sorted after the zip manifest
    const write = writeUpdateInfoFiles([task("latest.yml", "App-Setup-1.0.0.exe"), task("latest-mac.yml", "App-1.0.0-mac.zip")], { emitArtifactCreated } as any)
    await expect(write).rejects.toThrow(/Internal error: .*latest\.yml does not verify with update-manifest signing key [0-9a-f]+ after serialization/)

    expect(existsSync(path.join(dir, "latest-mac.yml"))).toBe(false)
    expect(existsSync(path.join(dir, "latest.yml"))).toBe(false)
    expect(emitArtifactCreated).not.toHaveBeenCalled()
  } finally {
    await tmpDir.cleanup()
  }
})

test("writeUpdateInfoFiles writes every manifest when all of them verify", async ({ expect }) => {
  const key = parsePrivateKey(generateUpdateSigningKeypair().privateKeyPem)
  const taskPackager: any = { updateSigningKeys: { value: Promise.resolve([key]) }, requireUpdateSigningKeys: () => Promise.resolve([key]) }
  const tmpDir = new TmpDir("eb-manifest-readback")
  try {
    const dir = await tmpDir.createTempDir()
    const emitArtifactCreated = vi.fn().mockResolvedValue(undefined)
    await writeUpdateInfoFiles(
      [
        {
          file: path.join(dir, "latest-mac.yml"),
          info: { version: "1.0.0", files: [{ url: "App-1.0.0-mac.zip", sha512: "c2hhNTEy" }] } as any,
          publishConfiguration: { provider: "s3", bucket: "test-bucket" } as any,
          packager: taskPackager,
          arch: null,
        },
      ],
      { emitArtifactCreated } as any
    )
    expect(existsSync(path.join(dir, "latest-mac.yml"))).toBe(true)
    expect(emitArtifactCreated).toHaveBeenCalledTimes(1)
  } finally {
    await tmpDir.cleanup()
  }
})
