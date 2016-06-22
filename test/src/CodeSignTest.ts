import { createKeychain, deleteKeychain, generateKeychainName } from "out/codeSign"
import * as assertThat from "should/as-function"
import test from "./helpers/avaEx"
import {
  CSC_NAME, CSC_LINK,
  CSC_KEY_PASSWORD,
  CSC_INSTALLER_KEY_PASSWORD,
  CSC_INSTALLER_LINK
} from "./helpers/codeSignData"
import { executeFinally, all } from "out/util/promise"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/util/awaiter")

test.ifOsx("create keychain", async () => {
  const keychainName = generateKeychainName()
  await executeFinally(createKeychain(keychainName, CSC_LINK, CSC_KEY_PASSWORD)
    .then(result => {
      assertThat(result.keychainName).not.empty()
      assertThat(result.name).equal(CSC_NAME)
    }), () => all([deleteKeychain(keychainName)]))
})

test.ifOsx("create keychain with installers", async () => {
  const keychainName = generateKeychainName()
  await executeFinally(createKeychain(keychainName, CSC_LINK, CSC_KEY_PASSWORD, CSC_INSTALLER_LINK, CSC_INSTALLER_KEY_PASSWORD)
    .then(result => {
      assertThat(result.keychainName).not.empty()
      assertThat(result.name).equal(CSC_NAME)
    }), () => all([deleteKeychain(keychainName)]))
})