/**
 * @type { import('typedoc').TypeDocOptions & import('typedoc-plugin-markdown').PluginOptions }
 **/
module.exports = {
  "hostedBaseUrl": "https://www.electron.build",
  "name": "Electron-Builder",
  "entryPoints": [
    "packages/*"
  ],
  "entryPointStrategy": "packages",
  "includeVersion": true,
  "cleanOutputDir": false,
  "flattenOutputFiles": true,
  "plugin": [
    "typedoc-plugin-markdown",
    // "./scripts/renderer/out/src/customRendererPlugin.js",
  ],
  "hideGroupHeadings": true,
  "hidePageTitle": true,
  "hidePageHeader": false,
  "indexFormat": "table",
  "parametersFormat": "table",
  "interfacePropertiesFormat": "table",
  "classPropertiesFormat": "table",
  "enumMembersFormat": "table",
  "typeDeclarationFormat": "table",
  "propertyMembersFormat": "table",
  "tableColumnSettings": {
    "hideDefaults": false,
    "hideInherited": false,
    "hideModifiers": true,
    "hideOverrides": true,
    "hideSources": true,
    "hideValues": false,
    "leftAlignHeaders": false
  },
  "out": "./docs",
  "visibilityFilters": {
    "protected": false,
    "private": false,
    "inherited": false,
    "external": false,
    "@alpha": false,
    "@beta": false
  }
}