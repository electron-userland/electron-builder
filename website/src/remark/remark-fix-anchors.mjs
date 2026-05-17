import { visit } from "unist-util-visit"

/**
 * Remark plugin that fixes broken anchor links from TypeDoc-generated content:
 * 1. Lowercases all self-referential anchor links (#CamelCase -> #camelcase)
 * 2. Strips links whose target anchor doesn't exist as a heading in the document
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
      const url = node.url
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
