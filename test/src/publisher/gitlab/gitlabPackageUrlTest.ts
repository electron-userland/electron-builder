import { getGenericPackageUrl } from "electron-publish/src/gitlabPublisher"

test("encodes GitLab generic package path segments", ({ expect }) => {
  expect(getGenericPackageUrl("https://gitlab.com/api/v4", "team/app", "1.0.0+stable", "app #1 & stable.zip")).toBe(
    "https://gitlab.com/api/v4/projects/team%2Fapp/packages/generic/releases/1.0.0%2Bstable/app%20%231%20%26%20stable.zip"
  )
})
