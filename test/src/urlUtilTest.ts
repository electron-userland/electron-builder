import { utils } from "electron-updater"
import { URL } from "url"

test("newUrlFromBase", ({ expect }) => {
  const fileUrl = new URL("https://AWS_S3_HOST/bucket-yashraj/electron%20Setup%2011.0.3.exe")
  const newBlockMapUrl = utils.newUrlFromBase(`${fileUrl.pathname}.blockmap`, fileUrl)
  expect(newBlockMapUrl.href).toBe("https://aws_s3_host/bucket-yashraj/electron%20Setup%2011.0.3.exe.blockmap")
})

test("add no cache", ({ expect }) => {
  const baseUrl = new URL("https://gitlab.com/artifacts/master/raw/dist?job=build_electron_win")
  const newBlockMapUrl = utils.newUrlFromBase("latest.yml", baseUrl, true)
  expect(newBlockMapUrl.href).toBe("https://gitlab.com/artifacts/master/raw/latest.yml?job=build_electron_win")
})
