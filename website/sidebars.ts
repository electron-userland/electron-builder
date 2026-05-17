import type { SidebarsConfig } from "@docusaurus/plugin-content-docs"

const sidebars: SidebarsConfig = {
  docsSidebar: [
    { type: "doc", id: "introduction", label: "Introduction" },
    { type: "doc", id: "cli", label: "CLI" },
    { type: "doc", id: "targets", label: "Targets" },
    { type: "doc", id: "donate", label: "Donate" },

    {
      type: "category",
      label: "Programmatic API",
      items: [
        { type: "doc", id: "programmatic-usage", label: "Programmatic Usage" },
        { type: "doc", id: "api/index", label: "API Reference" },
      ],
    },

    {
      type: "category",
      label: "Configuration",
      items: [
        { type: "doc", id: "configuration", label: "Configuration" },
        { type: "doc", id: "contents", label: "Contents" },
        { type: "doc", id: "file-patterns", label: "File Patterns" },
        { type: "doc", id: "architecture", label: "Architecture" },
        {
          type: "category",
          label: "macOS",
          items: [
            { type: "doc", id: "mac", label: "macOS" },
            { type: "doc", id: "dmg", label: "DMG" },
            { type: "doc", id: "mas", label: "Mac App Store" },
            { type: "doc", id: "pkg", label: "PKG" },
          ],
        },
        {
          type: "category",
          label: "Windows",
          items: [
            { type: "doc", id: "win", label: "Windows" },
            { type: "doc", id: "nsis", label: "NSIS" },
            { type: "doc", id: "appx", label: "AppX" },
            { type: "doc", id: "msi", label: "MSI" },
            { type: "doc", id: "msi-wrapped", label: "MSI Wrapped" },
            { type: "doc", id: "squirrel-windows", label: "Squirrel Windows" },
          ],
        },
        {
          type: "category",
          label: "Linux",
          items: [
            { type: "doc", id: "linux", label: "Linux" },
            { type: "doc", id: "appimage", label: "AppImage" },
            { type: "doc", id: "flatpak", label: "Flatpak" },
            { type: "doc", id: "snap", label: "Snap" },
          ],
        },
        { type: "doc", id: "publish", label: "Publish" },
      ],
    },

    {
      type: "category",
      label: "Features",
      items: [
        { type: "doc", id: "hooks", label: "Hooks" },
        { type: "doc", id: "icons", label: "Icons" },
        { type: "doc", id: "auto-update", label: "Auto Update" },
        {
          type: "category",
          label: "Code Signing",
          items: [
            { type: "doc", id: "code-signing", label: "Overview" },
            { type: "doc", id: "code-signing-win", label: "Windows" },
            { type: "doc", id: "code-signing-mac", label: "macOS" },
            { type: "doc", id: "notarization", label: "Notarization" },
          ],
        },
        { type: "doc", id: "multi-platform-build", label: "Multi Platform Build" },
        { type: "doc", id: "github-actions", label: "GitHub Actions" },
        { type: "doc", id: "troubleshooting", label: "Troubleshooting" },
      ],
    },

    {
      type: "category",
      label: "Tutorials",
      items: [
        { type: "doc", id: "tutorials/adding-electron-fuses", label: "Adding Electron Fuses" },
        {
          type: "doc",
          id: "tutorials/loading-app-dependencies-manually",
          label: "Loading App Dependencies Manually",
        },
        { type: "doc", id: "tutorials/two-package-structure", label: "Two Package Structure" },
        {
          type: "doc",
          id: "tutorials/macos-kernel-extensions",
          label: "macOS Kernel Extensions",
        },
        {
          type: "doc",
          id: "tutorials/code-signing-windows-apps-on-unix",
          label: "Code Signing Windows Apps on Unix",
        },
        {
          type: "doc",
          id: "tutorials/release-using-channels",
          label: "Release Using Channels",
        },
        {
          type: "doc",
          id: "tutorials/test-update-on-s3-locally",
          label: "Test Update on S3 Locally",
        },
      ],
    },

    {
      type: "category",
      label: "Reference",
      items: [{ type: "doc", id: "glossary", label: "Glossary" }],
    },
  ],
}

export default sidebars
