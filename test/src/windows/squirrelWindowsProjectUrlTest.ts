import { addProjectUrl } from "electron-builder-squirrel-windows"

test("escapes the project URL inserted into the nuspec template", ({ expect }) => {
  const template = "<metadata><copyright><%- copyright %></copyright></metadata>"

  expect(addProjectUrl(template, "https://example.com/app?channel=stable&source=<build>")).toContain(
    "<projectUrl>https://example.com/app?channel=stable&amp;source=&lt;build&gt;</projectUrl>"
  )
})
