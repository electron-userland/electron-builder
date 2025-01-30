import { getBinFromUrl } from "app-builder-lib/out/binDownload"

test("download binary from Github", async () => {
  const bin = await getBinFromUrl("linux-tools", "mac-10.12.3", "SQ8fqIRVXuQVWnVgaMTDWyf2TLAJjJYw3tRSqQJECmgF6qdM7Kogfa6KD49RbGzzMYIFca9Uw3MdsxzOPRWcYw==")
  expect(bin).toBeTruthy()
})

test("download binary from Mirror with custom dir", async () => {
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR = "https://github.com/electron-userland/electron-builder-binaries/releases/download/"
  process.env.ELECTRON_BUILDER_BINARIES_CUSTOM_DIR = "linux-tools-mac-10.12.3"
  const bin = await getBinFromUrl("linux-tools", "mac-10.12.3", "SQ8fqIRVXuQVWnVgaMTDWyf2TLAJjJYw3tRSqQJECmgF6qdM7Kogfa6KD49RbGzzMYIFca9Uw3MdsxzOPRWcYw==")
  delete process.env.ELECTRON_BUILDER_BINARIES_MIRROR
  delete process.env.ELECTRON_BUILDER_BINARIES_CUSTOM_DIR
  expect(bin).toBeTruthy()
})

test("download binary from Mirror", async () => {
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR = "https://github.com/electron-userland/electron-builder-binaries/releases/download/"
  const bin = await getBinFromUrl("linux-tools", "mac-10.12.3", "SQ8fqIRVXuQVWnVgaMTDWyf2TLAJjJYw3tRSqQJECmgF6qdM7Kogfa6KD49RbGzzMYIFca9Uw3MdsxzOPRWcYw==")
  delete process.env.ELECTRON_BUILDER_BINARIES_MIRROR
  expect(bin).toBeTruthy()
})

test("download binary from Mirror with Url override", async () => {
  process.env.ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL = "https://github.com/electron-userland/electron-builder-binaries/releases/download/linux-tools-mac-10.12.3"
  const bin = await getBinFromUrl("linux-tools", "mac-10.12.3", "SQ8fqIRVXuQVWnVgaMTDWyf2TLAJjJYw3tRSqQJECmgF6qdM7Kogfa6KD49RbGzzMYIFca9Uw3MdsxzOPRWcYw==")
  delete process.env.ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL
  expect(bin).toBeTruthy()
})
