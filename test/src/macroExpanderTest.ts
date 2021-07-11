import { expandMacro } from "app-builder-lib/out/util/macroExpander"

const appInfoStub: any = {
  sanitizedProductName: "1",
  productName: "2",
  companyName: "3",
  version: "1.8.4+nightly-20210618",
  name: "Test",
  ext: "dmg",
}

// https://github.com/electron-userland/electron-builder/issues/5971
test("${version} macro with +", () => {
  const result = expandMacro("${name}-${version}-${arch}.${ext}", "arm64", appInfoStub, {}, true)
  expect(result).toBe("Test-1.8.4+nightly-20210618-arm64.dmg")
})

test("sanitized product name", () => {
  const result = expandMacro("${productName}-${arch}.${ext}", undefined, appInfoStub, {}, true)
  expect(result).toBe("1.dmg")
})

test("product name", () => {
  const result = expandMacro("${productName}-${arch}.${ext}", "x64", appInfoStub, {}, false)
  expect(result).toBe("2-x64.dmg")
})
