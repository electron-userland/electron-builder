export type Forge = "github" | "gitlab" | "gitea" | "bitbucket" | "sourcehut"

export interface GitRemote {
  readonly host: string
  /** Everything between the host and the project, kept verbatim: GitLab subgroups, sourcehut's `~user`. */
  readonly user: string
  readonly project: string
}

export interface DetectedForge {
  readonly forge: Forge
  readonly remote: GitRemote
  /** How the forge was determined, for the build log. */
  readonly via: "hint" | "host" | "probe"
}

/** The subset of fetch this module needs, so probing can be exercised without a network. */
export type Fetcher = (url: string, init: { signal: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>

const SCP_REMOTE = /^[\w.-]+@([\w.-]+):\/?(.+?)\/([^/]+?)(?:\.git)?\/?$/
const SHORTHAND_REMOTE = /^(?:(github|gitlab|bitbucket):)?([\w.-]+)\/([\w.-]+)$/

/**
 * Accepts https://, git+https://, ssh://, scp-style `git@host:user/project.git`, and the npm
 * shorthands `user/project` (GitHub) and `gitlab:user/project`.
 */
export function parseGitRemote(url: string): GitRemote | null {
  const scp = SCP_REMOTE.exec(url)
  if (scp != null) {
    return { host: scp[1], user: scp[2], project: scp[3] }
  }

  const shorthand = SHORTHAND_REMOTE.exec(url)
  if (shorthand != null) {
    const hosts: Record<string, string> = { github: "github.com", gitlab: "gitlab.com", bitbucket: "bitbucket.org" }
    return { host: hosts[shorthand[1] ?? "github"], user: shorthand[2], project: shorthand[3] }
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const segments = parsed.pathname.split("/").filter(it => it.length > 0)
  if (segments.length < 2) {
    return null
  }
  return {
    host: parsed.hostname,
    user: segments.slice(0, -1).join("/"),
    project: segments[segments.length - 1].replace(/\.git$/, ""),
  }
}

export function classifyByHost(host: string): Forge | null {
  switch (host.toLowerCase()) {
    case "github.com":
      return "github"
    case "gitlab.com":
      return "gitlab"
    case "codeberg.org":
      return "gitea"
    case "bitbucket.org":
      return "bitbucket"
    case "git.sr.ht":
      return "sourcehut"
    default:
      return null
  }
}

/**
 * Gitea and Forgejo answer `/api/v1/version` to anyone. GitLab demands authentication on
 * `/api/v4/version`, and that 401 is the signature
 */
export async function probeForge(host: string, fetcher: Fetcher = fetch, timeoutMs = 5000): Promise<Forge | null> {
  const get = async (apiPath: string) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetcher(`https://${host}${apiPath}`, { signal: controller.signal })
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  const gitea = await get("/api/v1/version")
  if (gitea?.status === 200) {
    try {
      if (typeof JSON.parse(await gitea.text()).version === "string") {
        return "gitea"
      }
    } catch {
      // answered 200 with something that is not Gitea's version document
    }
  }

  const gitlab = await get("/api/v4/version")
  if (gitlab != null && (gitlab.status === 200 || gitlab.status === 401)) {
    return "gitlab"
  }
  return null
}

/** Where a forge serves the assets attached to a release. Verified against live Codeberg and GitLab responses. */
export function computeForgeReleaseBase(forge: Forge, remote: GitRemote, tag: string): string {
  const { host, user, project } = remote
  switch (forge) {
    case "github":
    case "gitea":
      return `https://${host}/${user}/${project}/releases/download/${tag}`
    case "gitlab":
      return `https://${host}/${user}/${project}/-/releases/${tag}/downloads`
    case "sourcehut":
      return `https://${host}/${user}/${project}/refs/download/${tag}`
    case "bitbucket":
      // Bitbucket downloads are not scoped to a tag, so the file name has to carry the version.
      return `https://${host}/${user}/${project}/downloads`
  }
}

/** Where a source provider exports/outputs a file from the tree at a given tag. Verified live on GitHub, Codeberg and GitLab. */
export function computeForgeRawFileUrl(forge: Forge, remote: GitRemote, tag: string, filePath: string): string {
  const { host, user, project } = remote
  switch (forge) {
    case "github":
      // github.com serves raw files from a dedicated host; GitHub Enterprise serves them under /raw/
      return host === "github.com" ? `https://raw.githubusercontent.com/${user}/${project}/${tag}/${filePath}` : `https://${host}/raw/${user}/${project}/${tag}/${filePath}`
    case "gitea":
      return `https://${host}/${user}/${project}/raw/tag/${tag}/${filePath}`
    case "gitlab":
      return `https://${host}/${user}/${project}/-/raw/${tag}/${filePath}`
    case "sourcehut":
      return `https://${host}/${user}/${project}/blob/${tag}/${filePath}`
    case "bitbucket":
      return `https://${host}/${user}/${project}/raw/${tag}/${filePath}`
  }
}

/**  well-known hosts, then (if allowed) asking the host itself. */
export async function detectForge(repositoryUrl: string, hint: Forge | null | undefined, probe: boolean, fetcher?: Fetcher): Promise<DetectedForge | null> {
  const remote = parseGitRemote(repositoryUrl)
  if (remote == null) {
    return null
  }
  if (hint != null) {
    return { forge: hint, remote, via: "hint" }
  }
  const byHost = classifyByHost(remote.host)
  if (byHost != null) {
    return { forge: byHost, remote, via: "host" }
  }
  if (probe) {
    const probed = await probeForge(remote.host, fetcher)
    if (probed != null) {
      return { forge: probed, remote, via: "probe" }
    }
  }
  return null
}
