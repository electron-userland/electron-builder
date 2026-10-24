import type { ClientModule } from "@docusaurus/types"

// The v27 breaking-changes page was split into a hub and four category pages. Build messages of
// released versions and external links still point at "v27-breaking-changes#<anchor>", so a
// section that moved is forwarded to its new page. Frozen: new links go to the category pages.
// A Map, so only these anchors match — never an inherited Object.prototype member such as #constructor.
const MOVED_SECTIONS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    "allow_electron_builder_as_production_dependency-is-removed-and-the-default-flipped":
      "v27-build-changes#allow_electron_builder_as_production_dependency-is-removed-and-the-default-flipped",
    "allowmissingdependencies-now-fails-the-build": "v27-build-changes#allowmissingdependencies-now-fails-the-build",
    "app-updateyml-feed-follows-the-update-writing-targets": "v27-build-changes#app-updateyml-feed-follows-the-update-writing-targets",
    appimagesystemintegration: "v27-config-changes#appimagesystemintegration",
    "arch-all-now-expands-to-x64-and-arm64-32-bit-fails-fast-on-electron-44": "v27-build-changes#arch-all-now-expands-to-x64-and-arm64-32-bit-fails-fast-on-electron-44",
    "asar-options-asar": "v27-config-changes#asar-options-asar",
    "asar-ordering-is-now-applied": "v27-build-changes#asar-ordering-is-now-applied",
    "asar-true-still-valid--no-action-needed": "v27-config-changes#asar-true-still-valid--no-action-needed",
    "auto-update-electron-updater": "v27-runtime-changes#auto-update-electron-updater",
    "autoinstallevent-replaces-autoinstallonappquit": "v27-runtime-changes#autoinstallevent-replaces-autoinstallonappquit",
    "azure-trusted-signing-signtool-dlib-is-the-default": "v27-build-changes#azure-trusted-signing-signtool-dlib-is-the-default",
    "bitbucket-cloud-publishing-token-without-username-uses-bearer-auth": "v27-build-changes#bitbucket-cloud-publishing-token-without-username-uses-bearer-auth",
    "buildhelper-bundle-id": "v27-config-changes#buildhelper-bundle-id",
    "ci_build_tag-environment-variable": "v27-build-changes#ci_build_tag-environment-variable",
    "cli-changes": "v27-build-changes#nodejs-cli",
    "custom-windows-signing-hooks-move-to-winsignsign": "v27-config-changes#custom-windows-signing-hooks-move-to-winsignsign",
    "customnsisbinary-and-customnsisresources-replaced-by-toolsetsnsis": "v27-config-changes#customnsisbinary-and-customnsisresources-replaced-by-toolsetsnsis",
    "dependencies--file-copying": "v27-build-changes#dependencies--file-copying",
    "devmetadata-extrametadata-programmatic-packageroptions": "v27-developer-changes#devmetadata-extrametadata-programmatic-packageroptions",
    disabledefaultignoredfiles: "v27-config-changes#disabledefaultignoredfiles",
    "disablewebinstaller-defaults-to-true": "v27-runtime-changes#disablewebinstaller-defaults-to-true",
    "dmg-filesystem-defaults-to-apfs": "v27-runtime-changes#dmg-filesystem-defaults-to-apfs",
    "downloadupdate-resolves-with-a-downloadexecutorresult-object": "v27-runtime-changes#downloadupdate-resolves-with-a-downloadexecutorresult-object",
    "electron-forge-maker-plugins": "v27-developer-changes#electron-forge-maker-plugins",
    "electron-prebuilt-electron-rebuild-no-longer-error-and-are-not-excluded": "v27-build-changes#electron-prebuilt-electron-rebuild-no-longer-error-and-are-not-excluded",
    "electron_builder_binaries_allow_http-renamed": "v27-build-changes#electron_builder_binaries_allow_http-renamed",
    electroncompile: "v27-config-changes#electroncompile",
    "electrondownload-electronget": "v27-config-changes#electrondownload-electronget",
    "electrongetoptionsforce-removed": "v27-config-changes#electrongetoptionsforce-removed",
    "extrafiles--extraresources-destinations-are-validated": "v27-build-changes#extrafiles--extraresources-destinations-are-validated",
    "file-options-fileoptions": "v27-config-changes#file-options-fileoptions",
    "flatpak-default-permissions": "v27-runtime-changes#flatpak-default-permissions",
    "flatpak-tooling-requirements": "v27-build-changes#flatpak-tooling-requirements",
    "flatpak-wayland-flags": "v27-runtime-changes#flatpak-wayland-flags",
    "framework-nodeversion-launchuiversion": "v27-config-changes#framework-nodeversion-launchuiversion",
    "githuboptions-gitlaboptions-vprefixedtagname": "v27-config-changes#githuboptions-gitlaboptions-vprefixedtagname",
    "implicit-publish-on-npm-run-release-removed": "v27-build-changes#implicit-publish-on-npm-run-release-removed",
    "implicit-publish-removed": "v27-build-changes#implicit-publish-removed",
    "includepdb-fileoptionsexcludedexts": "v27-config-changes#includepdb-fileoptionsexcludedexts",
    "info-packager-is-now-protected": "v27-developer-changes#info-packager-is-now-protected",
    "internal-changes-non-user-facing": "v27-developer-changes#internal-changes-non-user-facing",
    "latestyml-drops-legacy-top-level-pathsha512": "v27-build-changes#latestyml-drops-legacy-top-level-pathsha512",
    "linux-launcher-entrypoint": "v27-runtime-changes#linux-launcher-entrypoint",
    "linux-maintainer-script-ejs-template-syntax": "v27-developer-changes#linux-maintainer-script-ejs-template-syntax",
    "linuxsyncdesktopname-always-synced": "v27-config-changes#linuxsyncdesktopname-always-synced",
    "macos-asar-integrity-digest": "v27-runtime-changes#macos-asar-integrity-digest",
    "macos-default-entitlements-tightened": "v27-runtime-changes#macos-default-entitlements-tightened",
    "macos-dmg": "v27-runtime-changes#macos",
    "macos-productname-and-executablename-are-validated-not-sanitized": "v27-build-changes#macos-productname-and-executablename-are-validated-not-sanitized",
    "macos-signing-macsign": "v27-config-changes#macos-signing-macsign",
    macuniversal: "v27-config-changes#macuniversal",
    "missing-publishername-fails-update-verification": "v27-build-changes#missing-publishername-fails-update-verification",
    "native-binaries-are-verified-against-the-target": "v27-build-changes#native-binaries-are-verified-against-the-target",
    "native-esm-output": "v27-developer-changes#native-esm-output",
    "native-module-options-nativemodules": "v27-config-changes#native-module-options-nativemodules",
    "new-allowunverifiedlinuxpackages-opt-in-linux-package-signature-verification": "whats-new-v27#new-in-v27",
    "new-cloudflare-r2-publish-provider-additive": "whats-new-v27#new-in-v27",
    "new-dmgformat-ulmo-additive": "whats-new-v27#new-in-v27",
    "new-msix-target-beta": "whats-new-v27#new-in-v27",
    "new-signing-modes-beta-hsm-and-pkcs11": "v27-config-changes#new-signing-modes-beta-hsm-and-pkcs11",
    "no-home-directory-access": "v27-runtime-changes#no-home-directory-access",
    "no-notifications-talk-name-on-current-base-apps": "v27-runtime-changes#no-notifications-talk-name-on-current-base-apps",
    "node_modules-are-now-archos-filtered-on-every-build": "v27-build-changes#node_modules-are-now-archos-filtered-on-every-build",
    "nodejs-22120-required": "v27-build-changes#nodejs-22120-required",
    npmskipbuildfromsource: "v27-config-changes#npmskipbuildfromsource",
    "nsis-behavior-changes": "v27-runtime-changes#windows-nsis",
    "nsis-custominstallmode-macro-guard-casing-corrected": "v27-developer-changes#nsis-custominstallmode-macro-guard-casing-corrected",
    "nsis-file-association-progid-format-changed": "v27-runtime-changes#nsis-file-association-progid-format-changed",
    "nsis-per-machine-builds-set-isadminrightsrequired": "v27-runtime-changes#nsis-per-machine-builds-set-isadminrightsrequired",
    "pacman-default-dependencies-changed": "v27-runtime-changes#pacman-default-dependencies-changed",
    "platformpackagerinfo-is-now-protected": "v27-developer-changes#info-packager-is-now-protected",
    "platformspecificbuildoptions-is-now-protected": "v27-developer-changes#platformspecificbuildoptions-is-now-protected",
    "programmatic-plugin-author-api-changes": "v27-developer-changes#programmatic-plugin-author-api-changes",
    "publishing-electron-publish": "v27-build-changes#publishing-update-metadata",
    "quitandinstall-takes-an-options-object": "v27-runtime-changes#quitandinstall-takes-an-options-object",
    "redundant-production-dependencies-are-excluded-not-rejected": "v27-build-changes#redundant-production-dependencies-are-excluded-not-rejected",
    "removed-configuration-options": "v27-config-changes#removed-configuration-options",
    "removed-exports": "v27-developer-changes#removed-exports",
    "removed-flags-embuild-emdirectories": "v27-build-changes#removed-flags-embuild-emdirectories",
    "renamed-type-exports": "v27-developer-changes#renamed-type-exports",
    "restructured-configuration": "v27-config-changes#restructured-configuration",
    "root-level-directories-in-packagejson": "v27-config-changes#root-level-directories-in-packagejson",
    "runtime-esm": "v27-developer-changes#runtime-esm",
    "s3-publishing-requires-an-explicit-awscredentialssource": "v27-build-changes#s3-publishing-requires-an-explicit-awscredentialssource",
    "signed-update-manifests-are-required": "v27-build-changes#signed-update-manifests-are-required",
    "signing-key-must-be-in-updatemanifestpublickey": "v27-build-changes#signing-key-must-be-in-updatemanifestpublickey",
    "snap-core24-default-in-plugs-merges-the-full-default-set": "v27-runtime-changes#snap-core24-default-in-plugs-merges-the-full-default-set",
    "snap-core24-no-allow-sandbox-by-default": "v27-runtime-changes#snap-core24-no-allow-sandbox-by-default",
    "snap-snapcraft": "v27-config-changes#snap-snapcraft",
    squirrelwindowscustomsquirrelvendordir: "v27-config-changes#squirrelwindowscustomsquirrelvendordir",
    squirrelwindowsnomsi: "v27-config-changes#squirrelwindowsnomsi",
    "suffixed-update-channels-now-expand-to-lower-channels": "v27-build-changes#suffixed-update-channels-now-expand-to-lower-channels",
    "toolset-defaults-resolve-to-latest-newest-bundle": "v27-build-changes#toolset-defaults-resolve-to-latest-newest-bundle",
    "toolset-env-var-overrides-removed": "v27-build-changes#toolset-env-var-overrides-removed",
    "toolsets-environment-variables": "v27-build-changes#toolsets-environment-variables",
    "update-credentials-stay-on-the-feeds-origin": "v27-runtime-changes#update-credentials-stay-on-the-feeds-origin",
    "verifyupdatecodesignature-renamed-to-verifyupdatefileauthenticodesignature": "v27-runtime-changes#verifyupdatecodesignature-renamed-to-verifyupdatefileauthenticodesignature",
    "why-consolidate-asar-options-under-asar": "v27-config-changes#asar-options-asar",
    "why-consolidate-macos-signing-under-macsign": "v27-config-changes#macos-signing-macsign",
    "why-move-native-module-options-under-nativemodules": "v27-config-changes#native-module-options-nativemodules",
    "why-native-esm": "v27-developer-changes#native-esm-output",
    "why-nest-files-extraresources-and-extrafiles-under-fileoptions": "v27-config-changes#file-options-fileoptions",
    "why-rename-electrondownload-to-electronget": "v27-config-changes#electrondownload-electronget",
    "why-replace-k-string-in-windowsazuresigningconfiguration": "v27-config-changes#windows-signing-winsign",
    "why-restructure-snap-into-snapcraft": "v27-config-changes#snap-snapcraft",
    "why-unify-all-windows-signing-under-winsign": "v27-config-changes#windows-signing-winsign",
    "windows-publishername-is-validated-against-the-signing-certificate": "v27-build-changes#windows-publishername-is-validated-against-the-signing-certificate",
    "windows-publishername-must-be-a-distinguished-name": "v27-build-changes#windows-publishername-must-be-a-distinguished-name",
    "windows-signing-winsign": "v27-config-changes#windows-signing-winsign",
    "windows-update-signature-verification-fails-closed": "v27-runtime-changes#windows-update-signature-verification-fails-closed",
    "winsignexecutable-winsignandeditexecutable-removed": "v27-config-changes#winsignexecutable-winsignandeditexecutable-removed",
  })
)

const HUB_PATH = /\/migration\/v27-breaking-changes\/?$/

const clientModule: ClientModule = {
  onRouteDidUpdate({ location }) {
    if (!HUB_PATH.test(location.pathname) || location.hash.length < 2) {
      return
    }
    let anchor: string
    try {
      anchor = decodeURIComponent(location.hash.slice(1))
    } catch {
      // malformed percent-encoding (e.g. #50%) is not one of the moved anchors: stay on the hub
      return
    }
    const target = MOVED_SECTIONS.get(anchor)
    if (target != null) {
      window.location.replace(location.pathname.replace(HUB_PATH, `/migration/${target}`))
    }
  },
}

export default clientModule
