import { createKeychain, removeKeychain } from "app-builder-lib/internal"
import { removePassword, TmpDir } from "builder-util"
import { getMacSigningIdentity } from "../helpers/packTester.js"
import { afterEach } from "vitest"

describe.ifMac("macos keychain", { sequential: true }, () => {
  const tmpDir = new TmpDir("mac-code-sign-test")

  afterEach(() => tmpDir.cleanup())

  test("create keychain", async ({ expect }) => {
    const { p12Base64, password } = await getMacSigningIdentity()
    const result = await createKeychain({ tmpDir, cscLink: p12Base64, cscKeyPassword: password, currentDir: process.cwd() })
    expect(result.keychainFile).not.toEqual("")
    await removeKeychain(result.keychainFile!)
  })

  test("create keychain with installers", async ({ expect }) => {
    const { p12Base64, password } = await getMacSigningIdentity()
    const result = await createKeychain({ tmpDir, cscLink: p12Base64, cscKeyPassword: password, currentDir: process.cwd() })
    expect(result.keychainFile).not.toEqual("")
    await removeKeychain(result.keychainFile!)
  })
})

// TODO: fix me
test.skip("remove password from log", ({ expect }) => {
  expect(removePassword("seq -P foo -B")).toMatchSnapshot()
  expect(removePassword("pass:foo")).toMatchSnapshot()
  // noinspection SpellCheckingInspection
  expect(removePassword("/usr/bin/productbuild -P wefwef")).toMatchSnapshot()
  expect(removePassword(" /p foo")).toMatchSnapshot()
  expect(removePassword('ConvertTo-SecureString -String "test"')).toMatchSnapshot()
  expect(
    removePassword(
      '(Get-PfxData "C:\\Users\\develar\\AppData\\Local\\Temp\\electron-builder-yBY8D2\\0-1.p12" -Password (ConvertTo-SecureString -String "test" -Force -AsPlainText)).EndEntityCertificates.Subject'
    )
  ).toMatchSnapshot()
})
