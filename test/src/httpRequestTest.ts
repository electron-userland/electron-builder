import { randomBytes } from "crypto"
import { download } from "electron-builder-http"
import { tmpdir } from "os"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"

if (process.env.ELECTRON_BUILDER_OFFLINE === "true") {
  fit("Skip httpRequestTest — ELECTRON_BUILDER_OFFLINE is defined", () => {
    console.warn("[SKIP] Skip httpRequestTest — ELECTRON_BUILDER_OFFLINE is defined")
  })
}

test.ifAll.ifDevOrLinuxCi("download to nonexistent dir", async () => {
  const tempFile = path.join(process.env.TEST_DIR || tmpdir(), `${process.pid}-${randomBytes(8).toString("hex")}`, Date.now().toString(16), "foo.txt")
  await download("https://drive.google.com/uc?export=download&id=0Bz3JwZ-jqfRONTkzTGlsMkM2TlE", tempFile)
  await assertThat(tempFile).isFile()
})