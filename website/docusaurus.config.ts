import type * as Preset from "@docusaurus/preset-classic"
import type { Config } from "@docusaurus/types"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { themes as prismThemes } from "prism-react-renderer"
import remarkFixAnchors from "./src/remark/remark-fix-anchors.mjs"
import remarkInclude from "./src/remark/remark-include.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const docsDir = join(__dirname, "docs")

// --- multi-version site ------------------------------------------------------
// The production site composes several independent Docusaurus builds (one per
// major version line) into a single publish tree: the current line at "/" and
// each maintenance line under its own sub-path, e.g. "/v26/".
//
// docs-versions.json is the single source of truth for that set — the same file
// tells website/scripts/build-versioned-site.sh which git ref to build at which
// path, and is read here for the navbar version dropdown, so labels and paths
// are declared once.
type DocsVersion = { label: string; path: string; ref?: string; current?: boolean }

// normalize to a leading + trailing slash so hrefs are stable
const normalizePath = (path: string) => `/${path.replace(/^\/+/, "").replace(/\/+$/, "")}/`.replace(/^\/\/$/, "/")

const docsVersionsFile = join(__dirname, "docs-versions.json")
const docsVersions: DocsVersion[] = (() => {
  let versions: unknown
  try {
    versions = JSON.parse(readFileSync(docsVersionsFile, "utf8")).versions
  } catch (e: any) {
    throw new Error(`cannot read ${docsVersionsFile}: ${e.message}`)
  }
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error(`${docsVersionsFile} must declare a non-empty "versions" array`)
  }
  return (versions as DocsVersion[]).map(version => ({ ...version, path: normalizePath(version.path) }))
})()

// Base URL of *this* instance. build-versioned-site.sh sets DOCS_BASE_URL per
// sub-site build; it defaults to the path of the entry marked `current`.
// Normalized like the docsVersions paths so a value without a trailing slash
// still matches its entry.
const baseUrl = normalizePath(process.env.DOCS_BASE_URL || docsVersions.find(v => v.current)?.path || "/")

// Which declared version this build is, so the dropdown can name itself.
const activeVersion = docsVersions.find(v => v.path === baseUrl) ?? docsVersions.find(v => v.current)

