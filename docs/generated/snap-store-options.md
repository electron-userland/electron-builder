## SnapStoreOptions
[Snap Store](https://snapcraft.io/) options.

<ul>
<li>**<code id="SnapStoreOptions-provider">provider</code>** "snapStore" - The provider. Must be `snapStore`.</li>
<li>**<code id="SnapStoreOptions-repo">repo</code>** String - snapcraft repo name</li>
<li><code id="SnapStoreOptions-channels">channels</code> = `["edge"]` String | Array&lt;String&gt; | "undefined" - The list of channels the snap would be released.</li>
</ul>

Inherited from `PublishConfiguration`:

<ul>
<li><code id="SnapStoreOptions-publishAutoUpdate">publishAutoUpdate</code> = `true` Boolean - Whether to publish auto update info files.
    
    Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.
</li>
<li><code id="SnapStoreOptions-requestHeaders">requestHeaders</code> module:http.OutgoingHttpHeaders - Any custom request headers</li>
</ul>

