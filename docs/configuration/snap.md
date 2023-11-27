The top-level [snap](configuration.md#Configuration-snap) key contains set of options instructing electron-builder on how it should build [Snap](http://snapcraft.io).

<!-- do not edit. start of generated block -->
* <code id="SnapOptions-base">base</code> String | "undefined" - A snap of type base to be used as the execution environment for this snap. Examples: `core`, `core18`, `core20`, `core22`. Defaults to `core18`
* <code id="SnapOptions-confinement">confinement</code> = `strict` "devmode" | "strict" | "classic" | "undefined" - The type of [confinement](https://snapcraft.io/docs/reference/confinement) supported by the snap.
* <code id="SnapOptions-environment">environment</code> Object&lt;String, any&gt; | "undefined" - The custom environment. Defaults to `{"TMPDIR: "$XDG_RUNTIME_DIR"}`. If you set custom, it will be merged with default.
* <code id="SnapOptions-summary">summary</code> String | "undefined" - The 78 character long summary. Defaults to [productName](/configuration/configuration#Configuration-productName).
* <code id="SnapOptions-grade">grade</code> = `stable` "devel" | "stable" | "undefined" - The quality grade of the snap. It can be either `devel` (i.e. a development version of the snap, so not to be published to the “stable” or “candidate” channels) or “stable” (i.e. a stable release or release candidate, which can be released to all channels).
* <code id="SnapOptions-assumes">assumes</code> Array&lt;String&gt; | String | "undefined" - The list of features that must be supported by the core in order for this snap to install.
* <code id="SnapOptions-buildPackages">buildPackages</code> Array&lt;String&gt; | "undefined" - The list of debian packages needs to be installed for building this snap.
* <code id="SnapOptions-stagePackages">stagePackages</code> Array&lt;String&gt; | "undefined" - The list of Ubuntu packages to use that are needed to support the `app` part creation. Like `depends` for `deb`. Defaults to `["libnspr4", "libnss3", "libxss1", "libappindicator3-1", "libsecret-1-0"]`.
    
    If list contains `default`, it will be replaced to default list, so, `["default", "foo"]` can be used to add custom package `foo` in addition to defaults.

* <code id="SnapOptions-hooks">hooks</code> = `build/snap-hooks` String | "undefined" - The [hooks](https://docs.snapcraft.io/build-snaps/hooks) directory, relative to `build` (build resources directory).
* <code id="SnapOptions-plugs">plugs</code> Array&lt;String | SnapOptions.PlugDescriptor&gt; - The list of [plugs](https://snapcraft.io/docs/reference/interfaces). Defaults to `["desktop", "desktop-legacy", "home", "x11", "wayland", "unity7", "browser-support", "network", "gsettings", "audio-playback", "pulseaudio", "opengl"]`.
    
    If list contains `default`, it will be replaced to default list, so, `["default", "foo"]` can be used to add custom plug `foo` in addition to defaults.
    
    Additional attributes can be specified using object instead of just name of plug: ``` [  {    "browser-sandbox": {      "interface": "browser-support",      "allow-sandbox": true    },  },  "another-simple-plug-name" ] ```

* <code id="SnapOptions-slots">slots</code> Array&lt;String | [SlotDescriptor](#SlotDescriptor)&gt; | [PlugDescriptor](#PlugDescriptor) | "undefined" - The list of [slots](https://snapcraft.io/docs/reference/interfaces).
    
    Additional attributes can be specified using object instead of just name of slot: ``` [  {    "mpris": {      "name": "chromium"    },  } ]
    
    In case you want your application to be a compliant MPris player, you will need to definie The mpris slot with "chromium" name. This electron has it [hardcoded](https://source.chromium.org/chromium/chromium/src/+/master:components/system_media_controls/linux/system_media_controls_linux.cc;l=51;bpv=0;bpt=1), and we need to pass this name so snap [will allow it](https://forum.snapcraft.io/t/unable-to-use-mpris-interface/15360/7) in strict confinement.

* <code id="SnapOptions-after">after</code> Array&lt;String&gt; | "undefined" - Specifies any [parts](https://snapcraft.io/docs/reference/parts) that should be built before this part. Defaults to `["desktop-gtk2""]`.
    
    If list contains `default`, it will be replaced to default list, so, `["default", "foo"]` can be used to add custom parts `foo` in addition to defaults.

* <code id="SnapOptions-useTemplateApp">useTemplateApp</code> Boolean - Whether to use template snap. Defaults to `true` if `stagePackages` not specified.
* <code id="SnapOptions-autoStart">autoStart</code> = `false` Boolean - Whether or not the snap should automatically start on login.
* <code id="SnapOptions-layout">layout</code> Object&lt;String, any&gt; | "undefined" - Specifies any files to make accessible from locations such as `/usr`, `/var`, and `/etc`. See [snap layouts](https://snapcraft.io/docs/snap-layouts) to learn more.
* <code id="SnapOptions-appPartStage">appPartStage</code> Array&lt;String&gt; | "undefined" - Specifies which files from the app part to stage and which to exclude. Individual files, directories, wildcards, globstars, and exclusions are accepted. See [Snapcraft filesets](https://snapcraft.io/docs/snapcraft-filesets) to learn more about the format.
    
    The defaults can be found in [snap.ts](https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/templates/snap/snapcraft.yaml#L29).

* <code id="SnapOptions-title">title</code> String | "undefined" - An optional title for the snap, may contain uppercase letters and spaces. Defaults to `productName`. See [snap format documentation](https://snapcraft.io/docs/snap-format).
* <code id="SnapOptions-compression">compression</code> "xz" | "lzo" | "undefined" - Sets the compression type for the snap. Can be xz, lzo, or null.
* <code id="SnapOptions-allowNativeWayland">allowNativeWayland</code> Boolean | "undefined" - Allow running the program with native wayland support with --ozone-platform=wayland. Disabled by default because of this issue in older Electron/Snap versions: https://github.com/electron-userland/electron-builder/issues/4007

Inherited from `CommonLinuxOptions`:

* <code id="SnapOptions-synopsis">synopsis</code> String | "undefined" - The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).
* <code id="SnapOptions-description">description</code> String | "undefined" - As [description](/configuration/configuration#Metadata-description) from application package.json, but allows you to specify different for Linux.
* <code id="SnapOptions-category">category</code> String | "undefined" - The [application category](https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry).
* <code id="SnapOptions-mimeTypes">mimeTypes</code> Array&lt;String&gt; | "undefined" - The mime types in addition to specified in the file associations. Use it if you don't want to register a new mime type, but reuse existing.
* <code id="SnapOptions-desktop">desktop</code> any | "undefined" - The [Desktop file](https://developer.gnome.org/documentation/guidelines/maintainer/integrating.html#desktop-files) entries (name to value).
* <code id="SnapOptions-executableArgs">executableArgs</code> Array&lt;String&gt; | "undefined" - The executable parameters. Pass to executableName

Inherited from `TargetSpecificOptions`:

* <code id="SnapOptions-artifactName">artifactName</code> String | "undefined" - The [artifact file name template](/configuration/configuration#artifact-file-name-template).
* <code id="SnapOptions-publish">publish</code> The [publish](/configuration/publish) options.

<!-- end of generated block -->
