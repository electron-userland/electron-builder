import { Arch, InvalidConfigurationError, log } from "builder-util"

import * as yaml from "js-yaml"
import * as path from "path"
import { SnapOptionsCustom } from "../../options/SnapOptions.js"
import { SnapCore } from "./SnapTarget.js"
import { SnapcraftYAML } from "./snapcraft.js"
import { buildSnap, SNAPCRAFT_YAML_OPTIONS } from "./snapcraftBuilder.js"
import _fsExtra from "fs-extra"
const { outputFile, readFile } = _fsExtra

/**
 * Pass-through snap builder for `base: "custom"`.
 *
 * electron-builder reads the file at `snapcraft.custom.yaml` (or the inline object),
 * writes it into the stage directory, and invokes snapcraft. **Nothing is injected or
 * modified in any way** — no plugs, extensions, organize mappings, desktop files,
 * environment variables, layout entries, or stage packages. `linux.*` configuration
 * is also not cascaded into the descriptor.
 *
 * Because electron-builder exerts no control over the descriptor's content, GitHub
 * issue support for snap runtime problems encountered with custom yaml files is limited.
 * Prefer a structured base (`core24`, `core22`, etc.) for a fully managed build.
 */
export class SnapCoreCustom extends SnapCore<SnapOptionsCustom> {
  readonly defaultPlugs: string[] = []

  async createDescriptor(_arch: Arch): Promise<SnapcraftYAML> {
    const { yaml: yamlPath } = this.options
    if (!yamlPath) {
      throw new InvalidConfigurationError(
        'snapcraft.base = "custom" requires an entry in snapcraft.custom.yaml (either a path to a snapcraft.yaml file or a SnapcraftYAML object directly in the configuration)'
      )
    }
    if (typeof yamlPath !== "string") {
      return yamlPath // fully defined SnapcraftYAML object provided directly in configuration, no file reading necessary
    }
    const resolved = path.resolve(this.packager.buildResourcesDir, yamlPath)
    const buildResourcesDir = this.packager.buildResourcesDir
    if (!resolved.startsWith(buildResourcesDir + path.sep) && resolved !== buildResourcesDir) {
      throw new InvalidConfigurationError(`snapcraft.custom.yaml must resolve within the build resources directory (got "${resolved}")`)
    }
    const raw = await readFile(resolved, "utf8")
    return yaml.load(raw) as SnapcraftYAML
  }

  async buildSnap(params: { snap: SnapcraftYAML; appOutDir: string; stageDir: string; snapArch: Arch; artifactPath: string }): Promise<void> {
    const { snap, stageDir, artifactPath } = params

    const snapDirResolved = path.resolve(stageDir, "snap")
    const snapcraftYamlPath = path.join(snapDirResolved, "snapcraft.yaml")

    const yamlContent = yaml.dump(snap, SNAPCRAFT_YAML_OPTIONS)
    await outputFile(snapcraftYamlPath, yamlContent, "utf8")
    log.debug(snap, "using custom snapcraft.yaml (pass-through, no injection)")

    if (this.packager.packagerOptions.effectiveOptionComputed != null && (await this.packager.packagerOptions.effectiveOptionComputed({ snap }))) {
      return
    }

    await buildSnap({
      snapcraftConfig: snap,
      artifactPath,
      stageDir,
      packager: this.packager,
    })
  }
}
