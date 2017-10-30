The top-level [pkg](configuration.md#Configuration-pkg) key contains set of options instructing electron-builder on how it should build [PKG](https://goo.gl/yVvgF6) (macOS installer component package).

<!-- do not edit. start of generated block -->
* <code id="PkgOptions-scripts">scripts</code> = `build/pkg-scripts` String - The scripts directory, relative to `build` (build resources directory). The scripts can be in any language so long as the files are marked executable and have the appropriate shebang indicating the path to the interpreter. Scripts are required to be executable (`chmod +x file`). See: [Scripting in installer packages](http://macinstallers.blogspot.de/2012/07/scripting-in-installer-packages.html).
* <code id="PkgOptions-installLocation">installLocation</code> = `/Applications` String - The install location. [Do not use it](https://stackoverflow.com/questions/12863944/how-do-you-specify-a-default-install-location-to-home-with-pkgbuild) to create per-user package. Mostly never you will need to change this option. `/Applications` would install it as expected into `/Applications` if the local system domain is chosen, or into `$HOME/Applications` if the home installation is chosen.
* <code id="PkgOptions-allowAnywhere">allowAnywhere</code> = `true` Boolean - Whether can be installed at the root of any volume, including non-system volumes. Otherwise, it cannot be installed at the root of a volume.
  
  Corresponds to [enable_anywhere](https://developer.apple.com/library/content/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html#//apple_ref/doc/uid/TP40005370-CH100-SW70).
* <code id="PkgOptions-allowCurrentUserHome">allowCurrentUserHome</code> = `true` Boolean - Whether can be installed into the current user’s home directory. A home directory installation is done as the current user (not as root), and it cannot write outside of the home directory. If the product cannot be installed in the user’s home directory and be not completely functional from user’s home directory.
  
  Corresponds to [enable_currentUserHome](https://developer.apple.com/library/content/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html#//apple_ref/doc/uid/TP40005370-CH100-SW70).
* <code id="PkgOptions-allowRootDirectory">allowRootDirectory</code> = `true` Boolean - Whether can be installed into the root directory. Should usually be `true` unless the product can be installed only to the user’s home directory.
  
  Corresponds to [enable_localSystem](https://developer.apple.com/library/content/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html#//apple_ref/doc/uid/TP40005370-CH100-SW70).
* <code id="PkgOptions-identity">identity</code> String - The name of certificate to use when signing. Consider using environment variables [CSC_LINK or CSC_NAME](../code-signing.md) instead of specifying this option.
* <code id="PkgOptions-license">license</code> String - The path to EULA license file. Defaults to `license.txt` or `eula.txt` (or uppercase variants). In addition to `txt, `rtf` and `html` supported (don't forget to use `target="_blank"` for links).

Inherited from `TargetSpecificOptions`:
* <code id="PkgOptions-artifactName">artifactName</code> String - The [artifact file name template](/configuration/configuration.md#artifact-file-name-template).
* <code id="PkgOptions-publish">publish</code> The [publish](/configuration/publish.md) options.
<!-- end of generated block -->