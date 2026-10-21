import * as fsp from "fs/promises"
import * as path from "path"
import { stripVTControlCharacters } from "util"
import { derivePublicKeyPem, InvalidConfigurationError, loadUpdateSigningKeys, log, TmpDir } from "builder-util"
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

test("create-update-key tells to base64-encode the key file without printing the key, and that base64 loads as the reported key", async ({ expect }) => {
  await withTmpDir(async dir => {
    const outFile = path.join(dir, "update-private-key.pem")
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true)
    const info = vi.spyOn(log, "info").mockImplementation(() => undefined)
    let keyId: string
    let output: string
    try {
      keyId = (await createUpdateKey(outFile)).keyId
      output = stripVTControlCharacters([...info.mock.calls.map(it => it[1] ?? ""), ...stdout.mock.calls.map(it => String(it[0]))].join("\n"))
    } finally {
      stdout.mockRestore()
      info.mockRestore()
    }

    const pem = await fsp.readFile(outFile, "utf8")
    const encoded = Buffer.from(pem).toString("base64")
    expect(output).toContain("ELECTRON_BUILDER_UPDATE_SIGN_KEY environment variable, base64-encoded on one line")
    expect(output).toContain(process.platform === "win32" ? `[Convert]::ToBase64String([IO.File]::ReadAllBytes('${outFile}'))` : `base64 < '${outFile}' | tr -d '\\n'`)
    expect(output).toContain("ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE")
    // the private key is never printed, neither as PEM nor encoded
    expect(output).not.toContain(pem.split("\n")[1])
    expect(output).not.toContain(encoded.substring(64, 128))

    vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY", encoded)
    vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE", undefined)
    try {
      expect(loadUpdateSigningKeys().map(key => computeUpdateManifestKeyId(derivePublicKeyPem(key)))).toEqual([keyId])
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
