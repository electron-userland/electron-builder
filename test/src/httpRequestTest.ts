import test from "./helpers/avaEx"
import { download } from "out/util/httpRequest"
import { tmpdir } from "os"
import { randomBytes } from "crypto"
import { assertThat } from "./helpers/fileAssert"
import * as path from "path"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/util/awaiter")

test("download to nonexistent dir", () => {
  const tempFile = path.join(tmpdir(), `${process.pid}-${randomBytes(8).toString("hex")}`, Date.now().toString(), "foo.txt")
  return download("https://drive.google.com/uc?export=download&id=0Bz3JwZ-jqfRONTkzTGlsMkM2TlE", tempFile)
    .then(() => assertThat(tempFile).isFile())
})