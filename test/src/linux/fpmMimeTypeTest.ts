import { FileAssociation } from "app-builder-lib"
import { LinuxTargetHelper } from "app-builder-lib/src/targets/linux/LinuxTargetHelper"
import { TmpDir } from "builder-util"
import { readFile } from "fs/promises"
import * as path from "path"

// the shared-mime-info file that deb, rpm and pacman install to /usr/share/mime/packages. The packager is reduced to what it reads
async function mimeTypeFile(tmpDir: TmpDir, fileAssociations: Array<FileAssociation>, productName = "Test App"): Promise<string | null> {
  const dir = await tmpDir.getTempDir({ prefix: "fpm-mime" })
  const packager = {
    appInfo: { productName },
    fileAssociations,
    getTempFile: (suffix: string) => Promise.resolve(path.join(dir, `mime${suffix}`)),
  }
  const file = await new LinuxTargetHelper(packager as any).mimeTypeFiles
  return file == null ? null : readFile(file, "utf8")
}

test("the values of file associations are XML-escaped", async ({ expect, tmpDir }) => {
  const xml = await mimeTypeFile(
    tmpDir,
    [
      { ext: ["foo", "foo2"], mimeType: 'application/x-foo"/><evil a="&', description: 'Foo <b>files</b> & "more"' },
      { ext: "bar", name: "Bar" },
      { ext: "baz", mimeType: "application/x-baz" },
    ],
    "Test & <App>"
  )
  expect(xml).toBe(
    [
      '<?xml version="1.0"?>',
      '<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">',
      '<mime-type type="application/x-foo&quot;/&gt;&lt;evil a=&quot;&amp;">',
      "  <comment>Foo &lt;b&gt;files&lt;/b&gt; &amp; &quot;more&quot;</comment>",
      '  <glob pattern="*.foo"/>',
      '  <glob pattern="*.foo2"/>',
      '  <generic-icon name="x-office-document"/>',
      "</mime-type>",
      '<mime-type type="application/x-baz">',
      "  <comment>Test &amp; &lt;App&gt; document</comment>",
      '  <glob pattern="*.baz"/>',
      '  <generic-icon name="x-office-document"/>',
      "</mime-type>",
      "</mime-info>",
    ].join("\n")
  )
})

test("an extension with characters outside A-Za-z0-9_- gets no glob", async ({ expect, tmpDir }) => {
  const xml = await mimeTypeFile(tmpDir, [{ ext: ["ok", 'x"/><glob pattern="*'], mimeType: "application/x-foo" }])
  expect(xml).toContain('  <glob pattern="*.ok"/>\n  <generic-icon')
  expect(xml?.match(/<glob /g)).toHaveLength(1)
})

test("no MIME type file is written without a custom MIME type", async ({ expect, tmpDir }) => {
  expect(await mimeTypeFile(tmpDir, [{ ext: "bar", name: "Bar" }])).toBeNull()
})
