import { getBinFromUrl } from "app-builder-lib/out/binDownload"

test("download binary from Github", async ({ expect }) => {
  const bin = await getBin()
  expect(bin).toBeTruthy()
})

test("download binary from Mirror with custom dir", async ({ expect }) => {
  const previousDir = process.env.ELECTRON_BUILDER_BINARIES_CUSTOM_DIR
  const previousMirror = process.env.ELECTRON_BUILDER_BINARIES_MIRROR
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR = "https://github.com/electron-userland/electron-builder-binaries/releases/download/"
  process.env.ELECTRON_BUILDER_BINARIES_CUSTOM_DIR = "linux-tools-mac-10.12.3"
  const bin = await getBin()
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR = previousMirror
  process.env.ELECTRON_BUILDER_BINARIES_CUSTOM_DIR = previousDir
  expect(bin).toBeTruthy()
})

test("download binary from Mirror", async ({ expect }) => {
  const previousMirror = process.env.ELECTRON_BUILDER_BINARIES_MIRROR
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR = "https://github.com/electron-userland/electron-builder-binaries/releases/download/"
  const bin = await getBin()
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR = previousMirror
  expect(bin).toBeTruthy()
})

test("download binary from Mirror with Url override", async ({ expect }) => {
  const previousUrl = process.env.ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL
  process.env.ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL = "https://github.com/electron-userland/electron-builder-binaries/releases/download/linux-tools-mac-10.12.3"
  const bin = await getBin()
  process.env.ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL = previousUrl
  expect(bin).toBeTruthy()
})
async function getBin() {
  return await getBinFromUrl("linux-tools", "mac-10.12.4", "CMiM/6mWOUghHkvgB2PmJdyGoblMdlGD+VBqbxiIea51ExDDe7GrZ82/wBy3KI0d5Wrrkc1Hkd1/lWMcbWUfuA==")
}

