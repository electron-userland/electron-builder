import { expandMacro } from "app-builder-lib/internal"
import { vi } from "vitest"

const appInfoStub: any = {
  sanitizedProductName: "1",
  productName: "2",
  companyName: "3",
  version: "1.8.4+nightly-20210618",
  name: "Test",
  ext: "dmg",
}

// https://github.com/electron-userland/electron-builder/issues/5971
test("${version} macro with +", ({ expect }) => {
  const result = expandMacro("${name}-${version}-${arch}.${ext}", "arm64", appInfoStub, {}, true)
  expect(result).toBe("Test-1.8.4+nightly-20210618-arm64.dmg")
})

test("sanitized product name", ({ expect }) => {
  const result = expandMacro("${productName}-${arch}.${ext}", undefined, appInfoStub, {}, true)
  expect(result).toBe("1.dmg")
})

test("product name", ({ expect }) => {
  const result = expandMacro("${productName}-${arch}.${ext}", "x64", appInfoStub, {}, false)
  expect(result).toBe("2-x64.dmg")
})

test("${env.NAME} macro with a digit in the name", ({ expect }) => {
  vi.stubEnv("S3_BUCKET", "my-bucket")
  try {
    expect(expandMacro("${env.S3_BUCKET}/${name}", null, appInfoStub)).toBe("my-bucket/Test")
    expect(() => expandMacro("${env.UNDEFINED_ENV_2}", null, appInfoStub)).toThrow("env UNDEFINED_ENV_2 is not defined")
  } finally {
    vi.unstubAllEnvs()
  }
})
