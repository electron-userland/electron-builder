import { createKeychain, deleteKeychain, generateKeychainName } from "out/codeSign"
import { assertThat } from "./helpers/fileAssert"
import test from "./helpers/avaEx"
import { CSC_LINK } from "./helpers/codeSignData"
import { executeFinally, all } from "out/util/promise"
import { removePassword } from "out/util/util"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/util/awaiter")

if (process.env.CSC_KEY_PASSWORD == null) {
  console.warn("Skip keychain-specific tests because CSC_KEY_PASSWORD is not defined")
}
else {
  test.ifOsx("create keychain", async() => {
    const keychainName = generateKeychainName()
    await executeFinally(createKeychain(keychainName, CSC_LINK, process.env.CSC_KEY_PASSWORD)
      .then(result => {
        assertThat(result.keychainName).isNotEmpty()
      }), () => all([deleteKeychain(keychainName)]))
  })

  test.ifOsx("create keychain with installers", async() => {
    const keychainName = generateKeychainName()
    await executeFinally(createKeychain(keychainName, CSC_LINK, process.env.CSC_KEY_PASSWORD)
      .then(result => {
        assertThat(result.keychainName).isNotEmpty()
      }), () => all([deleteKeychain(keychainName)]))
  })
}

test.ifOsx("remove password from log", async () => {
  assertThat(removePassword("seq -P foo -B")).isEqualTo("seq -P 2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae (sha256 hash) -B")
  assertThat(removePassword("pass:foo")).isEqualTo("pass:2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae (sha256 hash)")
})