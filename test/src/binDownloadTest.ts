import { getBinFromUrl } from "app-builder-lib/out/binDownload"

test("download binary from Github", async ({ expect }) => {
  const bin = await getBinFromUrl("linux-tools", "mac-10.12.4", "CMiM/6mWOUghHkvgB2PmJdyGoblMdlGD+VBqbxiIea51ExDDe7GrZ82/wBy3KI0d5Wrrkc1Hkd1/lWMcbWUfuA==")
  expect(bin).toBeTruthy()
})

test("download binary from Mirror with custom dir", async ({ expect }) => {
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR = "https://github.com/electron-userland/electron-builder-binaries/releases/download/"
  process.env.ELECTRON_BUILDER_BINARIES_CUSTOM_DIR = "linux-tools-mac-10.12.3"
  const bin = await getBinFromUrl("linux-tools", "mac-10.12.4", "CMiM/6mWOUghHkvgB2PmJdyGoblMdlGD+VBqbxiIea51ExDDe7GrZ82/wBy3KI0d5Wrrkc1Hkd1/lWMcbWUfuA==")
  delete process.env.ELECTRON_BUILDER_BINARIES_MIRROR
  delete process.env.ELECTRON_BUILDER_BINARIES_CUSTOM_DIR
  expect(bin).toBeTruthy()
})

test("download binary from Mirror", async ({ expect }) => {
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR = "https://github.com/electron-userland/electron-builder-binaries/releases/download/"
  const bin = await getBinFromUrl("linux-tools", "mac-10.12.4", "CMiM/6mWOUghHkvgB2PmJdyGoblMdlGD+VBqbxiIea51ExDDe7GrZ82/wBy3KI0d5Wrrkc1Hkd1/lWMcbWUfuA==")
  delete process.env.ELECTRON_BUILDER_BINARIES_MIRROR
  expect(bin).toBeTruthy()
})

test("download binary from Mirror with Url override", async ({ expect }) => {
  process.env.ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL = "https://github.com/electron-userland/electron-builder-binaries/releases/download/linux-tools-mac-10.12.3"
  const bin = await getBinFromUrl("linux-tools", "mac-10.12.4", "CMiM/6mWOUghHkvgB2PmJdyGoblMdlGD+VBqbxiIea51ExDDe7GrZ82/wBy3KI0d5Wrrkc1Hkd1/lWMcbWUfuA==")
  delete process.env.ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL
  expect(bin).toBeTruthy()
})
