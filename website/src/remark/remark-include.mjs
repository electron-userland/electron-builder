import fs from "node:fs"
import path from "node:path"
import { fromMarkdown } from "mdast-util-from-markdown"
import { visit } from "unist-util-visit"

const INCLUDE_RE = /^\{!\s*(.+?)\s*!\}$/

function stripFrontmatter(content) {
  if (!content.startsWith("---")) return content
  const end = content.indexOf("\n---", 3)
  if (end === -1) return content
  return content.slice(end + 4).trimStart()
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

/** Extract plain text from a heading node. */
function headingText(node) {
  let text = ""
  visit(node, "text", (n) => { text += n.value })
  visit(node, "inlineCode", (n) => { text += n.value })
  return text
}

/**
 * Stamp `data.hProperties.id` on every heading node so that the remark→rehype
 * bridge writes a proper HTML id attribute — even though Docusaurus's own
 * heading-id plugin ran before us and won't see our dynamically inserted nodes.
 */
function stampHeadingIds(nodes) {
  const seen = new Map()
  visit({ type: "root", children: nodes }, "heading", (node) => {
    const text = headingText(node)
    // Honor any explicit {#id} already in the heading text
    const explicit = text.match(/\{#([^}]+)\}\s*$/)
    let id
    if (explicit) {
      id = explicit[1]
    } else {
      const base = slugify(text)
      const count = seen.get(base) ?? 0
      id = count === 0 ? base : `${base}-${count}`
      seen.set(base, count + 1)
    }
    if (!id) return
    node.data = node.data ?? {}
    node.data.hProperties = node.data.hProperties ?? {}
    node.data.hProperties.id = id
  })
}

/** Remark plugin that resolves {! ./path.md !} file includes inline.
 *
 * When a file is not found at the literal path (relative to the including
 * file), it falls back to looking in the `api/` sibling directory — which
 * is where docusaurus-plugin-typedoc places flat TypeDoc output files.
 */
export default function remarkInclude({ docsDir } = {}) {
  return function (tree, file) {
    const fileDir = path.dirname(file.path)
    const replacements = []

    visit(tree, "paragraph", (node, index, parent) => {
      if (!parent || index == null) return
      if (node.children.length !== 1) return
      const child = node.children[0]
      if (child.type !== "text") return

      const text = child.value.trim()
      const match = text.match(INCLUDE_RE)
      if (!match) return

      const includePath = match[1].trim()
      let absPath = path.resolve(fileDir, includePath)

      if (!fs.existsSync(absPath) && docsDir) {
        absPath = path.resolve(docsDir, "api", path.basename(includePath))
      }

      if (!fs.existsSync(absPath)) {
        console.warn(`[remark-include] Not found: ${includePath} (from ${file.path})`)
        return
      }

      const raw = fs.readFileSync(absPath, "utf-8")
      const content = stripFrontmatter(raw)
      const parsed = fromMarkdown(content)

      stampHeadingIds(parsed.children)
      replacements.push({ parent, index, nodes: parsed.children })
    })

    // Apply in reverse index order so earlier splices don't shift later indices
    replacements.sort((a, b) => {
      if (a.parent === b.parent) return b.index - a.index
      return 0
    })
    for (const { parent, index, nodes } of replacements) {
      parent.children.splice(index, 1, ...nodes)
    }
  }
}
