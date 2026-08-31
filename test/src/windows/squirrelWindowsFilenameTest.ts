import { replaceExecutableExtension } from "electron-builder-squirrel-windows"

test("only replaces the terminal executable extension", ({ expect }) => {
  expect(replaceExecutableExtension("My.exe App Setup.EXE")).toBe("My.exe App Setup.msi")
})
