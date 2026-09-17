import * as fsp from "fs/promises"
import * as path from "path"
import { InvalidConfigurationError, log, TmpDir } from "builder-util"
import { computeUpdateManifestKeyId } from "builder-util-runtime"
import { createUpdateKey } from "electron-builder/src/cli/create-update-key"
import { vi } from "vitest"

async function withTmpDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const tmpDir = new TmpDir("eb-create-update-key")
  try {
    return await fn(await tmpDir.createTempDir())
  } finally {
    await tmpDir.cleanup()
  }
}

// the CLI helper prints the public key / key id to stdout and logs guidance; keep the test output clean
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true)
  const info = vi.spyOn(log, "info").mockImplementation(() => undefined)
  try {
    return await fn()
  } finally {
    stdout.mockRestore()
    info.mockRestore()
  }
}

test("create-update-key writes a fresh 0600 private key file and reports the matching key id", async ({ expect }) => {
  await withTmpDir(async dir => {
    const outFile = path.join(dir, "keys", "update-private-key.pem")
    await fsp.mkdir(path.dirname(outFile))
    const result = await quietly(() => createUpdateKey(outFile))

    expect(result.privateKeyPath).toBe(outFile)
    const pem = await fsp.readFile(outFile, "utf8")
    expect(pem).toMatch(/^-----BEGIN PRIVATE KEY-----\n[\s\S]+-----END PRIVATE KEY-----\n$/)
    if (process.platform !== "win32") {
      expect((await fsp.stat(outFile)).mode & 0o777).toBe(0o600)
    }
    expect(result.publicKeyPem).toMatch(/^-----BEGIN PUBLIC KEY-----/)
    expect(result.keyId).toBe(computeUpdateManifestKeyId(result.publicKeyPem))
  })
})

test("create-update-key refuses to overwrite an existing key file", async ({ expect }) => {
  await withTmpDir(async dir => {
    const outFile = path.join(dir, "update-private-key.pem")
    await fsp.writeFile(outFile, "existing key material\n", { mode: 0o644 })

    const error = await quietly(() =>
      createUpdateKey(outFile).then(
        () => null,
        (e: Error) => e
      )
    )
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error!.message).toBe(`Refusing to overwrite existing key file ${outFile}; delete it or pass a different --out path`)

    // the existing file is left untouched, content and permissions alike
    expect(await fsp.readFile(outFile, "utf8")).toBe("existing key material\n")
    if (process.platform !== "win32") {
      expect((await fsp.stat(outFile)).mode & 0o777).toBe(0o644)
    }
  })
})
