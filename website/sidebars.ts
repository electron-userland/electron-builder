import type { SidebarsConfig } from "@docusaurus/plugin-content-docs"

const sidebars: SidebarsConfig = {
  docsSidebar: [
    { type: "doc", id: "introduction", label: "Overview" },
    { type: "doc", id: "cli", label: "CLI" },

    {
      type: "category",
      label: "Migration",
      collapsed: false,
      items: [
        { type: "doc", id: "migration/whats-new-v27", label: "What's New in v27" },
        { type: "doc", id: "migration/v26-to-v27", label: "v26 → v27 Walkthrough" },
        { type: "doc", id: "migration/v27-breaking-changes", label: "v27 Breaking Changes" },
        { type: "link", label: "Changelog", href: "/changelog" },
      ],
    },

    {
      type: "category",
      label: "Configuration",
      link: { type: "doc", id: "configuration" },
      items: [
        { type: "doc", id: "contents", label: "App Contents" },
        { type: "doc", id: "file-patterns", label: "File Patterns" },
        { type: "doc", id: "architecture", label: "Build Architectures" },
        { type: "doc", id: "toolsets", label: "Toolsets" },
        { type: "doc", id: "publish", label: "Publish" },
      ],
    },

    {
      type: "category",
      label: "Platforms & Targets",
      link: { type: "doc", id: "targets" },
      items: [
        {
          type: "category",
          label: "macOS",
          link: { type: "doc", id: "mac" },
          items: [
            { type: "doc", id: "dmg", label: "DMG" },
            { type: "doc", id: "mas", label: "Mac App Store (mas)" },
            { type: "doc", id: "pkg", label: "PKG" },
          ],
        },
        {
          type: "category",
          label: "Windows",
          link: { type: "doc", id: "win" },
          items: [
            { type: "doc", id: "nsis", label: "NSIS" },
            { type: "doc", id: "appx", label: "AppX" },
            { type: "doc", id: "msix", label: "MSIX" },
            { type: "doc", id: "msi", label: "MSI" },
            { type: "doc", id: "msi-wrapped", label: "MSI Wrapped" },
            { type: "doc", id: "squirrel-windows", label: "Squirrel Windows" },
          ],
        },
        {
          type: "category",
          label: "Linux",
          link: { type: "doc", id: "linux" },
          items: [
            { type: "doc", id: "appimage", label: "AppImage" },
            { type: "doc", id: "flatpak", label: "Flatpak" },
            { type: "doc", id: "snap", label: "Snap" },
          ],
        },
      ],
    },

    {
      type: "category",
      label: "Features",
      items: [
        { type: "doc", id: "features/build-lifecycle", label: "Build Lifecycle" },
        { type: "doc", id: "features/hooks", label: "Hooks" },
        { type: "doc", id: "features/icons-and-images", label: "Icons & Images" },
        { type: "doc", id: "features/multi-platform-build", label: "Multi Platform Build" },
        { type: "doc", id: "features/github-actions", label: "GitHub Actions" },
        { type: "doc", id: "features/electron-forge", label: "Electron Forge" },
      ],
    },

    {
      type: "category",
      label: "Auto Update",
      link: { type: "doc", id: "features/auto-update" },
      items: [
        { type: "doc", id: "features/signed-update-manifests", label: "Signed Update Manifests" },
        { type: "doc", id: "features/key-rotation", label: "Key Rotation" },
      ],
    },

    {
      type: "category",
      label: "Code Signing & Security",
      link: { type: "doc", id: "features/code-signing/code-signing" },
      items: [
        { type: "doc", id: "features/code-signing/code-signing-mac", label: "macOS Signing" },
        { type: "doc", id: "features/code-signing/code-signing-win", label: "Windows Signing" },
        { type: "doc", id: "features/code-signing/notarization", label: "Notarization" },
        { type: "doc", id: "features/security", label: "Security & Hardening" },
      ],
    },

    {
      type: "category",
      label: "Tutorials",
      items: [
        { type: "doc", id: "tutorials/adding-electron-fuses", label: "Adding Electron Fuses" },
        { type: "doc", id: "tutorials/code-signing-windows-apps-on-unix", label: "Code Signing Windows Apps on Unix" },
        { type: "doc", id: "tutorials/flatpak-in-ci-and-containers", label: "Flatpak in CI and Containers" },
        { type: "doc", id: "tutorials/loading-app-dependencies-manually", label: "Loading App Dependencies Manually" },
        { type: "doc", id: "tutorials/macos-kernel-extensions", label: "macOS Kernel Extensions" },
        { type: "doc", id: "tutorials/offline-air-gapped-builds", label: "Offline / Air-Gapped Builds" },
        { type: "doc", id: "tutorials/release-using-channels", label: "Release Using Channels" },
        { type: "doc", id: "tutorials/test-update-on-s3-locally", label: "Test Update on S3 Locally" },
        { type: "doc", id: "tutorials/two-package-structure", label: "Two Package Structure" },
      ],
    },

    { type: "doc", id: "troubleshooting", label: "Troubleshooting" },

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
      label: "Reference",
      items: [
        { type: "doc", id: "environment-variables", label: "Environment Variables" },
        { type: "doc", id: "glossary", label: "Glossary" },
      ],
    },

    { type: "doc", id: "donate", label: "Donate" },
  ],
}

export default sidebars
