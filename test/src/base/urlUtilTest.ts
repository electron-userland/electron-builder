import { URL } from "url"
import { newUrlFromBase } from "electron-updater"

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