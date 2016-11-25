import { createMacTargetTest } from "../helpers/packTester"
import { assertThat } from "../helpers/fileAssert"

test.ifMac("invalid target", () => assertThat(createMacTargetTest([<any>"ttt"], [])()).throws("Unknown target: ttt"))

test("only zip", createMacTargetTest(["zip"], ["Test App ßW-1.1.0-mac.zip"]))

if (process.env.CSC_KEY_PASSWORD != null) {
  test.ifMac("pkg", createMacTargetTest(["pkg"], ["Test App ßW-1.1.0.pkg"]))
}

test("tar.gz", createMacTargetTest(["tar.gz"], ["Test App ßW-1.1.0-mac.tar.gz"]))

// todo failed on Travis CI
//test("tar.xz", createTargetTest(["tar.xz"], ["Test App ßW-1.1.0-mac.tar.xz"]))