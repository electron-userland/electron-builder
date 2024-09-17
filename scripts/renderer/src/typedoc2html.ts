import { copy, exists } from "fs-extra";
import { rm } from "fs/promises";
import * as path from "path";
import * as typedoc from "typedoc";

async function main() {

  const outputDir = "docs";
  const dest = path.resolve(process.cwd(), outputDir)

  const origin = path.resolve(process.cwd(), "pages");
  console.log("copying from", origin, dest)
  const siteDir = path.resolve(process.cwd(), "site");


  if ((await exists(siteDir))) {
    await rm(siteDir,{ recursive: true })
  }
  if ((await exists(dest))) {
    await rm(dest, { recursive: true })
  }
  await copy(origin, dest)
  await copy(path.resolve("./README.md"), path.resolve(origin, "index.md"))

  const typedocConfig: Partial<typedoc.TypeDocOptions> = {
    options: "typedoc.config.js",
  };

  const options = {
    ...typedocConfig,
    "pluginPages": {
      "pages": [
        {
          "name": "Usage",
          "children": [
            {
              "name": "CLI",
              "source": "api/cli.md"
            },
            {
              "name": "JS Config/API",
              "source": "api/programmatic-usage.md"
            },
          ]
        },
        {
          "name": "Configuration",
          "source": "configuration.md",
          "children": [
            {
              "name": "Contents",
              "source": "contents.md"
            },
            {
              "name": "Publish",
              "source": "publish.md"
            },
            {
              "name": "Mac",
              "source": "mac.md",
              "children": [
                {
                  "name": "Dmg",
                  "source": "dmg.md"
                },
                {
                  "name": "Mas",
                  "source": "mas.md"
                },
              ]
            },
            {
              "name": "Linux",
              "source": "linux.md",
              "children": [
                {
                  "name": "AppImage",
                  "source": "appimage.md"
                },
                {
                  "name": "Snap",
                  "source": "snap.md"
                },
                {
                  "name": "Flatpak",
                  "source": "flatpak.md"
                },
                {
                  "name": "Pkg",
                  "source": "pkg.md"
                },
              ]
            },
            {
              "name": "Windows",
              "source": "windows.md",
              "children": [
                {
                  "name": "MSI",
                  "source": "msi.md"
                },
                {
                  "name": "Squirrel",
                  "source": "squirrel-windows.md"
                },
                {
                  "name": "NSIS",
                  "source": "nsis.md"
                },
                {
                  "name": "AppX",
                  "source": "appx.md"
                },
                {
                  "name": "MSI Wrapped",
                  "source": "msi-wrapped.md"
                },
              ]
            },
          ]
        },
        {
          "name": "Tutorials",
          "children": [
            {
              "name": "release-using-channels",
              "source": "tutorials/release-using-channels.md"
            },
            {
              "name": "test-update-on-s3-locally",
              "source": "tutorials/test-update-on-s3-locally.md"
            },
            {
              "name": "macos-kernel-extensions",
              "source": "tutorials/macos-kernel-extensions.md"
            },
            {
              "name": "code-signing-windows-apps-on-unix",
              "source": "tutorials/code-signing-windows-apps-on-unix.md"
            },
            {
              "name": "two-package-structure",
              "source": "tutorials/two-package-structure.md"
            },
            {
              "name": "auto-update",
              "source": "tutorials/auto-update.md"
            },
            {
              "name": "code-signing",
              "source": "tutorials/code-signing.md"
            },
            {
              "name": "loading-app-dependencies-manually",
              "source": "tutorials/loading-app-dependencies-manually.md"
            },
          ]
        },
        {
          "name": "Setup",
          "children": [
            {
              "name": "setup",
              "source": "setup/setup.md"
            },
            {
              "name": "multi-platform-build",
              "source": "setup/multi-platform-build.md"
            },
            {
              "name": "platform-specific-configuration-note",
              "source": "setup/platform-specific-configuration-note.md"
            },
            {
              "name": "file-patterns",
              "source": "setup/file-patterns.md"
            },
            {
              "name": "hooks",
              "source": "setup/hooks.md"
            },
            {
              "name": "icons",
              "source": "setup/icons.md"
            },
          ]
        },
        {
          "name": "Donate",
          "source": "donate.md"
        },
      ]
    }

    // pluginPages: {
    //   pages: [
    //     { name: "appimage", source: "appimage.md" },
    //     { name: "appx", source: "appx.md" },
    //     { name: "auto-update", source: "auto-update.md" },
    //     { name: "cli", source: "cli.md" },
    //     { name: "code-signing-windows-apps-on-unix", source: "code-signing-windows-apps-on-unix.md" },
    //     { name: "code-signing", source: "code-signing.md" },
    //     { name: "configuration", source: "configuration.md" },
    //     { name: "contents", source: "contents.md" },
    //     { name: "dmg", source: "dmg.md" },
    //     { name: "donate", source: "donate.md" },
    //     { name: "file-patterns", source: "file-patterns.md" },
    //     { name: "flatpak", source: "flatpak.md" },
    //     { name: "icons", source: "icons.md" },
    //     { name: "index", source: "index.md" },
    //     { name: "linux", source: "linux.md" },
    //     { name: "loading-app-dependencies-manually", source: "loading-app-dependencies-manually.md" },
    //     { name: "mac", source: "mac.md" },
    //     { name: "macos-kernel-extensions", source: "macos-kernel-extensions.md" },
    //     { name: "mas", source: "mas.md" },
    //     { name: "msi-wrapped", source: "msi-wrapped.md" },
    //     { name: "msi", source: "msi.md" },
    //     { name: "multi-platform-build", source: "multi-platform-build.md" },
    //     { name: "nsis", source: "nsis.md" },
    //     { name: "pkg", source: "pkg.md" },
    //     { name: "programmatic-usage", source: "programmatic-usage.md" },
    //     { name: "publish", source: "publish.md" },
    //     { name: "release-using-channels", source: "release-using-channels.md" },
    //     { name: "snap", source: "snap.md" },
    //     { name: "squirrel-windows", source: "squirrel-windows.md" },
    //     { name: "test-update-on-s3-locally", source: "test-update-on-s3-locally.md" },
    //     { name: "two-package-structure", source: "two-package-structure.md" },
    //     { name: "win", source: "win.md" },
    //   ],
    // },
  }


  const config = {
    ...typedocConfig,
    flattenOutputFiles: true
  };
  const app = await typedoc.Application.bootstrapWithPlugins(config)

  const project = await app.convert();

  if (project) {
    await app.generateDocs(project, outputDir);
  }
}

main().catch(console.error);
