import { URL } from "url"
import { newUrlFromBase, blockmapFiles } from "electron-updater/out/util"

test("newUrlFromBase", () => {
  const fileUrl = new URL("https://AWS_S3_HOST/bucket-yashraj/electron%20Setup%2011.0.3.exe")
  const newBlockMapUrl = newUrlFromBase(`${fileUrl.pathname}.blockmap`, fileUrl)
  expect(newBlockMapUrl.href).toBe("https://aws_s3_host/bucket-yashraj/electron%20Setup%2011.0.3.exe.blockmap")
})

test("add no cache", () => {
  const baseUrl = new URL("https://gitlab.com/artifacts/master/raw/dist?job=build_electron_win")
  const newBlockMapUrl = newUrlFromBase("latest.yml", baseUrl, true)
  expect(newBlockMapUrl.href).toBe("https://gitlab.com/artifacts/master/raw/latest.yml?job=build_electron_win")
})

test("create blockmap urls", () => {
  const oldVersion = "1.1.9-2+ed8ccd"
  const newVersion = "1.1.9-3+be4a1f"
  const baseUrlString = `https://gitlab.com/artifacts/master/raw/electron%20Setup%20${newVersion}.exe`
  const baseUrl = new URL(baseUrlString)

  const blockMapUrls = blockmapFiles(baseUrl, oldVersion, newVersion)

  expect(blockMapUrls[0].href).toBe("https://gitlab.com/artifacts/master/raw/electron%20Setup%201.1.9-2+ed8ccd.exe.blockmap")
  expect(blockMapUrls[1].href).toBe("https://gitlab.com/artifacts/master/raw/electron%20Setup%201.1.9-3+be4a1f.exe.blockmap")
})
