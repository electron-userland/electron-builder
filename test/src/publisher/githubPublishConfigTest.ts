import { parseGithubRepoShorthand } from "app-builder-lib/src/publish/PublishManager"

test("parses owner and repository from GitHub repo shorthand", ({ expect }) => {
  expect(parseGithubRepoShorthand("electron-userland/electron-builder")).toEqual({
    owner: "electron-userland",
    repo: "electron-builder",
  })
})

test("ignores repository names without an owner", ({ expect }) => {
  expect(parseGithubRepoShorthand("electron-builder")).toBeNull()
})
