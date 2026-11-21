import { InvalidConfigurationError, isPathWithin, log, statOrNull } from "builder-util"
import * as path from "path"
import { AsarStableLayoutOptions } from "../options/PlatformSpecificBuildOptions.js"
import { AsarContentUnit, alignUp, readAsarContentUnits, relayoutAsarContent } from "./asarAlign.js"

export interface StableLayoutParams {
  /** every placed file starts at a multiple of this many bytes (1 = no alignment) */
  alignment: number
  /** fraction of its size reserved after a file that is placed afresh (so it can grow later without moving) */
  growthMargin: number
  /** lay everything out afresh when the unused space of the previous layout (`freedBytes` + `slackBytes`) exceeds this fraction of the packed bytes */
  maxFreeRatio: number
}

/**
 * Above this share of unused space (slots of removed files and of files that outgrew them, plus slack left by files
 * that shrank) the layout is compacted: one update then pays for the whole header, every later one is local again.
 */
export const STABLE_LAYOUT_MAX_FREE_RATIO = 0.1

export interface StableLayoutPlan {
  /** new offset of every unit, in the order of the `units` passed in */
  offsets: Array<number>
  /** units left at their previous offset */
  kept: number
  /** units placed into the slot of a removed or moved file */
  filled: number
  /** units appended after the previous content */
  appended: number
  /** true if the previous layout was dropped because too much of it was unused */
  compacted: boolean
  /**
   * bytes of the previous layout before the last kept file that no current file occupies: unclaimed slots and any gap
   * before the first file (before any of them is filled). Space after the last kept file is the open tail, not waste
   */
  freedBytes: number
  /**
   * bytes inside kept slots, other than the last, beyond what their file now needs (its aligned size plus growth
   * margin): what files that shrank leave behind. Slack in the last kept slot becomes part of the open tail
   */
  slackBytes: number
}

/** Validates `asar.stableLayout` before anything is packed. */
export function validateStableLayoutOptions(options: unknown): asserts options is AsarStableLayoutOptions {
  if (typeof options !== "object" || options == null) {
    throw new InvalidConfigurationError(`asar.stableLayout must be an object with a "previous" path, got ${String(options)}`)
  }
  const { previous, growthMargin } = options as Record<string, unknown>
  if (typeof previous !== "string" || previous.trim().length === 0) {
    throw new InvalidConfigurationError(`asar.stableLayout.previous must be the path to the previous release's app.asar, got ${JSON.stringify(previous)}`)
  }
  if (growthMargin != null && (typeof growthMargin !== "number" || !Number.isFinite(growthMargin) || growthMargin < 0 || growthMargin > 1)) {
    throw new InvalidConfigurationError(`asar.stableLayout.growthMargin must be a number between 0 and 1, got ${JSON.stringify(growthMargin)}`)
  }
}

/**
 * Resolves `asar.stableLayout.previous` (already macro-expanded) against `projectDir`. A path inside one of
 * `outputDirs` is rejected: the build overwrites it before it is read, so the archive would be laid out against itself.
 * @internal
 */
export function resolveStableLayoutPrevious(previous: string, projectDir: string, outputDirs: Array<string>): string {
  const resolved = path.resolve(projectDir, previous)
  for (const dir of outputDirs) {
    if (isPathWithin(path.resolve(projectDir, dir), resolved)) {
      throw new InvalidConfigurationError(
        `asar.stableLayout.previous (${resolved}) is inside the build output (${dir}), which this build overwrites before it is read. ` +
          "Keep a copy of the previous release's app.asar outside the output directory, e.g. in a CI cache directory"
      )
    }
  }
  return resolved
}

/**
 * Applies `asar.stableLayout` to the `app.asar` just packed, against the archive at `previous` (an absolute path, see
 * `resolveStableLayoutPrevious`). A missing file starts a new layout (with a warning) instead of failing the build.
 * @internal
 */
export async function applyStableLayoutOption(
  asarFile: string,
  previous: string,
  options: AsarStableLayoutOptions,
  contentAlignment: number | null | undefined
): Promise<StableLayoutPlan> {
  validateStableLayoutOptions(options)
  const previousExists = (await statOrNull(previous))?.isFile() === true
  if (!previousExists) {
    log.warn(
      { previous: log.filePath(previous) },
      "asar.stableLayout: previous app.asar not found, laying app.asar out afresh (expected for the first release with a stable layout)"
    )
  }
  return await applyStableAsarLayout(asarFile, previousExists ? previous : null, {
    alignment: contentAlignment == null || contentAlignment === 0 ? 1 : contentAlignment,
    growthMargin: options.growthMargin ?? 0,
    maxFreeRatio: STABLE_LAYOUT_MAX_FREE_RATIO,
  })
}

