// The releases that website/scripts/docusaurus-plugin-changelog.ts reads from the root CHANGELOG.md for the /changelog
// page (src/components/Changelog).

export type Bump = "major" | "minor" | "patch"

export const BUMPS: Bump[] = ["major", "minor", "patch"]

export type Entry = {
  // the changeset: its listings in several releases and package sections share the key
  key: number
  bump: Bump
  // markdown when parsed, HTML once the plugin renders it: the first line inline, the rest as blocks
  summary: string
  body?: string
  pr?: number
  // the commit that added the changeset file
  commit: string
  packages: string[]
  // the changeset was edited after an earlier release listed it ("updated in #N")
  updated?: { pr?: number; commit?: string }
}

export type Section = { pkg: string; version: string; dependencies?: string[]; entries: Entry[] }

export type Release = {
  // the version for electron-builder, "<pkg>@<version>" for a package released alone (electron-updater)
  id: string
  pkg: string
  version: string
  date: string
  // the refs of the heading's compare link: the tag of the previous release and this release's own
  from?: string
  tag?: string
  // the id of the release this one follows, or the version of a base
  parent?: string
  sections: Section[]
}

// a version that the oldest releases follow but that has no section (the history before it is not read)
export type Base = { version: string; tag: string }

export type ChangelogData = {
  repo: string
  // in file order, newest first
  releases: Release[]
  bases: Base[]
}
