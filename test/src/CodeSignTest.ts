import { createKeychain, deleteKeychain, generateKeychainName } from "out/codeSign"
import * as assertThat from "should/as-function"
import test from "./helpers/avaEx"
import { CSC_NAME, CSC_LINK, CSC_KEY_PASSWORD } from "./helpers/codeSignData"
import { executeFinally, all } from "out/promise"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

test.ifOsx("create keychain", async (t) => {
  const keychainName = generateKeychainName()
  await executeFinally(createKeychain(keychainName, CSC_LINK, CSC_KEY_PASSWORD)
    .then(result => {
      assertThat(result.cscKeychainName).not.empty()
      assertThat(result.cscName).equal(CSC_NAME)
    }), () => all([deleteKeychain(keychainName)]))
})