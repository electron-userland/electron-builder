// .pnp.cjs
const path = require("path")

module.exports = {
  // Top-level project locator
  topLevel: { name: "@packageManager/app", reference: "1.0.0" },

  // Return package information for a given locator
  getPackageInformation: (locator) => {
    switch (locator.name) {
      case "@packageManager/app":
        return {
          packageLocation: __dirname,
          packageDependencies: new Map([
            ["debug", "4.3.4"], // production dependency
            ["electron", "23.3.10"], // dev dependency, optional in tests
          ]),
        }
      case "debug":
        return {
          packageLocation: path.join(__dirname, "node_modules/debug"),
          packageDependencies: new Map(), // no nested deps
        }
      case "electron":
        return {
          packageLocation: path.join(__dirname, "node_modules/electron"),
          packageDependencies: new Map(),
        }
      default:
        return { packageLocation: __dirname, packageDependencies: new Map() }
    }
  },

  // Return a locator object for a dependency
  getLocator: (name, reference) => ({ name, reference }),
}
