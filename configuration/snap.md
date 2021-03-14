The top-level [snap](configuration.md#Configuration-snap) key contains set of options instructing electron-builder on how it should build [Snap](http://snapcraft.io).

<!-- do not edit. start of generated block -->
* <code id="SnapOptions-title">title</code> String - An optional title for the snap, may contain uppercase letters and spaces. Defaults to `productName`. See [snap format documentation](https://snapcraft.io/docs/snap-format).
* <code id="SnapOptions-confinement">confinement</code> = `strict` "devmode" | "strict" | "classic" - The type of [confinement](https://snapcraft.io/docs/reference/confinement) supported by the snap.
* <code id="SnapOptions-environment">environment</code> Object&lt;String, any&gt; - The custom environment. Defaults to `{"TMPDIR": "$XDG_RUNTIME_DIR"}`. If you set custom, it will be merged with default.
* <code id="SnapOptions-summary">summary</code> String - A sentence summarising the snap. Defaults to the `productName`. Max len. 78 characters, describing the snap in short and simple terms.
* <code id="SnapOptions-grade">grade</code> = `stable` "devel" | "stable" - The quality grade of the snap. It can be either `devel` (i.e. a development version of the snap, so not to be published to the “stable” or “candidate” channels) or `stable` (i.e. a stable release or release candidate, which can be released to all channels).
* <code id="SnapOptions-assumes">assumes</code> Array&lt;String&gt; | String - The list of features that must be supported by the core in order for this snap to install. To learn more, see the [Snapcraft docs](https://snapcraft.io/docs/snapcraft-top-level-metadata#heading--assumes).
* <code id="SnapOptions-buildPackages">buildPackages</code> Array&lt;String&gt; - The list of Debian packages needs to be installed for building this snap.
* <code id="SnapOptions-stagePackages">stagePackages</code> Array&lt;String&gt; - The list of Ubuntu packages to use that are needed to support the `app` part creation. Like `depends` for `deb`. Defaults to `["libnspr4", "libnss3", "libxss1", "libappindicator3-1", "libsecret-1-0"]`.
    
    If list contains `default`, it will be replaced with the default list, so, `["default", "foo"]` can be used to add a custom package `foo` in addition to the default list.

* <code id="SnapOptions-hooks">hooks</code> = `build/snap-hooks` String - The [hooks](https://docs.snapcraft.io/build-snaps/hooks) directory, relative to `build` (build resources directory).
* <code id="SnapOptions-plugs">plugs</code> Array&lt;String | SnapOptions.PlugDescriptor&gt; - The list of [plugs](https://snapcraft.io/docs/reference/interfaces). Defaults to `["desktop", "desktop-legacy", "home", "x11", "unity7", "browser-support", "network", "gsettings", "pulseaudio", "opengl"]`.
    
    If list contains `default`, it will be replaced with the default list, so, `["default", "foo"]` can be used to add a custom plug `foo` in addition to the default list.
    
    Additional attributes can be specified using object instead of just name of plug: ``` [  {    "browser-sandbox": {      "interface": "browser-support",      "allow-sandbox": true    }  },  "another-simple-plug-name" ] ```

* <code id="SnapOptions-after">after</code> Array&lt;String&gt; - Specifies any [parts](https://snapcraft.io/docs/reference/parts) that should be built before the app part begins its [lifecycle](https://snapcraft.io/docs/parts-lifecycle#heading--steps). Defaults to `["desktop-gtk2"]`.
    
    If list contains `default`, it will be replaced to default list, so, `["default", "foo"]` can be used to add custom parts `foo` in addition to defaults.

* <code id="SnapOptions-useTemplateApp">useTemplateApp</code> Boolean - Whether to use template snap. Defaults to `true` if `stagePackages` not specified.
* <code id="SnapOptions-autoStart">autoStart</code> Boolean - Whether or not the snap should automatically start on login. Defaults to `false`.

* <code id="SnapOptions-appPartStage">appPartStage</code> Array&lt;String&gt; - Specifies which files from the app part to stage and which to exclude. Individual files, directories, wildcards, globstars, and exclusions are accepted. See [Snapcraft filesets](https://snapcraft.io/docs/snapcraft-filesets) to learn more about the format. The defaults can be found in [snap.ts](https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/templates/snap/snapcraft.yaml#L29).

* <code id="SnapOptions-layout">layout</code> Object&lt;String, any&gt; - Specifies any files to make accessible from locations such as `/usr`, `/var`, and `/etc`. See [snap layouts](https://snapcraft.io/docs/snap-layouts) to learn more. Defaults to `undefined`.

Inherited from `CommonLinuxOptions`:

* <code id="SnapOptions-synopsis">synopsis</code> String - The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).
* <code id="SnapOptions-description">description</code> String - As [description](/configuration/configuration#Metadata-description) from application package.json, but allows you to specify different for Linux.
* <code id="SnapOptions-category">category</code> String - The [application category](https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry).
* <code id="SnapOptions-mimeTypes">mimeTypes</code> Array&lt;String&gt; - The mime types in addition to specified in the file associations. Use it if you don't want to register a new mime type, but reuse existing.
* <code id="SnapOptions-desktop">desktop</code> any - The [Desktop file](https://developer.gnome.org/integration-guide/stable/desktop-files.html.en) entries (name to value).

Inherited from `TargetSpecificOptions`:

* <code id="SnapOptions-artifactName">artifactName</code> String - The [artifact file name template](/configuration/configuration#artifact-file-name-template).
* <code id="SnapOptions-publish">publish</code> The [publish](/configuration/publish) options.

<!-- end of generated block -->
