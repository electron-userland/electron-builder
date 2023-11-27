The top-level [pkg](configuration.md#Configuration-pkg) key contains set of options instructing electron-builder on how it should build [PKG](https://goo.gl/yVvgF6) (macOS installer component package).

<!-- do not edit. start of generated block -->
* <code id="PkgOptions-scripts">scripts</code> = `build/pkg-scripts` String | "undefined" - The scripts directory, relative to `build` (build resources directory). The scripts can be in any language so long as the files are marked executable and have the appropriate shebang indicating the path to the interpreter. Scripts are required to be executable (`chmod +x file`). See: [Scripting in installer packages](http://macinstallers.blogspot.de/2012/07/scripting-in-installer-packages.html).
* <code id="PkgOptions-installLocation">installLocation</code> = `/Applications` String | "undefined" - The install location. [Do not use it](https://stackoverflow.com/questions/12863944/how-do-you-specify-a-default-install-location-to-home-with-pkgbuild) to create per-user package. Mostly never you will need to change this option. `/Applications` would install it as expected into `/Applications` if the local system domain is chosen, or into `$HOME/Applications` if the home installation is chosen.
* <code id="PkgOptions-allowAnywhere">allowAnywhere</code> = `true` Boolean | "undefined" - Whether can be installed at the root of any volume, including non-system volumes. Otherwise, it cannot be installed at the root of a volume.
    
    Corresponds to [enable_anywhere](https://developer.apple.com/library/content/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html#//apple_ref/doc/uid/TP40005370-CH100-SW70).

* <code id="PkgOptions-allowCurrentUserHome">allowCurrentUserHome</code> = `true` Boolean | "undefined" - Whether can be installed into the current user’s home directory. A home directory installation is done as the current user (not as root), and it cannot write outside of the home directory. If the product cannot be installed in the user’s home directory and be not completely functional from user’s home directory.
    
    Corresponds to [enable_currentUserHome](https://developer.apple.com/library/content/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html#//apple_ref/doc/uid/TP40005370-CH100-SW70).

* <code id="PkgOptions-allowRootDirectory">allowRootDirectory</code> = `true` Boolean | "undefined" - Whether can be installed into the root directory. Should usually be `true` unless the product can be installed only to the user’s home directory.
    
    Corresponds to [enable_localSystem](https://developer.apple.com/library/content/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html#//apple_ref/doc/uid/TP40005370-CH100-SW70).

* <code id="PkgOptions-identity">identity</code> String | "undefined" - The name of certificate to use when signing. Consider using environment variables [CSC_LINK or CSC_NAME](/code-signing) instead of specifying this option.
* <code id="PkgOptions-license">license</code> String | "undefined" - The path to EULA license file. Defaults to `license.txt` or `eula.txt` (or uppercase variants). In addition to `txt`, `rtf` and `html` supported (don't forget to use `target="_blank"` for links).
* <code id="PkgOptions-background">background</code> [PkgBackgroundOptions](#PkgBackgroundOptions) | "undefined" - Options for the background image for the installer.
* <code id="PkgOptions-welcome">welcome</code> String | "undefined" - The path to the welcome file. This may be used to customize the text on the Introduction page of the installer.
* <code id="PkgOptions-mustClose">mustClose</code> Array&lt;String&gt; | "undefined" - Identifies applications that must be closed before the package is installed.
    
    Corresponds to [must-close](https://developer.apple.com/library/archive/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html#//apple_ref/doc/uid/TP40005370-CH100-SW77).

* <code id="PkgOptions-conclusion">conclusion</code> String | "undefined" - The path to the conclusion file. This may be used to customize the text on the final "Summary" page of the installer.
* <code id="PkgOptions-isRelocatable">isRelocatable</code> = `true` Boolean | "undefined" - Install bundle over previous version if moved by user?
* <code id="PkgOptions-isVersionChecked">isVersionChecked</code> = `true` Boolean | "undefined" - Don't install bundle if newer version on disk?
* <code id="PkgOptions-hasStrictIdentifier">hasStrictIdentifier</code> = `true` Boolean | "undefined" - Require identical bundle identifiers at install path?
* <code id="PkgOptions-overwriteAction">overwriteAction</code> = `upgrade` "upgrade" | "update" | "undefined" - Specifies how an existing version of the bundle on disk should be handled when the version in the package is installed.
    
    If you specify upgrade, the bundle in the package atomi-cally replaces any version on disk; this has the effect of deleting old paths that no longer exist in the new version of the bundle.
    
    If you specify update, the bundle in the package overwrites the version on disk, and any files not contained in the package will be left intact; this is appropriate when you are delivering an update-only package.
    
    Another effect of update is that the package bundle will not be installed at all if there is not already a version on disk; this allows a package to deliver an update for an app that the user might have deleted.


Inherited from `TargetSpecificOptions`:

* <code id="PkgOptions-artifactName">artifactName</code> String | "undefined" - The [artifact file name template](/configuration/configuration#artifact-file-name-template).
* <code id="PkgOptions-publish">publish</code> The [publish](/configuration/publish) options.

<!-- end of generated block -->
