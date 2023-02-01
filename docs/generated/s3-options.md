<ul>
<li>
<p><strong><code id="S3Options-provider">provider</code></strong> “s3” - The provider. Must be <code>s3</code>.</p>
</li>
<li>
<p><strong><code id="S3Options-bucket">bucket</code></strong> String - The bucket name.</p>
</li>
<li>
<p><code id="S3Options-region">region</code> String | “undefined” - The region. Is determined and set automatically when publishing.</p>
</li>
<li>
<p><code id="S3Options-acl">acl</code> = <code>public-read</code> “private” | “public-read” | “undefined” - The ACL. Set to <code>null</code> to not <a href="https://github.com/electron-userland/electron-builder/issues/1822">add</a>.</p>
<p>Please see <a href="https://github.com/electron-userland/electron-builder/issues/1618#issuecomment-314679128">required permissions for the S3 provider</a>.</p>
</li>
<li>
<p><code id="S3Options-storageClass">storageClass</code> = <code>STANDARD</code> “STANDARD” | “REDUCED_REDUNDANCY” | “STANDARD_IA” | “undefined” - The type of storage to use for the object.</p>
</li>
<li>
<p><code id="S3Options-encryption">encryption</code> “AES256” | “aws:kms” | “undefined” - Server-side encryption algorithm to use for the object.</p>
</li>
<li>
<p><code id="S3Options-endpoint">endpoint</code> String | “undefined” - The endpoint URI to send requests to. The default endpoint is built from the configured region. The endpoint should be a string like <code>https://{service}.{region}.amazonaws.com</code>.</p>
</li>
<li>
<p><code id="S3Options-channel">channel</code> = <code>latest</code> String | “undefined” - The update channel.</p>
</li>
<li>
<p><code id="S3Options-path">path</code> = <code>/</code> String | “undefined” - The directory path.</p>
</li>
</ul>
