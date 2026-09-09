import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

// All `/usr/bin/security` invocations are intercepted so the temporary-keychain setup can be asserted
// deterministically on any platform — no real keychain, certificate, or Apple tooling required.
vi.mock("builder-util", async () => {
  const actual = await vi.importActual<typeof import("builder-util")>("builder-util")
  return { ...actual, exec: vi.fn().mockResolvedValue("") }
})

import { createKeychain } from "app-builder-lib/internal"
import { exec } from "builder-util"
import { outputFile } from "fs-extra"
import { rm } from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

// Keep the bundled root-certs keychain copy (the only real fs side effect of createKeychain's
// keychain setup) inside a sandbox instead of the user's real cache directory.
const cacheDir = path.join(os.tmpdir(), `eb-keychain-test-${process.pid}-${Date.now()}`)

beforeAll(() => {
  vi.stubEnv("ELECTRON_BUILDER_CACHE", cacheDir)
})

beforeEach(() => {
  vi.mocked(exec).mockClear()
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await rm(cacheDir, { recursive: true, force: true })
})

async function createDummyCert(tmpDir: { getTempFile: (opts?: { suffix?: string }) => Promise<string> }, name: string): Promise<string> {
  const certPath = await tmpDir.getTempFile({ suffix: `-${name}.p12` })
  await outputFile(certPath, Buffer.from("not a real p12 — only the path is used"))
  return certPath
}

function securityCalls(): Array<Array<string>> {
  return vi
    .mocked(exec)
    .mock.calls.filter(([file]) => file === "/usr/bin/security")
    .map(([, args]) => args as Array<string>)
}

function flagValue(args: Array<string>, flag: string): string | undefined {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}

describe("createKeychain security command wiring", { sequential: true }, () => {
  const cscKeyPassword = "p12-import-password"

  // The keychain password is random; recover it from the create-keychain call instead of mocking crypto.
  function keychainPasswordFromCalls(): string {
    const createCall = securityCalls().find(args => args[0] === "create-keychain")
    expect(createCall).toBeDefined()
    return flagValue(createCall!, "-p")!
  }

  test("set-key-partition-list receives the keychain password, not the certificate import password", async ({ tmpDir }) => {
    const cscLink = await createDummyCert(tmpDir, "app")
    await createKeychain({ tmpDir, cscLink, cscKeyPassword, currentDir: process.cwd() })

    const calls = securityCalls()
    const importCall = calls.find(args => args[0] === "import")
    const partitionCall = calls.find(args => args[0] === "set-key-partition-list")
    expect(importCall).toBeDefined()
    expect(partitionCall).toBeDefined()

    // `security import -P` keeps the certificate's own import password...
    expect(flagValue(importCall!, "-P")).toBe(cscKeyPassword)
    // ...while `set-key-partition-list -k` needs the keychain's unlock password (same value used by
    // create-keychain/unlock-keychain), otherwise SecKeychainUnlock rejects it and the build fails.
    expect(flagValue(partitionCall!, "-k")).toBe(keychainPasswordFromCalls())
  })

  test("every imported certificate gets its partition list set with the keychain password", async ({ tmpDir }) => {
    const cscLink = await createDummyCert(tmpDir, "app")
    const cscILink = await createDummyCert(tmpDir, "installer")
    const cscIKeyPassword = "installer-p12-password"
    await createKeychain({ tmpDir, cscLink, cscKeyPassword, cscILink, cscIKeyPassword, currentDir: process.cwd() })

    const calls = securityCalls()
    const importCalls = calls.filter(args => args[0] === "import")
    const partitionCalls = calls.filter(args => args[0] === "set-key-partition-list")
    expect(importCalls).toHaveLength(2)
    expect(partitionCalls).toHaveLength(2)

    // Each certificate is imported with its own password...
    expect(importCalls.map(args => flagValue(args, "-P")).sort()).toEqual([cscIKeyPassword, cscKeyPassword].sort())
    // ...but every set-key-partition-list call authenticates against the keychain itself.
    const keychainPassword = keychainPasswordFromCalls()
    for (const args of partitionCalls) {
      expect(flagValue(args, "-k")).toBe(keychainPassword)
    }
  })
})
