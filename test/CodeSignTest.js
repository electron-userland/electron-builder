import { createKeychain, deleteKeychain, generateKeychainName } from "out/codeSign"
import assertThat from "should/as-function"
import test from "./helpers/avaEx"
import { CSC_NAME, CSC_LINK, CSC_KEY_PASSWORD } from "./helpers/codeSignData"
import promises from "out/promise"

test.ifOsx("create keychain", async () => {
  const keychainName = generateKeychainName()
  await promises.executeFinally(createKeychain(keychainName, CSC_LINK, CSC_KEY_PASSWORD)
    .then(result => {
      assertThat(result.cscKeychainName).not.empty()
      assertThat(result.cscName).equal(CSC_NAME)
    }), () => promises.all([deleteKeychain(keychainName)]))
})