---
"electron-builder": minor
---

feat(cli): add `migrate-schema` command for v26 → v27 config migration

New built-in CLI command that automatically rewrites your electron-builder configuration
for v27 breaking changes. Run it once before upgrading:

```bash
electron-builder migrate-schema
```

Use `--dry-run` (`-n`) to preview changes without writing, or `--config <path>` /
`--project-dir <dir>` to target a non-default file or directory.

---

### What it migrates automatically

| Config change | Before | After |
|---|---|---|
| `electronCompile` removed | `"electronCompile": true` | *(deleted)* |
| `framework` / `nodeVersion` / `launchUiVersion` removed | `"framework": "electron"` | *(deleted)* |
| `npmSkipBuildFromSource` removed | `"npmSkipBuildFromSource": true` | `"nativeModules": { "buildDependenciesFromSource": false }` |
| Native module options grouped | `"npmRebuild": true` | `"nativeModules": { "npmRebuild": true }` |
| `nativeRebuilder` renamed | `"nativeRebuilder": "parallel"` | `"nativeModules": { "rebuildMode": "parallel" }` |
| `appImage.systemIntegration` removed | `"appImage": { "systemIntegration": "ask" }` | *(deleted)* |
| Legacy asar keys | `"asar-unpack": "**/*.node"` | `"asarUnpack": ["**/*.node"]` |
| `GithubOptions.vPrefixedTagName` | `"vPrefixedTagName": false` | `"tagNamePrefix": ""` |
| `GitlabOptions.vPrefixedTagName` | `"vPrefixedTagName": true` | *(deleted)* |
| Azure extra sign keys | `"azureSignOptions": { "ExcludeCredentials": "X" }` | `"azureSignOptions": { "additionalMetadata": { "ExcludeCredentials": "X" } }` |

### What requires manual steps

- `snap` config restructuring to `snapcraft` with explicit `base` (too project-specific to automate safely)
- Programmatic configs (`.js`, `.ts`, `.cjs`, `.mjs`) — command prints required changes
- TOML configs — command is read-only for TOML

### Supported config formats

JSON, JSON5, YAML, TOML (read-only), `package.json` `build` key. Programmatic configs
are detected and print manual steps.

### Serialization notes

- JSON5 files are rewritten as standard JSON (comments stripped, warning printed).
- YAML comments are not preserved on round-trip.

### Changed Files

| File | Change |
|---|---|
| `packages/electron-builder/src/cli/migrate-schema.ts` | New — full migration implementation |
| `packages/electron-builder/src/cli/cli.ts` | Wire up `migrate-schema` subcommand |
| `test/src/migrateSchemaTest.ts` | New — unit tests for all transformations |
| `website/docs/migration/v26-to-v27.md` | Enhanced with auto-migrated column, new breaking-change sections, and "Additional notes" |

### Validations

- `pnpm compile` — passes (0 errors)
- `pnpm typecheck` — passes
- `pnpm typecheck:test` — passes
