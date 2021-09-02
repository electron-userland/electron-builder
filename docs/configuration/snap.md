The top-level [snap](configuration.md#Configuration-snap) key contains set of options instructing electron-builder on how it should build [Snap](http://snapcraft.io).

<!-- do not edit. start of generated block -->
<ul>
<li>
<p><code id="SnapOptions-confinement">confinement</code> = <code>strict</code> “devmode” | “strict” | “classic” | “undefined” - The type of <a href="https://snapcraft.io/docs/reference/confinement">confinement</a> supported by the snap.</p>
</li>
<li>
<p><code id="SnapOptions-environment">environment</code> Object&lt;String, any&gt; | “undefined” - The custom environment. Defaults to <code>{&quot;TMPDIR: &quot;$XDG_RUNTIME_DIR&quot;}</code>. If you set custom, it will be merged with default.</p>
</li>
<li>
<p><code id="SnapOptions-summary">summary</code> String | “undefined” - The 78 character long summary. Defaults to <a href="/configuration/configuration#Configuration-productName">productName</a>.</p>
</li>
<li>
<p><code id="SnapOptions-grade">grade</code> = <code>stable</code> “devel” | “stable” | “undefined” - The quality grade of the snap. It can be either <code>devel</code> (i.e. a development version of the snap, so not to be published to the “stable” or “candidate” channels) or “stable” (i.e. a stable release or release candidate, which can be released to all channels).</p>
</li>
<li>
<p><code id="SnapOptions-assumes">assumes</code> Array&lt;String&gt; | String | “undefined” - The list of features that must be supported by the core in order for this snap to install.</p>
</li>
<li>
<p><code id="SnapOptions-buildPackages">buildPackages</code> Array&lt;String&gt; | “undefined” - The list of debian packages needs to be installed for building this snap.</p>
</li>
<li>
<p><code id="SnapOptions-stagePackages">stagePackages</code> Array&lt;String&gt; | “undefined” - The list of Ubuntu packages to use that are needed to support the <code>app</code> part creation. Like <code>depends</code> for <code>deb</code>. Defaults to <code>[&quot;libnspr4&quot;, &quot;libnss3&quot;, &quot;libxss1&quot;, &quot;libappindicator3-1&quot;, &quot;libsecret-1-0&quot;]</code>.</p>
<p>If list contains <code>default</code>, it will be replaced to default list, so, <code>[&quot;default&quot;, &quot;foo&quot;]</code> can be used to add custom package <code>foo</code> in addition to defaults.</p>
</li>
<li>
<p><code id="SnapOptions-hooks">hooks</code> = <code>build/snap-hooks</code> String | “undefined” - The <a href="https://docs.snapcraft.io/build-snaps/hooks">hooks</a> directory, relative to <code>build</code> (build resources directory).</p>
</li>
<li>
<p><code id="SnapOptions-plugs">plugs</code> Array&lt;String | SnapOptions.PlugDescriptor&gt; - The list of <a href="https://snapcraft.io/docs/reference/interfaces">plugs</a>. Defaults to <code>[&quot;desktop&quot;, &quot;desktop-legacy&quot;, &quot;home&quot;, &quot;x11&quot;, &quot;unity7&quot;, &quot;browser-support&quot;, &quot;network&quot;, &quot;gsettings&quot;, &quot;audio-playback&quot;, &quot;pulseaudio&quot;, &quot;opengl&quot;]</code>.</p>
<p>If list contains <code>default</code>, it will be replaced to default list, so, <code>[&quot;default&quot;, &quot;foo&quot;]</code> can be used to add custom plug <code>foo</code> in addition to defaults.</p>
<p>Additional attributes can be specified using object instead of just name of plug: <code>[  {    &quot;browser-sandbox&quot;: {      &quot;interface&quot;: &quot;browser-support&quot;,      &quot;allow-sandbox&quot;: true    },  },  &quot;another-simple-plug-name&quot; ]</code></p>
</li>
<li>
<p><code id="SnapOptions-slots">slots</code> Array&lt;String | module:app-builder-lib/out/options/SnapOptions.SlotDescriptor&gt; | module:app-builder-lib/out/options/SnapOptions.PlugDescriptor | “undefined” - The list of <a href="https://snapcraft.io/docs/reference/interfaces">slots</a>.</p>
<p>Additional attributes can be specified using object instead of just name of slot: ``` [  {    “mpris”: {      “name”: “chromium”    },  } ]</p>
<p>In case you want your application to be a compliant MPris player, you will need to definie The mpris slot with “chromium” name. This electron has it <a href="https://source.chromium.org/chromium/chromium/src/+/master:components/system_media_controls/linux/system_media_controls_linux.cc;l=51;bpv=0;bpt=1">hardcoded</a>, and we need to pass this name so snap <a href="https://forum.snapcraft.io/t/unable-to-use-mpris-interface/15360/7">will allow it</a> in strict confinement.</p>
</li>
<li>
<p><code id="SnapOptions-after">after</code> Array&lt;String&gt; | “undefined” - Specifies any <a href="https://snapcraft.io/docs/reference/parts">parts</a> that should be built before this part. Defaults to <code>[&quot;desktop-gtk2&quot;&quot;]</code>.</p>
<p>If list contains <code>default</code>, it will be replaced to default list, so, <code>[&quot;default&quot;, &quot;foo&quot;]</code> can be used to add custom parts <code>foo</code> in addition to defaults.</p>
</li>
<li>
<p><code id="SnapOptions-useTemplateApp">useTemplateApp</code> Boolean - Whether to use template snap. Defaults to <code>true</code> if <code>stagePackages</code> not specified.</p>
</li>
<li>
<p><code id="SnapOptions-autoStart">autoStart</code> = <code>false</code> Boolean - Whether or not the snap should automatically start on login.</p>
</li>
<li>
<p><code id="SnapOptions-layout">layout</code> Object&lt;String, any&gt; | “undefined” - Specifies any files to make accessible from locations such as <code>/usr</code>, <code>/var</code>, and <code>/etc</code>. See <a href="https://snapcraft.io/docs/snap-layouts">snap layouts</a> to learn more.</p>
</li>
<li>
<p><code id="SnapOptions-appPartStage">appPartStage</code> Array&lt;String&gt; | “undefined” - Specifies which files from the app part to stage and which to exclude. Individual files, directories, wildcards, globstars, and exclusions are accepted. See <a href="https://snapcraft.io/docs/snapcraft-filesets">Snapcraft filesets</a> to learn more about the format.</p>
<p>The defaults can be found in <a href="https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/templates/snap/snapcraft.yaml#L29">snap.ts</a>.</p>
</li>
<li>
<p><code id="SnapOptions-title">title</code> String | “undefined” - An optional title for the snap, may contain uppercase letters and spaces. Defaults to <code>productName</code>. See <a href="https://snapcraft.io/docs/snap-format">snap format documentation</a>.</p>
</li>
</ul>
<p>Inherited from <code>CommonLinuxOptions</code>:</p>
<ul>
<li><code id="SnapOptions-synopsis">synopsis</code> String | “undefined” - The <a href="https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description">short description</a>.</li>
<li><code id="SnapOptions-description">description</code> String | “undefined” - As <a href="/configuration/configuration#Metadata-description">description</a> from application package.json, but allows you to specify different for Linux.</li>
<li><code id="SnapOptions-category">category</code> String | “undefined” - The <a href="https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry">application category</a>.</li>
<li><code id="SnapOptions-mimeTypes">mimeTypes</code> Array&lt;String&gt; | “undefined” - The mime types in addition to specified in the file associations. Use it if you don’t want to register a new mime type, but reuse existing.</li>
<li><code id="SnapOptions-desktop">desktop</code> any | “undefined” - The <a href="https://developer.gnome.org/integration-guide/stable/desktop-files.html.en">Desktop file</a> entries (name to value).</li>
<li><code id="SnapOptions-executableArgs">executableArgs</code> Array&lt;String&gt; | “undefined” - The executable parameters. Pass to executableName</li>
</ul>
<p>Inherited from <code>TargetSpecificOptions</code>:</p>
<ul>
<li><code id="SnapOptions-artifactName">artifactName</code> String | “undefined” - The <a href="/configuration/configuration#artifact-file-name-template">artifact file name template</a>.</li>
<li><code id="SnapOptions-publish">publish</code> The <a href="/configuration/publish">publish</a> options.</li>
</ul>

<!-- end of generated block -->
