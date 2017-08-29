import { httpExecutor } from "builder-util/out/nodeHttpExecutor"
import { TmpDir } from "temp-file"
import { assertThat } from "./helpers/fileAssert"

if (process.env.ELECTRON_BUILDER_OFFLINE === "true") {
  fit("Skip httpRequestTest — ELECTRON_BUILDER_OFFLINE is defined", () => {
    console.warn("[SKIP] Skip httpRequestTest — ELECTRON_BUILDER_OFFLINE is defined")
  })
}

const tmpDir = new TmpDir()

afterEach(() => tmpDir.cleanup())

test.ifAll.ifDevOrLinuxCi("download to nonexistent dir", async () => {
  const tempFile = await tmpDir.getTempFile()
  await httpExecutor.download("https://drive.google.com/uc?export=download&id=0Bz3JwZ-jqfRONTkzTGlsMkM2TlE", tempFile)
  await assertThat(tempFile).isFile()
})