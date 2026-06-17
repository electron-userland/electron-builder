---
"app-builder-lib": major
---

feat(toolsets): Adopt `"latest"` as the canonical "null"-state for every `ToolsetConfig` property, and make the toolset resolution logic resolve the unset state (`undefined` / `null` / `"latest"`) to the newest available bundle for each toolset.