/**
 * Reads the layout of the previous archive. It is a cached build artifact, so its header is checked before any offset
 * in it is reused: every packed file must lie inside the archive's content and no two may overlap.
 */
async function readPreviousLayout(file: string): Promise<Array<AsarContentUnit>> {
  let read: Awaited<ReturnType<typeof readAsarContentUnits>>
  try {
    read = await readAsarContentUnits(file)
  } catch (e: any) {
    throw new InvalidConfigurationError(`asar.stableLayout.previous (${file}) is not a readable asar: ${e.message}. Delete it to lay app.asar out afresh`)
  }
  const { units, contentSize } = read
  let end = 0
  for (const unit of units) {
    const problem =
      !Number.isSafeInteger(unit.offset) || !Number.isSafeInteger(unit.size) || unit.offset < 0 || unit.size < 0
        ? `has an invalid offset or size (${unit.offset}, ${unit.size})`
        : unit.offset + unit.size > contentSize
          ? `ends at ${unit.offset + unit.size}, past the end of the archive's content (${contentSize} bytes)`
          : unit.size > 0 && unit.offset < end
            ? `starts at ${unit.offset}, overlapping the file before it (which ends at ${end})`
            : null
    if (problem != null) {
      throw new InvalidConfigurationError(`asar.stableLayout.previous (${file}) is not a valid asar: ${unit.paths[0]} ${problem}. Delete it to lay app.asar out afresh`)
    }
    if (unit.size > 0) {
      end = unit.offset + unit.size
    }
  }
  return units
}

function reserve(size: number, params: StableLayoutParams): number {
  return size + Math.ceil(size * params.growthMargin)
}

function freshLayout(units: Array<AsarContentUnit>, params: StableLayoutParams): Array<number> {
  let cursor = 0
  return units.map(unit => {
    if (unit.size === 0) {
      return 0
    }
    const offset = alignUp(cursor, params.alignment)
    cursor = offset + reserve(unit.size, params)
    return offset
  })
}

interface PreviousSlot {
  offset: number
  /** end of the space the file may grow into: the start of the next file of the previous layout */
  end: number
  /** size of the current file kept in this slot, null while unclaimed */
  claimedBy: number | null
}

/**
 * Chooses offsets for `units` (the content of the archive just packed) that keep every file of the `previous` layout
 * where it was:
 *
 * - a file whose path was in the previous layout, whose previous offset is a multiple of `alignment` and that still
 *   fits its previous slot (its size plus the padding up to the next file) keeps its offset, so its header entry and
 *   every byte around it stay as they were;
 * - a new file, or one that outgrew (or is misaligned in) its slot, goes into the first freed slot it fits (with its
 *   growth margin), else after the previous content — it never shifts another file;
 * - empty files sit at offset 0 (they need no space).
 *
 * Identity is the path: a file that is renamed counts as removed + added. Without a previous layout, or when the unused
 * space (`freedBytes` + `slackBytes`) exceeds `maxFreeRatio` of the packed bytes, the files are laid out afresh in the
 * order given, each followed by its growth margin. Only space before the end of the last kept file counts as unused:
 * everything after it is the open tail that new and moved files are appended into, so growing, shrinking or removing
 * the last file never compacts. A misaligned file of a previous layout therefore moves once (or the layout is
 * compacted), and stays aligned from then on.
 */
