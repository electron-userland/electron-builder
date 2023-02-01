<ul>
<li><strong><code id="BitbucketOptions-provider">provider</code></strong> “bitbucket” - The provider. Must be <code>bitbucket</code>.</li>
<li><strong><code id="BitbucketOptions-owner">owner</code></strong> String - Repository owner</li>
<li><strong><code id="BitbucketOptions-slug">slug</code></strong> String - Repository slug/name</li>
<li><code id="BitbucketOptions-channel">channel</code> = <code>latest</code> String | “undefined” - The channel.</li>
</ul>
<p>Inherited from <code>PublishConfiguration</code>:</p>
<ul>
<li>
<p><code id="BitbucketOptions-publishAutoUpdate">publishAutoUpdate</code> = <code>true</code> Boolean - Whether to publish auto update info files.</p>
<p>Auto update relies only on the first provider in the list (you can specify several publishers). Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.</p>
</li>
<li>
<p><code id="BitbucketOptions-requestHeaders">requestHeaders</code> module:http.OutgoingHttpHeaders - Any custom request headers</p>
</li>
</ul>
