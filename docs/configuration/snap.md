The top-level [snap](configuration.md#Configuration-snap) key contains set of options instructing electron-builder on how it should build [Snap](http://snapcraft.io).

<!-- do not edit. start of generated block -->
* <code id="SnapOptions-confinement">confinement</code> = `strict` "devmode" | "strict" | "classic" - The type of [confinement](https://snapcraft.io/docs/reference/confinement) supported by the snap.
* <code id="SnapOptions-environment">environment</code> any - The custom environment. Defaults to `{"TMPDIR: "$XDG_RUNTIME_DIR"}`. If you set custom, it will be merged with default.
* <code id="SnapOptions-summary">summary</code> String
* <code id="SnapOptions-grade">grade</code> = `stable` "devel" | "stable" - The quality grade of the snap. It can be either `devel` (i.e. a development version of the snap, so not to be published to the “stable” or “candidate” channels) or “stable” (i.e. a stable release or release candidate, which can be released to all channels).
* <code id="SnapOptions-assumes">assumes</code> Array&lt;String&gt; | String - The list of features that must be supported by the core in order for this snap to install.
* <code id="SnapOptions-buildPackages">buildPackages</code> Array&lt;String&gt; - The list of debian packages needs to be installed for building this snap.
* <code id="SnapOptions-stagePackages">stagePackages</code> Array&lt;String&gt; - The list of Ubuntu packages to use that are needed to support the `app` part creation. Like `depends` for `deb`. Defaults to `["libasound2", "libgconf2-4", "libnotify4", "libnspr4", "libnss3", "libpcre3", "libpulse0", "libxss1", "libxtst6"]`.
  
  If list contains `default`, it will be replaced to default list, so, `["default", "foo"]` can be used to add custom package `foo` in addition to defaults.
* <code id="SnapOptions-hooks">hooks</code> = `build/snap-hooks` String - The [hooks](https://docs.snapcraft.io/build-snaps/hooks) directory, relative to `build` (build resources directory).
* <code id="SnapOptions-plugs">plugs</code> Array&lt;String | module:electron-builder-lib/out/options/SnapOptions.PlugDescriptor&gt; | module:electron-builder-lib/out/options/SnapOptions.PlugDescriptor - The list of [plugs](https://snapcraft.io/docs/reference/interfaces). Defaults to `["desktop", "desktop-legacy", "home", "x11", "unity7", "browser-support", "network", "gsettings", "pulseaudio", "opengl"]`.
  
  If list contains `default`, it will be replaced to default list, so, `["default", "foo"]` can be used to add custom plug `foo` in addition to defaults.
  
  Additional attributes can be specified using object instead of just name of plug: ``` [  {    "browser-sandbox": {      "interface": "browser-support",      "allow-sandbox": true    },  },  "another-simple-plug-name" ] ```
* <code id="SnapOptions-after">after</code> Array&lt;String&gt; - Specifies any [parts](https://snapcraft.io/docs/reference/parts) that should be built before this part. Defaults to `["desktop-gtk2""]`.
  
  If list contains `default`, it will be replaced to default list, so, `["default", "foo"]` can be used to add custom parts `foo` in addition to defaults.
* <code id="SnapOptions-useTemplateApp">useTemplateApp</code> Boolean - Whether to use template snap. Defaults to `true` if `stagePackages` not specified.

Inherited from `CommonLinuxOptions`:
* <code id="SnapOptions-synopsis">synopsis</code> String - The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).
* <code id="SnapOptions-description">description</code> String - As [description](/configuration/configuration.md#Metadata-description) from application package.json, but allows you to specify different for Linux.
* <code id="SnapOptions-category">category</code> String - The [application category](https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry).
* <code id="SnapOptions-desktop">desktop</code> any - The [Desktop file](https://developer.gnome.org/integration-guide/stable/desktop-files.html.en) entries (name to value).

Inherited from `TargetSpecificOptions`:
* <code id="SnapOptions-artifactName">artifactName</code> String - The [artifact file name template](/configuration/configuration.md#artifact-file-name-template).
* <code id="SnapOptions-publish">publish</code> The [publish](/configuration/publish.md) options.
<!-- end of generated block -->
