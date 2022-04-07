The top-level [linux](configuration.md#Configuration-linux) key contains set of options instructing electron-builder on how it should build Linux targets. These options applicable for any Linux target.

<!-- do not edit. start of generated block -->
<ul>
<li>
<p><code id="LinuxConfiguration-target">target</code> = <code>AppImage</code> String | <a href="/cli#targetconfiguration">TargetConfiguration</a> - Target package type: list of <code>AppImage</code>, <code>snap</code>, <code>deb</code>, <code>rpm</code>, <code>freebsd</code>, <code>pacman</code>, <code>p5p</code>, <code>apk</code>, <code>7z</code>, <code>zip</code>, <code>tar.xz</code>, <code>tar.lz</code>, <code>tar.gz</code>, <code>tar.bz2</code>, <code>dir</code>.</p>
<p>electron-builder <a href="/multi-platform-build#docker">docker image</a> can be used to build Linux targets on any platform.</p>
<p>Please <a href="https://github.com/probonopd/AppImageKit/wiki/Creating-AppImages#common-mistake">do not put an AppImage into another archive</a> like a .zip or .tar.gz.</p>
</li>
<li>
<p><code id="LinuxConfiguration-maintainer">maintainer</code> String | “undefined” - The maintainer. Defaults to <a href="/configuration/configuration#Metadata-author">author</a>.</p>
</li>
<li>
<p><code id="LinuxConfiguration-vendor">vendor</code> String | “undefined” - The vendor. Defaults to <a href="/configuration/configuration#Metadata-author">author</a>.</p>
</li>
<li>
<p><code id="LinuxConfiguration-icon">icon</code> String - The path to icon set directory or one png file, relative to the <a href="/configuration/configuration#MetadataDirectories-buildResources">build resources</a> or to the project directory. The icon filename must contain the size (e.g. 32x32.png) of the icon. By default will be generated automatically based on the macOS icns file.</p>
</li>
<li>
<p><code id="LinuxConfiguration-synopsis">synopsis</code> String | “undefined” - The <a href="https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description">short description</a>.</p>
</li>
<li>
<p><code id="LinuxConfiguration-description">description</code> String | “undefined” - As <a href="/configuration/configuration#Metadata-description">description</a> from application package.json, but allows you to specify different for Linux.</p>
</li>
<li>
<p><code id="LinuxConfiguration-category">category</code> String | “undefined” - The <a href="https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry">application category</a>.</p>
</li>
<li>
<p><code id="LinuxConfiguration-mimeTypes">mimeTypes</code> Array&lt;String&gt; | “undefined” - The mime types in addition to specified in the file associations. Use it if you don’t want to register a new mime type, but reuse existing.</p>
</li>
<li>
<p><code id="LinuxConfiguration-desktop">desktop</code> any | “undefined” - The <a href="https://developer.gnome.org/integration-guide/stable/desktop-files.html.en">Desktop file</a> entries (name to value).</p>
</li>
<li>
<p><code id="LinuxConfiguration-executableArgs">executableArgs</code> Array&lt;String&gt; | “undefined” - The executable parameters. Pass to executableName</p>
</li>
</ul>

<!-- end of generated block -->

---

{!includes/platform-specific-configuration-note.md!}

## Debian Package Options

The top-level [deb](configuration.md#Configuration-deb) key contains set of options instructing electron-builder on how it should build Debian package.

{!generated/DebOptions.md!}

All [LinuxTargetSpecificOptions](linux.md#linuxtargetspecificoptions-apk-freebsd-pacman-p5p-and-rpm-options) can be also specified in the `deb` to customize Debian package. 

## `LinuxTargetSpecificOptions` APK, FreeBSD, Pacman, P5P and RPM Options
<a name="LinuxTargetSpecificOptions"></a>

The top-level `apk`, `freebsd`, `pacman`, `p5p` and `rpm` keys contains set of options instructing electron-builder on how it should build corresponding Linux target.

{!generated/LinuxTargetSpecificOptions.md!}
