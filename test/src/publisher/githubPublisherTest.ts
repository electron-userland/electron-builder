import { getUploadUrl } from "electron-publish/src/gitHubPublisher"

test("encodes artifact names in GitHub upload URLs", ({ expect }) => {
  const upload = getUploadUrl("https://uploads.github.com/repos/acme/app/releases/1/assets{?name,label}", "app #1 & stable.zip")

  expect(upload.pathname).toBe("/repos/acme/app/releases/1/assets")
  expect(upload.query).toBe("name=app+%231+%26+stable.zip")
})
