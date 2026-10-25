import { createKeychain, removeKeychain } from "app-builder-lib/out/codeSign/macCodeSign"
import { removePassword, TmpDir } from "builder-util"
import { MAC_CSC_LINK } from "../helpers/codeSignData"
import { afterEach } from "vitest"

describe.ifMac.runIf(MAC_CSC_LINK && process.env.CSC_KEY_PASSWORD)("macos keychain", { sequential: true }, () => {
  const tmpDir = new TmpDir("mac-code-sign-test")

  afterEach(() => tmpDir.cleanup())

  test("create keychain", async ({ expect }) => {
    const result = await createKeychain({ tmpDir, cscLink: MAC_CSC_LINK, cscKeyPassword: process.env.CSC_KEY_PASSWORD!, currentDir: process.cwd() })
    expect(result.keychainFile).not.toEqual("")
    await removeKeychain(result.keychainFile!)
  })

  test("create keychain with installers", async ({ expect }) => {
    const result = await createKeychain({ tmpDir, cscLink: MAC_CSC_LINK, cscKeyPassword: process.env.CSC_KEY_PASSWORD!, currentDir: process.cwd() })
    expect(result.keychainFile).not.toEqual("")
    await removeKeychain(result.keychainFile!)
  })
})

// Fingerprints are keyed per process, so snapshots show where one stands, not its value
const withoutFingerprints = (text: string) => text.replace(/[a-f0-9]{32} \(redacted fingerprint\)/g, "<fingerprint>")

// TODO: fix me
test.skip("remove password from log", ({ expect }) => {
  expect(withoutFingerprints(removePassword("seq -P foo -B"))).toMatchSnapshot()
  expect(withoutFingerprints(removePassword("pass:foo"))).toMatchSnapshot()
  // noinspection SpellCheckingInspection
  expect(withoutFingerprints(removePassword("/usr/bin/productbuild -P wefwef"))).toMatchSnapshot()
  expect(withoutFingerprints(removePassword(" /p foo"))).toMatchSnapshot()
  expect(withoutFingerprints(removePassword('ConvertTo-SecureString -String "test"'))).toMatchSnapshot()
  expect(
    withoutFingerprints(
      removePassword(
        '(Get-PfxData "C:\\Users\\develar\\AppData\\Local\\Temp\\electron-builder-yBY8D2\\0-1.p12" -Password (ConvertTo-SecureString -String "test" -Force -AsPlainText)).EndEntityCertificates.Subject'
      )
    )
  ).toMatchSnapshot()
})
