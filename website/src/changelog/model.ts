// The releases that website/scripts/docusaurus-plugin-changelog.ts reads from the root CHANGELOG.md, and the changes
// between two of them, computed in the browser by the /changelog page (src/components/Changelog). Plain ES2020: the
// client bundle is not polyfilled.

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

export type Change = {
  entry: Entry
  // the package sections of the listing shown
  sections: Section[]
  // the release of the listing shown, and the release that listed the changeset first
  release: Release
  introducedIn: Release
  updated: boolean
}

// all package sections of one release that list a changeset
type Listing = { index: number; sections: Section[]; entries: Entry[] }

const RANK: Record<Bump, number> = { major: 0, minor: 1, patch: 2 }

const highest = (entries: Entry[]): Bump => entries.reduce<Bump>((bump, entry) => (RANK[entry.bump] < RANK[bump] ? entry.bump : bump), "patch")

const text = (listing: Listing) => `${listing.entries[0].summary}\n${listing.entries[0].body ?? ""}\n${highest(listing.entries)}`

// The releases (indexes into data.releases) that release <id> contains: itself, and every release before it on its
// release line, following the compare links. A package released alone (electron-updater) is inserted between the
// electron-builder releases in file order: it is contained when the release it follows is. A base contains nothing.
export function ancestors(data: ChangelogData, id: string): Set<number> {
  const index = new Map(data.releases.map((release, i) => [release.id, i]))
  const result = new Set<number>()
  const start = index.get(id)
  for (let i = start; i !== undefined && !result.has(i); i = index.get(data.releases[i].parent ?? "")) {
    result.add(i)
  }
  if (start !== undefined) {
    for (let i = data.releases.length - 1; i > start; i--) {
      const release = data.releases[i]
      if (release.pkg !== "electron-builder" && result.has(index.get(release.parent ?? "") ?? -1)) {
        result.add(i)
      }
    }
  }
  return result
}

// The changes in release <to> that release (or base) <from> doesn't have, like GitHub's compare of two tags: the
// changesets listed in a release <to> contains and in none that <from> contains, plus those <from> has that a newer
// release <to> contains lists again with an "updated" note or a different text or bump (a stable release lists the
// final text of its prereleases' changesets). Each change is the newest listing <to> contains, in the bucket of its
// highest bump over the package sections, newest first.
export function compare(data: ChangelogData, from: string, to: string): Record<Bump, Change[]> {
  const inFrom = ancestors(data, from)
  const inTo = ancestors(data, to)
  // the oldest listing of each changeset, the newest that each side contains, and the listings with an "updated" note
  const first = new Map<number, number>()
  const newestFrom = new Map<number, Listing>()
  const newestTo = new Map<number, Listing>()
  const notedAt = new Map<number, number[]>()
  data.releases.forEach((release, index) => {
    const listings = new Map<number, Listing>()
    for (const section of release.sections) {
      for (const entry of section.entries) {
        first.set(entry.key, index)
        let listing = listings.get(entry.key)
        if (listing === undefined) {
          listing = { index, sections: [], entries: [] }
          listings.set(entry.key, listing)
        }
        if (!listing.sections.includes(section)) {
          listing.sections.push(section)
        }
        listing.entries.push(entry)
        if (entry.updated !== undefined && inTo.has(index)) {
          notedAt.set(entry.key, [...(notedAt.get(entry.key) ?? []), index])
        }
      }
    }
    for (const [key, listing] of listings) {
      if (inFrom.has(index) && !newestFrom.has(key)) {
        newestFrom.set(key, listing)
      }
      if (inTo.has(index) && !newestTo.has(key)) {
        newestTo.set(key, listing)
      }
    }
  })

  const result: Record<Bump, Change[]> = { major: [], minor: [], patch: [] }
  for (const [key, shown] of newestTo) {
    const had = newestFrom.get(key)
    // only a listing newer than the one <from> has can update it (going back from a stable release to its own
    // prereleases shows nothing)
    const updated = had !== undefined && shown.index < had.index && ((notedAt.get(key) ?? []).some(i => i < had.index) || text(shown) !== text(had))
    if (had !== undefined && !updated) {
      continue
    }
    result[highest(shown.entries)].push({
      entry: shown.entries[0],
      sections: shown.sections,
      release: data.releases[shown.index],
      introducedIn: data.releases[first.get(key)!],
      updated,
    })
  }
  for (const bump of BUMPS) {
    result[bump].sort((a, b) => first.get(a.entry.key)! - first.get(b.entry.key)!)
  }
  return result
}
