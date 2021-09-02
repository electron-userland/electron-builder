<h2 id="snapstoreoptions">SnapStoreOptions</h2>
<p><a href="https://snapcraft.io/">Snap Store</a> options.</p>
<ul>
<li><strong><code id="SnapStoreOptions-provider">provider</code></strong> “snapStore” - The provider. Must be <code>snapStore</code>.</li>
<li><strong><code id="SnapStoreOptions-repo">repo</code></strong> String - snapcraft repo name</li>
<li><code id="SnapStoreOptions-channels">channels</code> = <code>[&quot;edge&quot;]</code> String | Array&lt;String&gt; | “undefined” - The list of channels the snap would be released.</li>
</ul>
<p>Inherited from <code>PublishConfiguration</code>:</p>
<ul>
<li>
<p><code id="SnapStoreOptions-publishAutoUpdate">publishAutoUpdate</code> = <code>true</code> Boolean - Whether to publish auto update info files.</p>
<p>Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.</p>
</li>
<li>
<p><code id="SnapStoreOptions-requestHeaders">requestHeaders</code> module:http.OutgoingHttpHeaders - Any custom request headers</p>
</li>
</ul>
