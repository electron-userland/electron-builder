import type { ReactNode } from "react"
import clsx from "clsx"
import Link from "@docusaurus/Link"
import { useLocation } from "@docusaurus/router"
import useIsBrowser from "@docusaurus/useIsBrowser"
import Heading from "@theme/Heading"
import Layout from "@theme/Layout"
import { BUMPS, compare, type Bump, type Change, type ChangelogData, type Entry } from "@site/src/changelog/model"
import styles from "./styles.module.css"

// The /changelog route of website/scripts/docusaurus-plugin-changelog.ts: every release, or with ?from=&to= the
// changes between two of them grouped by bump.

const TITLES: Record<Bump, string> = { major: "Major changes", minor: "Minor changes", patch: "Patch changes" }

// The static HTML is rendered without a query string: read it only after hydration, so that the first render in the
// browser matches the server's (the list of releases) and the comparison replaces it afterwards
function useRange(): { from?: string; to?: string } {
  const isBrowser = useIsBrowser()
  const location = useLocation()
  const query = new URLSearchParams(isBrowser ? location.search : "")
  return { from: query.get("from") ?? undefined, to: query.get("to") ?? undefined }
}

function EntryItem({ repo, entry, packages, labels }: { repo: string; entry: Entry; packages: string[]; labels?: ReactNode }): ReactNode {
  const { updated } = entry
  return (
    <li className={styles.entry}>
      <span dangerouslySetInnerHTML={{ __html: entry.summary }} />
      <div className={styles.meta} data-pagefind-ignore="">
        {labels}
        {packages.map(pkg => (
          <code key={pkg}>{pkg}</code>
        ))}
        {entry.pr !== undefined && <Link href={`${repo}/pull/${entry.pr}`}>#{entry.pr}</Link>}
        <Link href={`${repo}/commit/${entry.commit}`}>
          <code>{entry.commit.slice(0, 7)}</code>
        </Link>
        {updated !== undefined && (
          <span>
            updated
            {updated.pr !== undefined && (
              <>
                {" in "}
                <Link href={`${repo}/pull/${updated.pr}`}>#{updated.pr}</Link>
              </>
            )}
            {updated.commit !== undefined && (
              <>
                {" in "}
                <Link href={`${repo}/commit/${updated.commit}`}>
                  <code>{updated.commit}</code>
                </Link>
              </>
            )}
          </span>
        )}
      </div>
      {entry.body !== undefined && (
        <details className={styles.details} data-pagefind-ignore="">
          <summary>Details</summary>
          <div className="markdown" dangerouslySetInnerHTML={{ __html: entry.body }} />
        </details>
      )}
    </li>
  )
}

function Releases({ changelog }: { changelog: ChangelogData }): ReactNode {
  return changelog.releases.map(release => (
    <section key={release.id} className={styles.release}>
      <Heading as="h2" id={release.pkg === "electron-builder" ? `v${release.version}` : release.id}>
        {release.id} <small className={styles.date}>{release.date}</small>
      </Heading>
      {release.from !== undefined && (
        <div className={styles.meta} data-pagefind-ignore="">
          <Link href={`${changelog.repo}/compare/${release.from}...${release.tag}`}>Compare on GitHub</Link>
        </div>
      )}
      {release.sections.map(section => (
        <div key={section.pkg}>
          <h3>
            {section.pkg} {section.version}
          </h3>
          {section.dependencies !== undefined && (
            <p>
              Updated dependencies:{" "}
              {section.dependencies.map((dependency, i) => (
                <span key={dependency}>
                  {i > 0 && ", "}
                  <code>{dependency}</code>
                </span>
              ))}
            </p>
          )}
          {BUMPS.map(bump => {
            const entries = section.entries.filter(entry => entry.bump === bump)
            return entries.length === 0 ? null : (
              <div key={bump}>
                <h4>{TITLES[bump]}</h4>
                <ul className={styles.entries}>
                  {entries.map(entry => (
                    <EntryItem key={entry.key} repo={changelog.repo} entry={entry} packages={entry.packages} />
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      ))}
    </section>
  ))
}

function ChangeLabels({ change }: { change: Change }): ReactNode {
  return (
    <>
      {change.updated && <span className={clsx(styles.pill, styles.updated)}>Updated</span>}
      {change.sections.map(section => (
        <span key={section.pkg} className={styles.label}>
          {section.pkg} {section.version}
        </span>
      ))}
      {change.introducedIn !== change.release && <span>first in {change.introducedIn.id}</span>}
    </>
  )
}

function Comparison({ changelog, changes }: { changelog: ChangelogData; changes: Record<Bump, Change[]> }): ReactNode {
  return BUMPS.map(bump =>
    changes[bump].length === 0 ? null : (
      <section key={bump} className={clsx(styles.bucket, styles[bump])}>
        <Heading as="h2" id={bump}>
          {TITLES[bump]} <span className={styles.pill}>{changes[bump].length}</span>
        </Heading>
        <ul className={styles.entries}>
          {changes[bump].map(change => (
            <EntryItem key={change.entry.key} repo={changelog.repo} entry={change.entry} packages={change.packages} labels={<ChangeLabels change={change} />} />
          ))}
        </ul>
      </section>
    )
  )
}

export default function Changelog({ changelog }: { changelog: ChangelogData }): ReactNode {
  const { from, to } = useRange()
  const builder = changelog.releases.filter(release => release.pkg === "electron-builder")
  // a base can only be compared from
  const tags = new Map<string, string>([...builder.map(release => [release.id, release.tag!] as const), ...changelog.bases.map(base => [base.version, base.tag] as const)])
  const isRelease = (version?: string) => builder.some(release => release.id === version)
  const fromVersion = from !== undefined && tags.has(from) ? from : undefined
  const toVersion = isRelease(to) ? to : undefined
  const comparing = fromVersion !== undefined && toVersion !== undefined
  const changes = comparing && fromVersion !== toVersion ? compare(changelog, fromVersion, toVersion) : undefined
  const total = changes === undefined ? 0 : BUMPS.reduce((count, bump) => count + changes[bump].length, 0)
  const updated = changes === undefined ? 0 : BUMPS.reduce((count, bump) => count + changes[bump].filter(change => change.updated).length, 0)

  let summary: ReactNode = null
  if (comparing && changes === undefined) {
    summary = "Choose two different versions."
  } else if (comparing && total === 0) {
    summary = `${toVersion} has no changes that ${fromVersion} doesn't already include.`
  } else if (changes !== undefined) {
    summary = (
      <>
        {total} {total === 1 ? "change" : "changes"} from {fromVersion} to {toVersion}:{" "}
        {BUMPS.map((bump, i) => (
          <span key={bump}>
            {i > 0 && " · "}
            {changes[bump].length === 0 ? (
              `0 ${bump}`
            ) : (
              <a href={`#${bump}`} className={clsx(styles.pill, styles[bump])}>
                {changes[bump].length} {bump}
              </a>
            )}
          </span>
        ))}
        {updated > 0 && ` (${updated} updated)`} · <Link href={`${changelog.repo}/compare/${tags.get(fromVersion!)}...${tags.get(toVersion!)}`}>Compare on GitHub</Link>
      </>
    )
  }

  return (
    <Layout title="Changelog" description="The releases of electron-builder and electron-updater, and the changes between two versions grouped by major, minor and patch changes.">
      <main className="container margin-vert--lg">
        <Heading as="h1">Changelog</Heading>
        <p>
          The releases of electron-builder and electron-updater since {builder[builder.length - 1].version}. Older releases are in{" "}
          <Link href={`${changelog.repo}/blob/master/CHANGELOG.md`}>CHANGELOG.md on GitHub</Link>.
        </p>
        <p className={styles.summary} aria-live="polite" aria-atomic="true">
          {summary}
        </p>
        {changes !== undefined ? <Comparison changelog={changelog} changes={changes} /> : !comparing && <Releases changelog={changelog} />}
      </main>
    </Layout>
  )
}