const config: Config = {
  title: "electron-builder",
  tagline: "A complete solution to package and build a ready-for-distribution Electron app",
  favicon: "/img/favicon.ico",

  future: {
    v4: true,
  },

  url: "https://www.electron.build",
  baseUrl,

  organizationName: "electron-userland",
  projectName: "electron-builder",

  onBrokenLinks: "warn",

  markdown: {
    format: "detect",
  },

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  plugins: [
    "./scripts/docusaurus-plugin-prebuild.ts",
    function suppressPagefindWarning() {
      return {
        name: "suppress-pagefind-warning",
        configureWebpack() {
          return {
            ignoreWarnings: [/Critical dependency/],
          }
        },
      }
    },
    [
      // backwards compatibility for old links, e.g. https://www.electron.build/cli
      "@docusaurus/plugin-client-redirects",
      {
        createRedirects(toPath: string) {
          if (toPath.startsWith("/docs/") && toPath !== "/docs/") {
            return [toPath.replace("/docs/", "/")]
          }
        },
      },
    ],
  ],

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/electron-userland/electron-builder/edit/master/website/",
          routeBasePath: "/docs",
          beforeDefaultRemarkPlugins: [[remarkInclude, { docsDir }], remarkFixAnchors],
          remarkPlugins: [],
          exclude: [],
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: ["@docusaurus/theme-mermaid"],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "electron-builder",
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Overview",
        },
        {
          type: "dropdown",
          label: "Platforms",
          position: "left",
          items: [
            { type: "doc", docId: "targets", label: "All Targets" },
            { type: "doc", docId: "mac", label: "macOS" },
            { type: "doc", docId: "win", label: "Windows" },
            { type: "doc", docId: "linux", label: "Linux" },
          ],
        },
        {
          type: "dropdown",
          label: "Configuration",
          position: "left",
          items: [
            { type: "doc", docId: "configuration", label: "Overview" },
            { type: "doc", docId: "contents", label: "App Contents" },
            { type: "doc", docId: "file-patterns", label: "File Patterns" },
            { type: "doc", docId: "architecture", label: "Output Architecture" },
            { type: "doc", docId: "publish", label: "Publishing" },
          ],
        },
        {
          type: "dropdown",
          label: "Features",
          position: "left",
          items: [
            { type: "doc", docId: "features/build-lifecycle", label: "Build Lifecycle" },
            { type: "doc", docId: "features/hooks", label: "Hooks" },
            { type: "doc", docId: "features/icons-and-images", label: "Icons & Images" },
            { type: "doc", docId: "features/auto-update", label: "Auto Update" },
            { type: "doc", docId: "features/code-signing/code-signing", label: "Code Signing" },
            { type: "doc", docId: "features/multi-platform-build", label: "Multi Platform Build" },
            { type: "doc", docId: "features/github-actions", label: "GitHub Actions" },
            { type: "doc", docId: "features/electron-forge", label: "Electron Forge" },
          ],
        },
        {
          type: "dropdown",
          label: "Tutorials",
          position: "left",
          items: [
            { type: "doc", docId: "tutorials/adding-electron-fuses", label: "Adding Electron Fuses" },
            {
              type: "doc",
              docId: "tutorials/loading-app-dependencies-manually",
              label: "Loading App Dependencies Manually",
            },
            { type: "doc", docId: "tutorials/two-package-structure", label: "Two Package Structure" },
            {
              type: "doc",
              docId: "tutorials/macos-kernel-extensions",
              label: "macOS Kernel Extensions",
            },
            {
              type: "doc",
              docId: "tutorials/code-signing-windows-apps-on-unix",
              label: "Code Signing Windows Apps on Unix",
            },
            {
              type: "doc",
              docId: "tutorials/offline-air-gapped-builds",
              label: "Offline / Air-Gapped Builds",
            },
            {
              type: "doc",
              docId: "tutorials/release-using-channels",
              label: "Release Using Channels",
            },
            {
              type: "doc",
              docId: "tutorials/test-update-on-s3-locally",
              label: "Test Update on S3 Locally",
            },
            { type: "doc", docId: "troubleshooting", label: "Troubleshooting" },
          ],
        },

        {
          type: "doc",
          docId: "migration/v27-breaking-changes",
          position: "left",
          label: "v27 Breaking Changes",
        },

        {
          type: "docSidebar",
          sidebarId: "migrationSidebar",
          position: "left",
          label: "Migration",
        },

        {
          // Version switcher, generated from docs-versions.json. Each entry
          // points at the root of a separate Docusaurus instance, so the links
          // must escape this instance's SPA router: "pathname://" renders a
          // plain <a> (full page load) and autoAddBaseUrl: false keeps
          // Docusaurus from prefixing this instance's baseUrl, so the absolute
          // paths are emitted as-is.
          type: "dropdown",
          label: activeVersion?.label ?? "versions",
          position: "right",
          items: docsVersions.map(version => ({
            label: version.label,
            href: `pathname://${version.path}`,
            target: "_self",
            autoAddBaseUrl: false,
          })),
        },
        {
          href: "https://github.com/electron-userland/electron-builder",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Overview", to: "/docs" },
            { label: "CLI", to: "/docs/cli" },
            { label: "Configuration", to: "/docs/configuration" },
          ],
        },
        {
          title: "Community",
          items: [
            { label: "GitHub Issues", href: "https://github.com/electron-userland/electron-builder/issues" },
            { label: "npm", href: "https://www.npmjs.com/package/electron-builder" },
          ],
        },
        {
          title: "Donate",
          items: [
            {
              label: "Donate",
              href: "https://www.electron.build/docs/donate",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} electron-builder contributors. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "json", "yaml"],
    },
  } satisfies Preset.ThemeConfig,
}

export default config
