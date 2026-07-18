import { assertSafeArtifactName, computeSafeArtifactNameIfNeeded, isSafeGithubName } from "app-builder-lib/internal"

// ── isSafeGithubName ─────────────────────────────────────────────────────────

test("isSafeGithubName accepts names limited to [0-9A-Za-z._-]", ({ expect }) => {
  expect(isSafeGithubName("My-App-Setup-1.0.0.exe")).toBe(true)
  expect(isSafeGithubName("app_1.0.0-x64.AppImage")).toBe(true)
})

test("isSafeGithubName rejects spaces and non-ascii characters", ({ expect }) => {
  expect(isSafeGithubName("My App Setup 1.0.0.exe")).toBe(false)
  expect(isSafeGithubName("Test App ßW-1.1.0.AppImage")).toBe(false)
  expect(isSafeGithubName("a/b.exe")).toBe(false)
})

// ── computeSafeArtifactNameIfNeeded ──────────────────────────────────────────

test("computeSafeArtifactNameIfNeeded returns null when the name is already safe", ({ expect }) => {
  const producer = () => "should-not-be-used.exe"
  expect(computeSafeArtifactNameIfNeeded("My-App-1.0.0.exe", producer)).toBeNull()
})

test("computeSafeArtifactNameIfNeeded replaces only spaces when that is the sole problem", ({ expect }) => {
  const producer = () => "should-not-be-used.exe"
  expect(computeSafeArtifactNameIfNeeded("My App Setup 1.0.0.exe", producer)).toBe("My-App-Setup-1.0.0.exe")
})

test("computeSafeArtifactNameIfNeeded falls back to the producer for names unsafe beyond spaces", ({ expect }) => {
  const producer = () => "TestApp-1.1.0-x86_64.AppImage"
  expect(computeSafeArtifactNameIfNeeded("Test App ßW-1.1.0.AppImage", producer)).toBe("TestApp-1.1.0-x86_64.AppImage")
})

test("computeSafeArtifactNameIfNeeded uses the producer when there is no suggested name", ({ expect }) => {
  expect(computeSafeArtifactNameIfNeeded(null, () => "produced-1.0.0.exe")).toBe("produced-1.0.0.exe")
})

// ── assertSafeArtifactName ───────────────────────────────────────────────────

test("assertSafeArtifactName accepts ordinary artifact names (incl. spaces and subdirectories)", ({ expect }) => {
  expect(() => assertSafeArtifactName("My App Setup 1.0.0.exe")).not.toThrow()
  expect(() => assertSafeArtifactName("Test App ßW-1.1.0.AppImage")).not.toThrow()
  expect(() => assertSafeArtifactName("nested/My-App-1.0.0.exe")).not.toThrow()
})

test("assertSafeArtifactName rejects absolute, drive-prefixed, and parent-relative names", ({ expect }) => {
  expect(() => assertSafeArtifactName("../../etc/My-App.exe")).toThrow(/must be a relative file name/)
  expect(() => assertSafeArtifactName("..")).toThrow(/must be a relative file name/)
  expect(() => assertSafeArtifactName("/abs/My-App.exe")).toThrow(/must be a relative file name/)
  expect(() => assertSafeArtifactName("C:\\Windows\\My-App.exe")).toThrow(/must be a relative file name/)
})
