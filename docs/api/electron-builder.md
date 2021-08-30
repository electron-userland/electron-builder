Developer API only. See [Configuration](../configuration/configuration.md) for user documentation.
  
<!-- do not edit. start of generated block -->
<a name="module_electron-builder"></a>
# electron-builder

* [electron-builder](#module_electron-builder)
    * [`.Arch`](#Arch) : <code>enum</code>
    * [`.build(rawOptions)`](#module_electron-builder.build) ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
    * [`.createTargets(platforms, type, arch)`](#module_electron-builder.createTargets) ⇒ <code>Map&lt;Platform \| Map&lt;[Arch](#Arch) \| Array&lt;String&gt;&gt;&gt;</code>

<a name="Arch"></a>
## `electron-builder.Arch` : <code>enum</code>
**Kind**: enum of [<code>electron-builder</code>](#module_electron-builder)<br/>
**Properties**
* **<code id="Arch-ia32">ia32</code>** 
* **<code id="Arch-x64">x64</code>** 
* **<code id="Arch-armv7l">armv7l</code>** 
* **<code id="Arch-arm64">arm64</code>** 

<a name="module_electron-builder.build"></a>
## `electron-builder.build(rawOptions)` ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
**Kind**: method of [<code>electron-builder</code>](#module_electron-builder)<br/>

| Param | Type |
| --- | --- |
| rawOptions | <code>[CliOptions](#CliOptions)</code> | 

<a name="module_electron-builder.createTargets"></a>
## `electron-builder.createTargets(platforms, type, arch)` ⇒ <code>Map&lt;Platform \| Map&lt;[Arch](#Arch) \| Array&lt;String&gt;&gt;&gt;</code>
**Kind**: method of [<code>electron-builder</code>](#module_electron-builder)<br/>

| Param | Type |
| --- | --- |
| platforms | <code>Array&lt;Platform&gt;</code> | 
| type | <code>String</code> \| <code>null</code> | 
| arch | <code>String</code> \| <code>null</code> | 


<!-- end of generated block -->
