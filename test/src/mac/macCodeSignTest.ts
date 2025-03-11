import { createKeychain } from "app-builder-lib/out/codeSign/macCodeSign"
import { removePassword, TmpDir } from "builder-util"
import { CSC_LINK } from "../helpers/codeSignData"
import { afterEach } from "vitest"

const tmpDir = new TmpDir("mac-code-sign-test")

test.ifMac("create keychain", async ({ expect }) => {
  const result = await createKeychain({ tmpDir, cscLink: CSC_LINK, cscKeyPassword: process.env.CSC_KEY_PASSWORD!, currentDir: process.cwd() })
  expect(result.keychainFile).not.toEqual("")
})

afterEach(() => tmpDir.cleanup())

test.ifMac("create keychain with installers", async ({ expect }) => {
  const result = await createKeychain({ tmpDir, cscLink: CSC_LINK, cscKeyPassword: process.env.CSC_KEY_PASSWORD!, currentDir: process.cwd() })
  expect(result.keychainFile).not.toEqual("")
})

test.ifDevOrLinuxCi("remove password from log", async ({ expect }) => {
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
