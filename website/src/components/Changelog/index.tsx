import type { ReactNode } from "react"
import clsx from "clsx"
import Link from "@docusaurus/Link"
import { useHistory, useLocation } from "@docusaurus/router"
import useIsBrowser from "@docusaurus/useIsBrowser"
import Heading from "@theme/Heading"
import Layout from "@theme/Layout"
import { BUMPS, compare, type Bump, type Change, type ChangelogData, type Entry } from "@site/src/changelog/model"
import styles from "./styles.module.css"

// The /changelog route of website/scripts/docusaurus-plugin-changelog.ts: every release, or with ?from=&to= the
// changes between two of them grouped by bump.

const TITLES: Record<Bump, string> = { major: "Major changes", minor: "Minor changes", patch: "Patch changes" }

type Range = { from?: string; to?: string; setRange: (from?: string, to?: string) => void }

// The static HTML is rendered without a query string: read it only after hydration, so that the first render in the
// browser matches the server's (the list of releases) and the comparison replaces it afterwards
function useRange(): Range {
  const isBrowser = useIsBrowser()
  const location = useLocation()
  const history = useHistory()
  const query = new URLSearchParams(isBrowser ? location.search : "")
  const setRange = (from?: string, to?: string) => {
    const next = new URLSearchParams()
    if (from) {
      next.set("from", from)
    }
    if (to) {
      next.set("to", to)
    }
    const search = next.toString()
    // replace, not push: after a push Docusaurus moves the focus to the top of the page, away from the control just used
    history.replace({ pathname: location.pathname, search: search && `?${search}` })
  }
  return { from: query.get("from") ?? undefined, to: query.get("to") ?? undefined, setRange }
}

function EntryItem({ repo, entry, labels }: { repo: string; entry: Entry; labels?: ReactNode }): ReactNode {
  const { updated } = entry
  return (
    <li className={styles.entry}>
      <span dangerouslySetInnerHTML={{ __html: entry.summary }} />
      <div className={styles.meta} data-pagefind-ignore="">
        {labels}
        {entry.pr !== undefined && <Link href={`${repo}/pull/${entry.pr}`}>#{entry.pr}</Link>}
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
        {release.id}
      </Heading>
      <div className={styles.meta} data-pagefind-ignore="">
        {release.date}
        {release.from !== undefined && <Link href={`${changelog.repo}/compare/${release.from}...${release.tag}`}>Compare on GitHub</Link>}
      </div>
      {release.sections.map(section => (
        <div key={section.pkg}>
          <h3 className={styles.section}>
            {section.pkg} {section.version}
          </h3>
          {section.dependencies !== undefined && (
            <p data-pagefind-ignore="">
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
                <h4 className={styles.group}>{TITLES[bump]}</h4>
                <ul className={styles.entries}>
                  {entries.map(entry => (
                    <EntryItem key={entry.key} repo={changelog.repo} entry={entry} />
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
            <EntryItem key={change.entry.key} repo={changelog.repo} entry={change.entry} labels={<ChangeLabels change={change} />} />
          ))}
        </ul>
      </section>
    )
  )
}

export default function Changelog({ changelog }: { changelog: ChangelogData }): ReactNode {
  const { from, to, setRange } = useRange()
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

  const versionOptions = builder.map(release => (
    <option key={release.id} value={release.id}>
      {release.version} ({release.date})
    </option>
  ))
  return (
    <Layout title="Changelog" description="The releases of electron-builder and electron-updater, and the changes between two versions grouped by major, minor and patch changes.">
      <main className="container margin-vert--lg">
        <Heading as="h1">Changelog</Heading>
        <p>
          The releases of electron-builder and electron-updater since {builder[builder.length - 1].version}. Pick two versions to list only the changes between them, grouped by
          major, minor and patch changes. Older releases are in <Link href={`${changelog.repo}/blob/master/CHANGELOG.md`}>CHANGELOG.md on GitHub</Link>.
        </p>
        <div className={styles.picker} data-pagefind-ignore="">
          <label>
            From{" "}
            <select className={styles.select} value={fromVersion ?? ""} onChange={event => setRange(event.target.value || undefined, toVersion ?? builder[0].id)}>
              <option value="">Select a version</option>
              {versionOptions}
              {changelog.bases.map(base => (
                <option key={base.version} value={base.version}>
                  {base.version}
                </option>
              ))}
            </select>
          </label>
          <label>
            To{" "}
            <select className={styles.select} value={toVersion ?? ""} onChange={event => setRange(fromVersion, event.target.value || undefined)}>
              <option value="">Select a version</option>
              {versionOptions}
            </select>
          </label>
          {comparing && (
            <>
              <button type="button" className={styles.action} disabled={!isRelease(fromVersion)} onClick={() => setRange(toVersion, fromVersion)}>
                Swap
              </button>
              <Link to="/changelog">All releases</Link>
            </>
          )}
        </div>
        <p className={styles.summary} aria-live="polite" aria-atomic="true">
          {summary}
        </p>
        {changes !== undefined ? <Comparison changelog={changelog} changes={changes} /> : !comparing && <Releases changelog={changelog} />}
      </main>
    </Layout>
  )
}
