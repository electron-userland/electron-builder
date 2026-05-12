import { Arch, InvalidConfigurationError, log } from "builder-util"
import { outputFile, readFile } from "fs-extra"
import * as yaml from "js-yaml"
import * as path from "path"
import { SnapOptionsCustom } from "../../options/SnapOptions"
import { SnapCore } from "./SnapTarget"
import { SnapcraftYAML } from "./snapcraft"
import { buildSnap, SNAPCRAFT_YAML_OPTIONS } from "./snapcraftBuilder"

/**
 * Pass-through snap builder for custom snapcraft.yaml files.
 *
 * electron-builder reads the file at `yamlPath`, writes it into the stage
 * directory, and invokes snapcraft — no plugs, extensions, organize mappings,
 * or desktop files are injected.
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
    })
  }
}
