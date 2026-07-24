import type { SidebarsConfig } from "@docusaurus/plugin-content-docs"

const sidebars: SidebarsConfig = {
  docsSidebar: [
    { type: "doc", id: "introduction", label: "Overview" },
    { type: "doc", id: "cli", label: "CLI" },

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
      items: [{ type: "doc", id: "glossary", label: "Glossary" }],
    },

    { type: "doc", id: "donate", label: "Donate" },
  ],

  configSidebar: [
    { type: "doc", id: "configuration", label: "Overview" },
    { type: "doc", id: "contents", label: "App Contents" },
    { type: "doc", id: "file-patterns", label: "File Patterns" },
    { type: "doc", id: "architecture", label: "Build Architectures" },
    { type: "doc", id: "toolsets", label: "Toolsets" },
    { type: "doc", id: "publish", label: "Publish" },
  ],

  platformsSidebar: [
    { type: "doc", id: "targets", label: "All Targets" },
    {
      type: "category",
      label: "macOS",
      items: [
        { type: "doc", id: "mac", label: "macOS" },
        { type: "doc", id: "dmg", label: "DMG" },
        { type: "doc", id: "mas", label: "Mac App Store (mas)" },
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
        { type: "doc", id: "msix", label: "MSIX" },
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
  ],

  featuresSidebar: [
    { type: "doc", id: "features/build-lifecycle", label: "Build Lifecycle" },
    { type: "doc", id: "features/hooks", label: "Hooks" },
    { type: "doc", id: "features/icons-and-images", label: "Icons & Images" },
    { type: "doc", id: "features/auto-update", label: "Auto Update" },
    { type: "doc", id: "features/security", label: "Security & Hardening" },
    {
      type: "category",
      label: "Code Signing",
      link: { type: "doc", id: "features/code-signing/code-signing" },
      items: [
        { type: "doc", id: "features/code-signing/code-signing-mac", label: "macOS Signing" },
        { type: "doc", id: "features/code-signing/code-signing-win", label: "Windows Signing" },
        { type: "doc", id: "features/code-signing/notarization", label: "Notarization" },
      ],
    },
    { type: "doc", id: "features/multi-platform-build", label: "Multi Platform Build" },
    { type: "doc", id: "features/github-actions", label: "GitHub Actions" },
    { type: "doc", id: "features/electron-forge", label: "Electron Forge" },
  ],

  migrationSidebar: [
    { type: "doc", id: "migration/whats-new-v27", label: "What's New in v27" },
    { type: "doc", id: "migration/v26-to-v27", label: "v26 → v27 Walkthrough" },
    { type: "doc", id: "migration/v27-breaking-changes", label: "v27 Breaking Changes" },
  ],

  tutorialsSidebar: [
    { type: "doc", id: "tutorials/adding-electron-fuses", label: "Adding Electron Fuses" },
    { type: "doc", id: "tutorials/code-signing-windows-apps-on-unix", label: "Code Signing Windows Apps on Unix" },
    { type: "doc", id: "tutorials/loading-app-dependencies-manually", label: "Loading App Dependencies Manually" },
    { type: "doc", id: "tutorials/macos-kernel-extensions", label: "macOS Kernel Extensions" },
    { type: "doc", id: "tutorials/release-using-channels", label: "Release Using Channels" },
    { type: "doc", id: "tutorials/test-update-on-s3-locally", label: "Test Update on S3 Locally" },
    { type: "doc", id: "tutorials/two-package-structure", label: "Two Package Structure" },
    { type: "doc", id: "troubleshooting", label: "Troubleshooting" },
  ],
}

export default sidebars
