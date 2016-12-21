import { createKeychain } from "out/codeSign"
import { CSC_LINK } from "../helpers/codeSignData"
import { removePassword } from "out/util/util"
import { TmpDir } from "out/util/tmp"

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
})