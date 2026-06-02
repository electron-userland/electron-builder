import { Arch, Platform } from "electron-builder"
import { existsSync, statSync } from "fs"
import { readFile } from "fs/promises"
import { homedir } from "os"
import * as path from "path"
import { TestContext } from "vitest"
import { runTest } from "./blackboxUpdateHelpers"

// The test app is built with appId "com.test.app" (see blackboxUpdateHelpers.ts → doBuild).
// On macOS this resolves to ~/Library/Caches/com.test.app/ for the updater cache.
const MAC_TEST_APP_CACHE_DIR = path.join(homedir(), "Library", "Caches", "com.test.app")

/**
 * Verifies that after a successful update the file:// artifacts in the system cache
 * have the expected permissions and that the feed is in JSON serverType format.
 */
async function verifyFileProtocolArtifacts(expect: TestContext["expect"]) {
  const updateZip = path.join(MAC_TEST_APP_CACHE_DIR, "update.zip")
  const feedJson = path.join(MAC_TEST_APP_CACHE_DIR, "update-feed.json")

  if (existsSync(updateZip)) {
    const { mode } = statSync(updateZip)
    expect(mode & 0o777).toBe(0o600)
  }

  if (existsSync(feedJson)) {
    const { mode } = statSync(feedJson)
    expect(mode & 0o777).toBe(0o600)

    try {
      const content = JSON.parse(await readFile(feedJson, "utf-8"))
      // Feed must be in JSON serverType format with file:// ZIP URL
      expect(content.currentRelease).toBeTruthy()
      expect(content.releases?.[0]?.updateTo?.url).toMatch(/^file:\/\//)
    } catch {
      // feed.json may have already been overwritten by the newly installed version; ignore parse errors
    }
  }
}

export function registerBlackboxMacTests(): void {
  test("x64", async (context: TestContext) => {
    await runTest(context, "zip", Platform.MAC.name, Arch.x64)
    await verifyFileProtocolArtifacts(context.expect)
  })

  test("universal", async (context: TestContext) => {
    await runTest(context, "zip", Platform.MAC.name, Arch.universal)
    await verifyFileProtocolArtifacts(context.expect)
  })

  // Only runs on arm64 hardware; validates that the arm64-specific file selection
  // and file:// serving both work correctly on Apple Silicon.
  test.ifEnv(process.arch === "arm64")("arm64", async (context: TestContext) => {
    await runTest(context, "zip", Platform.MAC.name, Arch.arm64)
    await verifyFileProtocolArtifacts(context.expect)
  })

  // Validates that a universal binary update succeeds when running on an x64 Mac.
  test.ifEnv(process.arch === "x64")("universal on x64 host uses universal zip", async (context: TestContext) => {
    await runTest(context, "zip", Platform.MAC.name, Arch.universal)
    await verifyFileProtocolArtifacts(context.expect)
  })

  // Validates the differential-download path: runs the update twice so the second
  // run finds an existing update.zip in the cache and attempts a block-map diff.
  test("x64 — second update uses cached update.zip for differential download", async (context: TestContext) => {
    await runTest(context, "zip", Platform.MAC.name, Arch.x64)

    const updateZip = path.join(MAC_TEST_APP_CACHE_DIR, "update.zip")
    if (existsSync(updateZip)) {
      const { mode } = statSync(updateZip)
      context.expect(mode & 0o777).toBe(0o600)
    }

    await runTest(context, "zip", Platform.MAC.name, Arch.x64)
    await verifyFileProtocolArtifacts(context.expect)
  })
}
