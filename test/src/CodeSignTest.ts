import { createKeychain } from "out/codeSign"
import { assertThat } from "./helpers/fileAssert"
import test from "./helpers/avaEx"
import { CSC_LINK } from "./helpers/codeSignData"
import { removePassword } from "out/util/util"
import { TmpDir } from "out/util/tmp"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/util/awaiter")

const tmpDir = new TmpDir()

if (process.env.CSC_KEY_PASSWORD == null) {
  console.warn("Skip keychain-specific tests because CSC_KEY_PASSWORD is not defined")
}
else {
  test.ifOsx("create keychain", async () => {
    const result = await createKeychain(tmpDir, CSC_LINK, process.env.CSC_KEY_PASSWORD)
    assertThat(result.keychainName).isNotEmpty()
  })

  test.ifOsx("create keychain with installers", async () => {
    const result = await createKeychain(tmpDir, CSC_LINK, process.env.CSC_KEY_PASSWORD)
    assertThat(result.keychainName).isNotEmpty()
  })
}

test.ifOsx("remove password from log", async () => {
  assertThat(removePassword("seq -P foo -B")).isEqualTo("seq -P 2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae (sha256 hash) -B")
  assertThat(removePassword("pass:foo")).isEqualTo("pass:2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae (sha256 hash)")
})