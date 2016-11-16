import { download } from "out/util/httpRequest"
import { tmpdir } from "os"
import { randomBytes } from "crypto"
import { assertThat } from "./helpers/fileAssert"
import * as path from "path"

test.ifDevOrLinuxCi("download to nonexistent dir", async () => {
  const tempFile = path.join(tmpdir(), `${process.pid}-${randomBytes(8).toString("hex")}`, Date.now().toString(), "foo.txt")
  await download("https://drive.google.com/uc?export=download&id=0Bz3JwZ-jqfRONTkzTGlsMkM2TlE", tempFile)
  await assertThat(tempFile).isFile()
})