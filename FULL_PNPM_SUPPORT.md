# Full pnpm Support for electron-builder

## Problem

pnpm uses strict module resolution where packages can only require their direct dependencies. electron-builder had several `require()` and `require.resolve()` calls that assumed npm-style hoisting, causing failures like:

```
Cannot find module 'electron-webpack/dev-runner'
```

## Solution Overview

1. Created a helper function `resolveFromProject()` for resolving modules from the user's project context
2. Updated config loading to use the new helper
3. Deprecated the legacy `start` command (uses unmaintained electron-webpack)
4. Added pnpm workspace test fixtures

## Files Changed

### New Files
- `packages/app-builder-lib/src/util/projectModuleResolver.ts` - Module resolution helper

### Modified Files
- `packages/app-builder-lib/src/util/config/config.ts` - Fixed electron-webpack resolution
- `packages/app-builder-lib/src/util/config/load.ts` - Fixed parent config resolution
- `packages/app-builder-lib/src/util/resolve.ts` - Added projectDir param to resolveFunction
- `packages/app-builder-lib/src/electron/electronVersion.ts` - Fixed electron version detection for pnpm
- `packages/app-builder-lib/src/targets/archive.ts` - Fixed tar types (pre-existing issue)
- `packages/electron-builder/src/cli/start.ts` - Deprecated with helpful message
- `packages/electron-builder/src/cli/cli.ts` - Updated help text

### Test Files
- `test/fixtures/test-app-pnpm-workspace/` - New pnpm workspace fixture
- `test/src/packageManagerTest.ts` - Added pnpm workspace tests

## How the Fix Works

The core fix is the `resolveFromProject()` function which uses Node.js's `require.resolve()` with the `{ paths: [...] }` option. This tells Node where to look for modules:

```typescript
export function resolveFromProject(options: {
  projectDir: string
  moduleSpecifier: string
  optional?: boolean
}): string | null {
  // Build paths array from project directory up
  const searchPaths: string[] = []
  let currentDir = projectDir
  while (currentDir !== root) {
    if (fs.existsSync(path.join(currentDir, "node_modules"))) {
      searchPaths.push(currentDir)
    }
    currentDir = path.dirname(currentDir)
  }

  return require.resolve(moduleSpecifier, { paths: searchPaths })
}
```

This works identically for npm/yarn (hoisted) and pnpm (strict) because we're explicitly telling Node where to look.

## Testing

To test manually with your pnpm project:

1. Link the local electron-builder to your project
2. Run `pnpm electron-builder build`

The existing tests can be run with:
```bash
pnpm test-linux  # or
pnpm ci:test -- --grep "pnpm"
```

## Backward Compatibility

- npm/yarn: No change in behavior (same resolution mechanism)
- electron-webpack users: Deprecation warning but still works if installed
- All changes include fallbacks to original behavior

## Future Improvements

1. Consider adding a pnpm-specific configuration option for advanced use cases
2. Add more comprehensive error messages when modules can't be resolved
3. Consider removing electron-webpack support entirely in next major version
