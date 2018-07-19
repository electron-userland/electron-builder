const path = require("path")
const version = require(path.join(__dirname, "../packages/app-builder-lib/package.json")).version

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = function versionTransform() {
  return {
    visitor: {
      Identifier(path) {
        if (path.node.name === 'PACKAGE_VERSION') {
          path.replaceWithSourceString('"' + version + '"');
        }
      },
    },
  };
};

