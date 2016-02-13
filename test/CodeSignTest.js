import { createKeychain, deleteKeychain, generateKeychainName } from "../out/codeSign"
import assertThat from "should/as-function"
import avaTest from "ava-tf"
import { CSC_NAME, CSC_LINK, CSC_KEY_PASSWORD } from "./helpers/codeSignData"
import promises from "../out/promise"

function test(doNotSkip, name, testFunction) {
  if (doNotSkip) {
    avaTest(name, testFunction)
  }
  else {
    avaTest.skip(name, testFunction)
  }
}

test(process.platform === "darwin", "create keychain", async () => {
  const keychainName = generateKeychainName()
  await promises.executeFinally(createKeychain(keychainName, CSC_LINK, CSC_KEY_PASSWORD)
    .then(result => {
      assertThat(result.cscKeychainName).not.empty()
      assertThat(result.cscName).equal(CSC_NAME)
    }), error => promises.all([deleteKeychain(keychainName)]))
})