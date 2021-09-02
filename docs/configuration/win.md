The top-level [win](configuration.md#Configuration-win) key contains set of options instructing electron-builder on how it should build Windows targets. These options applicable for any Windows target.

<!-- do not edit. start of generated block -->
<ul>
<li>
<p><code id="WindowsConfiguration-target">target</code> = <code>nsis</code> String | <a href="/cli#targetconfiguration">TargetConfiguration</a> - The target package type: list of <code>nsis</code>, <code>nsis-web</code> (Web installer), <code>portable</code> (<a href="/configuration/nsis#portable">portable</a> app without installation), <code>appx</code>, <code>msi</code>, <code>squirrel</code>, <code>7z</code>, <code>zip</code>, <code>tar.xz</code>, <code>tar.lz</code>, <code>tar.gz</code>, <code>tar.bz2</code>, <code>dir</code>. AppX package can be built only on Windows 10.</p>
<p>To use Squirrel.Windows please install <code>electron-builder-squirrel-windows</code> dependency.</p>
</li>
<li>
<p><code id="WindowsConfiguration-icon">icon</code> = <code>build/icon.ico</code> String | “undefined” - The path to application icon.</p>
</li>
<li>
<p><code id="WindowsConfiguration-legalTrademarks">legalTrademarks</code> String | “undefined” - The trademarks and registered trademarks.</p>
</li>
</ul>
<hr>
<ul>
<li><code id="WindowsConfiguration-signingHashAlgorithms">signingHashAlgorithms</code> = <code>['sha1', 'sha256']</code> Array&lt;“sha1” | “sha256”&gt; | “undefined” - Array of signing algorithms used. For AppX <code>sha256</code> is always used.</li>
<li><code id="WindowsConfiguration-sign">sign</code> String | (configuration: CustomWindowsSignTaskConfiguration) =&gt; Promise - The custom function (or path to file or module id) to sign Windows executable.</li>
<li><code id="WindowsConfiguration-certificateFile">certificateFile</code> String | “undefined” - The path to the *.pfx certificate you want to sign with. Please use it only if you cannot use env variable <code>CSC_LINK</code> (<code>WIN_CSC_LINK</code>) for some reason. Please see <a href="/code-signing">Code Signing</a>.</li>
<li><code id="WindowsConfiguration-certificatePassword">certificatePassword</code> String | “undefined” - The password to the certificate provided in <code>certificateFile</code>. Please use it only if you cannot use env variable <code>CSC_KEY_PASSWORD</code> (<code>WIN_CSC_KEY_PASSWORD</code>) for some reason. Please see <a href="/code-signing">Code Signing</a>.</li>
<li><code id="WindowsConfiguration-certificateSubjectName">certificateSubjectName</code> String | “undefined” - The name of the subject of the signing certificate. Required only for EV Code Signing and works only on Windows (or on macOS if <a href="https://www.parallels.com/products/desktop/">Parallels Desktop</a> Windows 10 virtual machines exits).</li>
<li><code id="WindowsConfiguration-certificateSha1">certificateSha1</code> String | “undefined” - The SHA1 hash of the signing certificate. The SHA1 hash is commonly specified when multiple certificates satisfy the criteria specified by the remaining switches. Works only on Windows (or on macOS if <a href="https://www.parallels.com/products/desktop/">Parallels Desktop</a> Windows 10 virtual machines exits).</li>
<li><code id="WindowsConfiguration-additionalCertificateFile">additionalCertificateFile</code> String | “undefined” - The path to an additional certificate file you want to add to the signature block.</li>
<li><code id="WindowsConfiguration-rfc3161TimeStampServer">rfc3161TimeStampServer</code> = <code>http://timestamp.digicert.com</code> String | “undefined” - The URL of the RFC 3161 time stamp server.</li>
<li><code id="WindowsConfiguration-timeStampServer">timeStampServer</code> = <code>http://timestamp.digicert.com</code> String | “undefined” - The URL of the time stamp server.</li>
</ul>
<hr>
<ul>
<li><code id="WindowsConfiguration-publisherName">publisherName</code> String | Array&lt;String&gt; | “undefined” - <a href="https://github.com/electron-userland/electron-builder/issues/1187#issuecomment-278972073">The publisher name</a>, exactly as in your code signed certificate. Several names can be provided. Defaults to common name from your code signing certificate.</li>
<li><code id="WindowsConfiguration-verifyUpdateCodeSignature">verifyUpdateCodeSignature</code> = <code>true</code> Boolean - Whether to verify the signature of an available update before installation. The <a href="#publisherName">publisher name</a> will be used for the signature verification.</li>
<li><code id="WindowsConfiguration-requestedExecutionLevel">requestedExecutionLevel</code> = <code>asInvoker</code> “asInvoker” | “highestAvailable” | “requireAdministrator” | “undefined” - The <a href="https://msdn.microsoft.com/en-us/library/6ad1fshk.aspx#Anchor_9">security level</a> at which the application requests to be executed. Cannot be specified per target, allowed only in the <code>win</code>.</li>
<li><code id="WindowsConfiguration-signAndEditExecutable">signAndEditExecutable</code> = <code>true</code> Boolean - Whether to sign and add metadata to executable. Advanced option.</li>
<li><code id="WindowsConfiguration-signDlls">signDlls</code> = <code>false</code> Boolean - Whether to sign DLL files. Advanced option. See: <a href="https://github.com/electron-userland/electron-builder/issues/3101#issuecomment-404212384">https://github.com/electron-userland/electron-builder/issues/3101#issuecomment-404212384</a></li>
</ul>

<!-- end of generated block -->

---

{!includes/platform-specific-configuration-note.md!}

## Common Questions
#### How do delegate code signing?

Use [sign](#WindowsConfiguration-sign) option. Please also see [why sign.js is called 8 times](https://github.com/electron-userland/electron-builder/issues/3995).

```json
"win": {
  "sign": "./customSign.js"
}
```

File `customSign.js` in the project root directory:
```js
exports.default = async function(configuration) {
  // your custom code
}
```

#### How do create Parallels Windows 10 Virtual Machine?

!!! warning "Disable "Share Mac user folders with Windows""
    If you use Parallels, you [must not use](https://github.com/electron-userland/electron-builder/issues/865#issuecomment-258105498) "Share Mac user folders with Windows" feature and must not run installers from such folders.

You don't need to have Windows 10 license. Free is provided (expire after 90 days, but it is not a problem because no additional setup is required).

1. Open Parallels Desktop.
2. File -> New.
3. Select "Modern.IE" in the "Free Systems".
4. Continue, Continue, Accept software license agreement.
5. Select "Microsoft Edge on Windows 10".
6. The next steps are general, see [Installing Windows on your Mac using Parallels Desktop](http://kb.parallels.com/4729) from "Step 6: Specify a name and location".

Parallels Windows 10 VM will be used automatically to build AppX on macOS. No need even start VM — it will be started automatically on demand and suspended after build. No need to specify VM — it will be detected automatically (first Windows 10 VM will be used).

#### How do create VirtualBox Windows 10 Virtual Machine?

If you are not on macOS or don't want to buy [Parallels Desktop](https://www.parallels.com/products/desktop/), you can use free [VirtualBox](https://www.virtualbox.org/wiki/Downloads).

1. Open [Download virtual machines](https://developer.microsoft.com/en-us/microsoft-edge/tools/vms/).
2. Select "MSEdge on Win10 (x64) Stable".
3. Select "VirtualBox" platform.
4. Download. See [installation instructions](https://az792536.vo.msecnd.net/vms/release_notes_license_terms_8_1_15.pdf).

The password to your VM is `Passw0rd!`.

VirtualBox is not supported by electron-builder for now, so, you need to setup build environment on Windows if you want to use VirtualBox to build AppX (and other Windows-only tasks).
