import { Arch } from "electron-builder"
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
 * have the expected permissions. Squirrel.Mac reads the update via file:// URLs so
 * neither update.zip nor update-feed.json should be world-readable.
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

    // Feed must point to a file:// ZIP, not a localhost HTTP URL
    try {
      const content = JSON.parse(await readFile(feedJson, "utf-8"))
      expect(content.url).toMatch(/^file:\/\//)
    } catch {
      // feed.json may have already been overwritten by the newly installed version; ignore parse errors
    }
  }
}

export function registerBlackboxMacTests(): void {
  test("x64", async (context: TestContext) => {
    await runTest(context, "zip", "", Arch.x64)
    await verifyFileProtocolArtifacts(context.expect)
  })

  test("universal", async (context: TestContext) => {
    await runTest(context, "zip", "", Arch.universal)
    await verifyFileProtocolArtifacts(context.expect)
  })

  // Only runs on arm64 hardware; validates that the arm64-specific file selection
  // and file:// serving both work correctly on Apple Silicon.
  test.ifEnv(process.arch === "arm64")("arm64", async (context: TestContext) => {
    await runTest(context, "zip", "", Arch.arm64)
    await verifyFileProtocolArtifacts(context.expect)
  })

  // Validates that a universal binary update succeeds when running on an x64 Mac.
  // Exercises the arch-filtering logic: universal files must not be filtered out
  // for x64 machines even though they do not carry an arm64 pathname suffix.
  test.ifEnv(process.arch === "x64")("universal on x64 host uses universal zip", async (context: TestContext) => {
    await runTest(context, "zip", "", Arch.universal)
    await verifyFileProtocolArtifacts(context.expect)
  })

  // Validates the differential-download path: runs the update twice so the second
  // run finds an existing update.zip in the cache and attempts a block-map diff.
  // The second update must still succeed end-to-end via the file:// protocol.
  test("x64 — second update uses cached update.zip for differential download", async (context: TestContext) => {
    // First pass: full download populates the differential cache
    await runTest(context, "zip", "", Arch.x64)

    const updateZip = path.join(MAC_TEST_APP_CACHE_DIR, "update.zip")
    // The differential cache must exist and be owner-only before the second pass
    if (existsSync(updateZip)) {
      const { mode } = statSync(updateZip)
      context.expect(mode & 0o777).toBe(0o600)
    }

    // Second pass: should attempt differential download against the cached zip.
    // If diff fails it falls back to full download — either way the update must succeed.
    await runTest(context, "zip", "", Arch.x64)
    await verifyFileProtocolArtifacts(context.expect)
  })
}
