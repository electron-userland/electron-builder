import { createKeychain } from "electron-builder/out/codeSign"
import { CSC_LINK } from "../helpers/codeSignData"
import { removePassword } from "electron-builder-util"
import { TmpDir } from "electron-builder-util/out/tmp"

if (process.env.CSC_KEY_PASSWORD == null) {
  fit("Skip keychain-specific tests because CSC_KEY_PASSWORD is not defined", () => {
    console.warn("[SKIP] Skip keychain-specific tests because CSC_KEY_PASSWORD is not defined")
  })
}

const tmpDir = new TmpDir()

test.ifMac("create keychain", async () => {
  const result = await createKeychain(tmpDir, CSC_LINK, process.env.CSC_KEY_PASSWORD)
  expect(result.keychainName).not.toEqual("")
})

test.ifMac("create keychain with installers", async () => {
  const result = await createKeychain(tmpDir, CSC_LINK, process.env.CSC_KEY_PASSWORD)
  expect(result.keychainName).not.toEqual("")
})

test.ifDevOrLinuxCi("remove password from log", async () => {
  expect(removePassword("seq -P foo -B")).toEqual("seq -P 2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae (sha256 hash) -B")
  expect(removePassword("pass:foo")).toEqual("pass:2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae (sha256 hash)")
  expect(removePassword("/usr/bin/productbuild -P wefwef")).toEqual("/usr/bin/productbuild -P 56ef615b2e26c3b9a10dc2824238fb8b8a154ec7db4907ec6ee357ed7bb350b7 (sha256 hash)")
})