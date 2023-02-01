## Hooks

!!! note "Node.js 8"
    All examples assumed that you use latest Node.js 8.11.x or higher.

### beforePack

The function (or path to file or module id) to be run before pack.

```typescript
(context: BeforePackContext): Promise<any> | any
```

!!! example "As function"

    ```js
    beforePack: async (context) => {
      // your code
    }
    ```

Because in a configuration file you cannot use JavaScript, can be specified as a path to file or module id. Function must be exported as default export.

```json
"build": {
  "beforePack": "./myBeforePackHook.js"
}
```


File `myBeforePackHook.js` in the project root directory:

!!! example "myBeforePackHook.js"
    ```js
    exports.default = async function(context) {
      // your custom code
    }
    ```


### afterPack

The function (or path to file or module id) to be run after pack (but before pack into distributable format and sign).

```typescript
(context: AfterPackContext): Promise<any> | any
```

!!! example "As function"

    ```js
    afterPack: async (context) => {
      // your code
    }
    ```

Because in a configuration file you cannot use JavaScript, can be specified as a path to file or module id. Function must be exported as default export.

```json
"build": {
  "afterPack": "./myAfterPackHook.js"
}
```


File `myAfterPackHook.js` in the project root directory:

!!! example "myAfterPackHook.js"
    ```js
    exports.default = async function(context) {
      // your custom code
    }
    ```

### afterSign

The function (or path to file or module id) to be run after pack and sign (but before pack into distributable format).

```typescript
(context: AfterPackContext): Promise<any> | any
```

Configuration in the same way as `afterPack` (see above).

### afterAllArtifactBuild

The function (or path to file or module id) to be run after all artifacts are built.

```typescript
(buildResult: BuildResult): Promise<Array<string>> | Array<string>
```

Configuration in the same way as `afterPack` (see above).

!!! example "myAfterAllArtifactBuild.js"
    ```js
    exports.default = function () {
      // you can return additional files to publish
      return ["/path/to/additional/result/file"]
    }
    ```

### onNodeModuleFile

The function (or path to file or module id) to be run on each node module file.

```typescript
(file: string) => void
```

Configuration in the same way as `afterPack` (see above).

---

### AfterPackContext

```typescript
interface AfterPackContext {
  outDir: string
  appOutDir: string
  packager: PlatformPackager<any>
  electronPlatformName: string
  arch: Arch
  targets: Array<Target>
}
```

### BuildResult

```typescript
interface BuildResult {
  outDir: string
  artifactPaths: Array<string>
  platformToTargets: Map<Platform, Map<string, Target>>
  configuration: Configuration
}
```



