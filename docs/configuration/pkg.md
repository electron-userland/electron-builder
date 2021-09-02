The top-level [pkg](configuration.md#Configuration-pkg) key contains set of options instructing electron-builder on how it should build [PKG](https://goo.gl/yVvgF6) (macOS installer component package).

<!-- do not edit. start of generated block -->
<ul>
<li>
<p><code id="PkgOptions-scripts">scripts</code> = <code>build/pkg-scripts</code> String | “undefined” - The scripts directory, relative to <code>build</code> (build resources directory). The scripts can be in any language so long as the files are marked executable and have the appropriate shebang indicating the path to the interpreter. Scripts are required to be executable (<code>chmod +x file</code>). See: <a href="http://macinstallers.blogspot.de/2012/07/scripting-in-installer-packages.html">Scripting in installer packages</a>.</p>
</li>
<li>
<p><code id="PkgOptions-installLocation">installLocation</code> = <code>/Applications</code> String | “undefined” - The install location. <a href="https://stackoverflow.com/questions/12863944/how-do-you-specify-a-default-install-location-to-home-with-pkgbuild">Do not use it</a> to create per-user package. Mostly never you will need to change this option. <code>/Applications</code> would install it as expected into <code>/Applications</code> if the local system domain is chosen, or into <code>$HOME/Applications</code> if the home installation is chosen.</p>
</li>
<li>
<p><code id="PkgOptions-allowAnywhere">allowAnywhere</code> = <code>true</code> Boolean | “undefined” - Whether can be installed at the root of any volume, including non-system volumes. Otherwise, it cannot be installed at the root of a volume.</p>
<p>Corresponds to <a href="https://developer.apple.com/library/content/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html#//apple_ref/doc/uid/TP40005370-CH100-SW70">enable_anywhere</a>.</p>
</li>
<li>
<p><code id="PkgOptions-allowCurrentUserHome">allowCurrentUserHome</code> = <code>true</code> Boolean | “undefined” - Whether can be installed into the current user’s home directory. A home directory installation is done as the current user (not as root), and it cannot write outside of the home directory. If the product cannot be installed in the user’s home directory and be not completely functional from user’s home directory.</p>
<p>Corresponds to <a href="https://developer.apple.com/library/content/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html#//apple_ref/doc/uid/TP40005370-CH100-SW70">enable_currentUserHome</a>.</p>
</li>
<li>
<p><code id="PkgOptions-allowRootDirectory">allowRootDirectory</code> = <code>true</code> Boolean | “undefined” - Whether can be installed into the root directory. Should usually be <code>true</code> unless the product can be installed only to the user’s home directory.</p>
<p>Corresponds to <a href="https://developer.apple.com/library/content/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html#//apple_ref/doc/uid/TP40005370-CH100-SW70">enable_localSystem</a>.</p>
</li>
<li>
<p><code id="PkgOptions-identity">identity</code> String | “undefined” - The name of certificate to use when signing. Consider using environment variables <a href="/code-signing">CSC_LINK or CSC_NAME</a> instead of specifying this option.</p>
</li>
<li>
<p><code id="PkgOptions-license">license</code> String | “undefined” - The path to EULA license file. Defaults to <code>license.txt</code> or <code>eula.txt</code> (or uppercase variants). In addition to <code>txt, </code>rtf<code>and</code>html<code>supported (don't forget to use</code>target=&quot;_blank&quot;` for links).</p>
</li>
<li>
<p><code id="PkgOptions-background">background</code> <a href="#PkgBackgroundOptions">PkgBackgroundOptions</a> | “undefined” - Options for the background image for the installer.</p>
</li>
<li>
<p><code id="PkgOptions-welcome">welcome</code> String | “undefined” - The path to the welcome file. This may be used to customize the text on the Introduction page of the installer.</p>
</li>
<li>
<p><code id="PkgOptions-mustClose">mustClose</code> Array&lt;String&gt; | “undefined” - Identifies applications that must be closed before the package is installed.\n\nCorresponds to <a href="https://developer.apple.com/library/archive/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html#//apple_ref/doc/uid/TP40005370-CH100-SW77">must-close</a></p>
</li>
<li>
<p><code id="PkgOptions-conclusion">conclusion</code> String | “undefined” - The path to the conclusion file. This may be used to customize the text on the final “Summary” page of the installer.</p>
</li>
<li>
<p><code id="PkgOptions-isRelocatable">isRelocatable</code> = <code>true</code> Boolean | “undefined” - Install bundle over previous version if moved by user?</p>
</li>
<li>
<p><code id="PkgOptions-isVersionChecked">isVersionChecked</code> = <code>true</code> Boolean | “undefined” - Don’t install bundle if newer version on disk?</p>
</li>
<li>
<p><code id="PkgOptions-hasStrictIdentifier">hasStrictIdentifier</code> = <code>true</code> Boolean | “undefined” - Require identical bundle identifiers at install path?</p>
</li>
<li>
<p><code id="PkgOptions-overwriteAction">overwriteAction</code> = <code>upgrade</code> “upgrade” | “update” | “undefined” - Specifies how an existing version of the bundle on disk should be handled when the version in the package is installed.</p>
<p>If you specify upgrade, the bundle in the package atomi-cally replaces any version on disk; this has the effect of deleting old paths that no longer exist in the new version of the bundle.</p>
<p>If you specify update, the bundle in the package overwrites the version on disk, and any files not contained in the package will be left intact; this is appropriate when you are delivering an update-only package.</p>
<p>Another effect of update is that the package bundle will not be installed at all if there is not already a version on disk; this allows a package to deliver an update for an app that the user might have deleted.</p>
</li>
</ul>
<p>Inherited from <code>TargetSpecificOptions</code>:</p>
<ul>
<li><code id="PkgOptions-artifactName">artifactName</code> String | “undefined” - The <a href="/configuration/configuration#artifact-file-name-template">artifact file name template</a>.</li>
<li><code id="PkgOptions-publish">publish</code> The <a href="/configuration/publish">publish</a> options.</li>
</ul>

<!-- end of generated block -->