export function planStableLayout(units: Array<AsarContentUnit>, previous: Array<AsarContentUnit> | null, params: StableLayoutParams): StableLayoutPlan {
  const fresh = (compacted: boolean, freedBytes: number, slackBytes: number): StableLayoutPlan => ({
    offsets: freshLayout(units, params),
    kept: 0,
    filled: 0,
    appended: units.filter(it => it.size > 0).length,
    compacted,
    freedBytes,
    slackBytes,
  })
  const previousFiles = (previous ?? []).filter(it => it.size > 0).sort((a, b) => a.offset - b.offset)
  if (previousFiles.length === 0) {
    return fresh(false, 0, 0)
  }

  const slotByPath = new Map<string, PreviousSlot>()
  const slots = previousFiles.map((unit, index): PreviousSlot => {
    const next = previousFiles[index + 1]
    const fileEnd = unit.offset + unit.size
    const slot: PreviousSlot = { offset: unit.offset, end: next == null ? alignUp(fileEnd, params.alignment) : Math.max(fileEnd, next.offset), claimedBy: null }
    for (const p of unit.paths) {
      slotByPath.set(p, slot)
    }
    return slot
  })

  const offsets = new Array<number>(units.length).fill(0)
  const toPlace: Array<number> = []
  let kept = 0
  let packedBytes = 0
  for (const [index, unit] of units.entries()) {
    if (unit.size === 0) {
      continue
    }
    packedBytes += unit.size
    const slot = unit.paths.map(p => slotByPath.get(p)).find(it => it != null && it.claimedBy == null && it.offset % params.alignment === 0 && unit.size <= it.end - it.offset)
    if (slot == null) {
      toPlace.push(index)
    } else {
      slot.claimedBy = unit.size
      offsets[index] = slot.offset
      kept++
    }
  }

  // the open tail starts where the last kept file now ends (its slack is reclaimed), so nothing from there on is waste
  let lastKept: PreviousSlot | null = null
  for (const slot of slots) {
    if (slot.claimedBy != null) {
      lastKept = slot
    }
  }
  let freedBytes = lastKept == null ? 0 : previousFiles[0].offset
  let slackBytes = 0
  for (const slot of slots) {
    if (lastKept == null || slot === lastKept) {
      break
    }
    if (slot.claimedBy == null) {
      freedBytes += slot.end - slot.offset
    } else {
      slackBytes += Math.max(0, slot.end - slot.offset - alignUp(reserve(slot.claimedBy, params), params.alignment))
    }
  }
  if (freedBytes + slackBytes > params.maxFreeRatio * packedBytes) {
    return fresh(true, freedBytes, slackBytes)
  }

  // the freed slots between the kept ones, then the open tail after the last kept one
  const holes: Array<{ start: number; end: number }> = []
  let cursor = 0
  for (const slot of slots) {
    if (slot.claimedBy == null) {
      continue
    }
    if (slot.offset > cursor) {
      holes.push({ start: cursor, end: slot.offset })
    }
    cursor = Math.max(cursor, slot === lastKept ? Math.min(slot.end, slot.offset + reserve(slot.claimedBy, params)) : slot.end)
  }
  let tail = cursor
  let filled = 0
  let appended = 0
  for (const index of toPlace) {
    const need = reserve(units[index].size, params)
    const hole = holes.find(it => alignUp(it.start, params.alignment) + need <= it.end)
    if (hole == null) {
      offsets[index] = alignUp(tail, params.alignment)
      tail = offsets[index] + need
      appended++
    } else {
      offsets[index] = alignUp(hole.start, params.alignment)
      hole.start = offsets[index] + need
      filled++
    }
  }
  return { offsets, kept, filled, appended, compacted: false, freedBytes, slackBytes }
}

/**
 * Re-lays `asarFile` (just packed) with `planStableLayout` against the layout of `previousAsar`, or afresh with growth
 * margins when `previousAsar` is null. Per-file integrity and the header's entry order are unchanged; the header hash
 * (Electron's asar integrity) is computed from the result afterwards like for any other archive.
 * @internal
 */
export async function applyStableAsarLayout(asarFile: string, previousAsar: string | null, params: StableLayoutParams): Promise<StableLayoutPlan> {
  const previous = previousAsar == null ? null : await readPreviousLayout(previousAsar)
  const { result, plan } = await relayoutAsarContent(asarFile, units => planStableLayout(units, previous, params))
  const { kept, filled, appended, compacted, freedBytes, slackBytes } = plan
  log.info(
    {
      file: log.filePath(asarFile),
      previous: previousAsar == null ? null : log.filePath(previousAsar),
      kept,
      filled,
      appended,
      compacted,
      freedBytes,
      slackBytes,
      padding: result.paddingBytes,
      size: `${result.sizeBefore} → ${result.sizeAfter}`,
    },
    compacted ? "asar stable layout: too much of the previous layout was unused, laid out afresh" : "asar stable layout applied"
  )
  return plan
}
