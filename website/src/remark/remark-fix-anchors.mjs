import { visit } from "unist-util-visit"

/**
 * Remark plugin that fixes broken anchor links from TypeDoc-generated content:
 * 1. Strips TypeDoc cross-file symbol links (e.g. app-builder-lib.Interface.Foo.md#bar):
 *    - If the link has an anchor, converts to #anchor then applies rule 2
 *    - If no anchor, strips the link to plain text
 * 2. Lowercases all self-referential anchor links (#CamelCase -> #camelcase)
 * 3. Strips links whose target anchor doesn't exist as a heading in the document
 *
 * Must run AFTER remark-include so TypeDoc content is already inlined.
 */
export default function remarkFixAnchors() {
  return function (tree) {
    // First pass: collect all heading slugs in the document
    const headingSlugs = new Set()
    visit(tree, "heading", (node) => {
      const text = extractText(node)
      const slug = slugify(text)
      if (slug) headingSlugs.add(slug)
    })

    // Second pass: fix anchor links
    visit(tree, "link", (node, index, parent) => {
      let url = node.url

      // Strip TypeDoc cross-file symbol links (package.Kind.Symbol.md[#anchor])
      if (isTypedocSymbolLink(url)) {
        const hashIdx = url.indexOf("#")
        if (hashIdx !== -1) {
          // Has anchor — convert to anchor-only link and fall through
          url = url.slice(hashIdx)
          node.url = url
        } else {
          // No anchor — strip link entirely
          if (parent && index != null) {
            parent.children.splice(index, 1, ...node.children)
            return index
          }
          return
        }
      }

      // Strip .md extension from relative doc links so they work regardless of
      // which page they're included into (remark-include bypasses the Docusaurus
      // link resolver, so relative .md hrefs resolve as URL paths, not doc routes)
      if (!url.startsWith("http") && !url.startsWith("#") && /\.mdx?($|#)/.test(url)) {
        node.url = url.replace(/\.mdx?($|#)/, (_, rest) => (rest === "" ? "" : rest))
        url = node.url
      }

      if (!url.startsWith("#")) return

      const anchor = url.slice(1)
      const slug = slugify(anchor)

      if (headingSlugs.has(slug)) {
        // Anchor exists — ensure lowercase slug
        node.url = "#" + slug
      } else {
        // Anchor doesn't exist in this document — replace link with its text children
        if (parent && index != null) {
          parent.children.splice(index, 1, ...node.children)
          return index // re-visit from same position
        }
      }
    })
  }
}

// TypeDoc symbol files have the form: package.Kind.Symbol.md (3+ dot-segments before .md)
// e.g. app-builder-lib.Interface.Configuration.md — but NOT app-builder-lib.md or packages.md
function isTypedocSymbolLink(url) {
  const filename = url.split("/").pop()?.split("#")[0] ?? ""
  const base = filename.replace(/\.mdx?$/, "")
  return base.split(".").length >= 3
}

function extractText(node) {
  let text = ""
  visit(node, "text", (n) => {
    text += n.value
  })
  visit(node, "inlineCode", (n) => {
    text += n.value
  })
  return text
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}
