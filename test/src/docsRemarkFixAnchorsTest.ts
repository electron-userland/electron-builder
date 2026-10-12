import remarkFixAnchors from "../../website/src/remark/remark-fix-anchors.mjs"

const text = (value: string) => ({ type: "text", value })
const code = (value: string) => ({ type: "inlineCode", value })
const heading = (...children: any[]) => ({ type: "heading", depth: 2, children })

/** Runs the plugin over `headings` followed by one paragraph holding a link to `url`; returns what that link became. */
function linkAfterTransform(headings: any[], url: string): any {
  const paragraph = { type: "paragraph", children: [{ type: "link", url, children: [text("label")] }] }
  remarkFixAnchors()({ type: "root", children: [...headings, paragraph] })
  return paragraph.children[0]
}

describe("docs remark-fix-anchors", () => {
  test("keeps a same-page link to an explicit heading id", ({ expect }) => {
    // the id cannot be derived from the heading text, and the marker is not the only child
    const headings = [heading(code("snap"), text(" → "), code("snapcraft"), text(" {#snap-snapcraft}"))]
    expect(linkAfterTransform(headings, "#snap-snapcraft")).toMatchObject({ type: "link", url: "#snap-snapcraft" })
  })

  test("leaves an explicit heading id verbatim instead of re-slugging it", ({ expect }) => {
    const headings = [heading(code("extraFiles"), text(" / "), code("extraResources"), text(" destinations {#extrafiles--extraresources}"))]
    expect(linkAfterTransform(headings, "#extrafiles--extraresources")).toMatchObject({ type: "link", url: "#extrafiles--extraresources" })
  })

  test("strips a link to the text slug of a heading that has an explicit id", ({ expect }) => {
    // Docusaurus renders only the explicit id, so the slug of the text is not an anchor on the page
    expect(linkAfterTransform([heading(text("Removed exports {#gone}"))], "#removed-exports")).toEqual(text("label"))
  })

  test("keeps a link to a heading that mixes inline code and text", ({ expect }) => {
    // the slug follows document order: "linux.syncDesktopName (always synced)"
    const headings = [heading(code("linux.syncDesktopName"), text(" (always synced)"))]
    expect(linkAfterTransform(headings, "#linuxsyncdesktopname-always-synced")).toMatchObject({ type: "link", url: "#linuxsyncdesktopname-always-synced" })
  })

  test("lowercases a link to a heading slug", ({ expect }) => {
    expect(linkAfterTransform([heading(text("Native ESM output"))], "#Native-ESM-output")).toMatchObject({ type: "link", url: "#native-esm-output" })
  })

  test("strips a link whose anchor is not a heading", ({ expect }) => {
    expect(linkAfterTransform([heading(text("Native ESM output"))], "#missing")).toEqual(text("label"))
  })
})
