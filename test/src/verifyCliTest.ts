import { createUpdateManifestSignatures, Executables, generateUpdateSigningKeypair, InvalidConfigurationError, log, parsePrivateKey, serializeToYaml } from "builder-util"
import { hashFile } from "builder-util-runtime"
import { configureVerifyCommand, verify } from "electron-builder/src/cli/verify"
import { mkdir, writeFile } from "fs/promises"
import * as path from "path"
import { afterEach, beforeEach, vi } from "vitest"
import yargs from "yargs"

// The fixtures hold only update manifests, Linux artifacts and app-update.yml files, so every check runs on every host.

const key = generateUpdateSigningKeypair()

beforeEach(() => {
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY", undefined)
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE", undefined)
  for (const level of ["info", "warn", "error"] as const) {
    vi.spyOn(log, level).mockImplementation(() => undefined)
  }
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

async function write(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, content)
}

async function createProject(projectDir: string, config?: string): Promise<void> {
  await write(path.join(projectDir, "package.json"), JSON.stringify({ name: "verify-test", version: "1.0.0", description: "test", author: "test" }))
  if (config != null) {
    await write(path.join(projectDir, "electron-builder.yml"), config)
  }
}

/** A Linux build output: an AppImage, its manifest (signed unless `signed` is false) and, unless `withApp` is false, the packaged app. */
async function writeLinuxOutput(outDir: string, options: { signed?: boolean; withApp?: boolean } = {}): Promise<void> {
  const artifact = path.join(outDir, "verify-test-1.0.0.AppImage")
  await write(artifact, "AppImage")
  const info: any = { version: "1.0.0", files: [{ url: "verify-test-1.0.0.AppImage", sha512: await hashFile(artifact), size: 8 }], releaseDate: "2026-10-24T00:00:00.000Z" }
  let manifest = info
  if (options.signed !== false) {
    const signatures = createUpdateManifestSignatures(info, [parsePrivateKey(key.privateKeyPem)])
    manifest = { ...info, signature: signatures[0].signature, signatures }
  }
  await write(path.join(outDir, "latest-linux.yml"), serializeToYaml(manifest, false, true))
  if (options.withApp !== false) {
    await write(
      path.join(outDir, "linux-unpacked", "resources", "app-update.yml"),
      serializeToYaml({ provider: "generic", url: "https://example.com/updates", updateManifestPublicKey: key.publicKeyPem })
    )
  }
}

const errorOf = (promise: Promise<unknown>): Promise<any> =>
  promise.then(
    () => null,
    (e: unknown) => e
  )

test("configureVerifyCommand parses the directory, --allow-unverified, --projectDir and -c overrides", ({ expect }) => {
  const parsed: any = yargs([] as string[])
    .exitProcess(false)
    .fail((msg: string, err: Error) => {
      throw err ?? new Error(msg)
    })
    .command("verify [dir]", "", configureVerifyCommand)
    .parseSync(["verify", "release", "--allow-unverified", "--project", "/project", "-c.mac.notarize=false"])
  expect(parsed.dir).toBe("release")
  expect(parsed["allow-unverified"]).toBe(true)
  expect(parsed.projectDir).toBe("/project")
  // coerced like a build's -c values, when the configuration is loaded (see below)
  expect(parsed.config).toEqual({ mac: { notarize: "false" } })
})

test("-c overrides apply as in a build: -c.linux.updateManifest=false skips the signature check", async ({ expect, tmpDir }) => {
  const projectDir = await tmpDir.createTempDir()
  await createProject(projectDir)
  await writeLinuxOutput(path.join(projectDir, "dist"), { signed: false })
  const results = await verify({ projectDir, config: { linux: { updateManifest: "false" } } })
  expect(results.map(it => [it.check, it.status])).toEqual([
    ["update manifest signature", "skipped"],
    ["update manifest file", "verified"],
  ])
})

test("checks in an Executables.run scope of toolsets.executables, so codesign, stapler, pkgutil and PowerShell come from it", async ({ expect, tmpDir }) => {
  const projectDir = await tmpDir.createTempDir()
  await createProject(projectDir, "toolsets:\n  executables:\n    codesign: file:///opt/tools/codesign\n    stapler: file:///opt/tools/stapler\n")
  await writeLinuxOutput(path.join(projectDir, "dist"))
  const scopes: Array<unknown> = []
  const run = vi.spyOn(Executables, "run").mockImplementation((executables, fn) => {
    scopes.push(executables)
    return fn()
  })
  await verify({ projectDir })
  expect(run).toHaveBeenCalledTimes(1)
  expect(scopes).toEqual([{ codesign: "file:///opt/tools/codesign", stapler: "file:///opt/tools/stapler" }])
})

test("verifies the output directory of the project configuration", async ({ expect, tmpDir }) => {
  const projectDir = await tmpDir.createTempDir()
  await createProject(projectDir, "directories:\n  output: release-${version}\n")
  await writeLinuxOutput(path.join(projectDir, "release-1.0.0"))
  const results = await verify({ projectDir })
  expect(results.map(it => [it.check, it.status])).toEqual([
    ["update manifest signature", "verified"],
    ["update manifest file", "verified"],
  ])
})

test("verifies the directory passed on the command line instead", async ({ expect, tmpDir }) => {
  const projectDir = await tmpDir.createTempDir()
  await createProject(projectDir)
  const outDir = await tmpDir.createTempDir()
  await writeLinuxOutput(outDir)
  expect(await verify({ projectDir, dir: outDir })).toHaveLength(2)
})

test("an output directory that depends on the platform or arch must be passed on the command line", async ({ expect, tmpDir }) => {
  const projectDir = await tmpDir.createTempDir()
  await createProject(projectDir, "directories:\n  output: dist/${os}-${arch}\n")
  const error = await errorOf(verify({ projectDir }))
  expect(error).toBeInstanceOf(InvalidConfigurationError)
  expect(error.message).toContain("depends on the platform or arch, so pass the output directory to verify")
})

test("fails with ERR_ELECTRON_BUILDER_VERIFICATION_FAILED when a check fails", async ({ expect, tmpDir }) => {
  const projectDir = await tmpDir.createTempDir()
  await createProject(projectDir)
  await writeLinuxOutput(path.join(projectDir, "dist"), { signed: false })
  const error = await errorOf(verify({ projectDir }))
  expect(error).toBeInstanceOf(InvalidConfigurationError)
  expect(error.code).toBe("ERR_ELECTRON_BUILDER_VERIFICATION_FAILED")
  expect(error.message).toContain("1 failed")
  expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ check: "update manifest signature", reason: expect.stringContaining("not signed") }), "verification failed")
})

test("a check that cannot run here fails, unless --allow-unverified is passed", async ({ expect, tmpDir }) => {
  const projectDir = await tmpDir.createTempDir()
  await createProject(projectDir)
  // no packaged app and no key in the configuration: nothing to verify the manifest against
  await writeLinuxOutput(path.join(projectDir, "dist"), { withApp: false })
  const error = await errorOf(verify({ projectDir }))
  expect(error?.code).toBe("ERR_ELECTRON_BUILDER_VERIFICATION_FAILED")
  expect(error.message).toContain("Pass --allow-unverified")

  const results = await verify({ projectDir, "allow-unverified": true })
  expect(results.map(it => it.status)).toEqual(["unverifiable", "verified"])
  expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ check: "update manifest signature" }), "cannot be verified")
})

test("fails when there is nothing to verify, or no output directory", async ({ expect, tmpDir }) => {
  const projectDir = await tmpDir.createTempDir()
  await createProject(projectDir)
  await expect(verify({ projectDir })).rejects.toThrow("does not exist: build first, or pass the directory to verify")
  await mkdir(path.join(projectDir, "dist"))
  await expect(verify({ projectDir })).rejects.toThrow("nothing to verify in")
})
