!!! note "Node.js 8"
    All examples assumed that you use latest Node.js 8.11.x or higher.

## afterPack

The function (or path to file or module id) to be run after pack (but before pack into distributable format and sign).

```typescript
(context: AfterPackContext): Promise<any> | string | null
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

## afterSign

The function (or path to file or module id) to be run after pack and sign (but before pack into distributable format).

```typescript
(context: AfterPackContext): Promise<any> | string | null
```

Configuration in the same way as `afterPack` (see above).

---

## AfterPackContext

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



