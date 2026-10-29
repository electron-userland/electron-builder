import { InvalidConfigurationError, log, statOrNull } from "builder-util"
import * as path from "path"
import { AsarStableLayoutOptions } from "../options/PlatformSpecificBuildOptions.js"
import { AsarContentUnit, alignUp, readAsarContentUnits, relayoutAsarContent } from "./asarAlign.js"

export interface StableLayoutParams {
  /** every placed file starts at a multiple of this many bytes (1 = no alignment) */
  alignment: number
  /** fraction of its size reserved after a file that is placed afresh (so it can grow later without moving) */
  growthMargin: number
  /** lay everything out afresh when the slots of removed or moved files exceed this fraction of the packed bytes */
  maxFreeRatio: number
}

/**
 * Above this share of freed slots (removed files and files that outgrew their slot) the layout is compacted: one
 * update then pays for the whole header, every later one is local again.
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
  /** true if the previous layout was dropped because too much of it was freed */
  compacted: boolean
  /** bytes of the previous layout's slots that no current file occupies (before any of them is filled) */
  freedBytes: number
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
 * Applies `asar.stableLayout` to the `app.asar` just packed: `previous` is resolved against `projectDir`, and a missing
 * file starts a new layout (with a warning) instead of failing the build.
 * @internal
 */
export async function applyStableLayoutOption(
  asarFile: string,
  projectDir: string,
  options: AsarStableLayoutOptions,
  contentAlignment: number | null | undefined
): Promise<StableLayoutPlan> {
  validateStableLayoutOptions(options)
  const previous = path.resolve(projectDir, options.previous)
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
  claimed: boolean
}

/**
 * Chooses offsets for `units` (the content of the archive just packed) that keep every file of the `previous` layout
 * where it was:
 *
 * - a file whose path was in the previous layout and that still fits its previous slot (its size plus the padding up
 *   to the next file) keeps its offset, so its header entry and every byte around it stay as they were;
 * - a new file, or one that outgrew its slot, goes into the first freed slot it fits (with its growth margin), else
 *   after the previous content — it never shifts another file;
 * - empty files sit at offset 0 (they need no space).
 *
 * Identity is the path: a file that is renamed counts as removed + added. Without a previous layout, or when the freed
 * slots exceed `maxFreeRatio` of the packed bytes, the files are laid out afresh in the order given, each followed by
 * its growth margin.
 */
export function planStableLayout(units: Array<AsarContentUnit>, previous: Array<AsarContentUnit> | null, params: StableLayoutParams): StableLayoutPlan {
  const fresh = (compacted: boolean, freedBytes: number): StableLayoutPlan => ({
    offsets: freshLayout(units, params),
    kept: 0,
    filled: 0,
    appended: units.filter(it => it.size > 0).length,
    compacted,
    freedBytes,
  })
  const previousFiles = (previous ?? []).filter(it => it.size > 0).sort((a, b) => a.offset - b.offset)
  if (previousFiles.length === 0) {
    return fresh(false, 0)
  }

  const slotByPath = new Map<string, PreviousSlot>()
  const slots: Array<PreviousSlot> = previousFiles.map((unit, index) => {
    const next = previousFiles[index + 1]
    const fileEnd = unit.offset + unit.size
    const slot = { offset: unit.offset, end: next == null ? alignUp(fileEnd, params.alignment) : Math.max(fileEnd, next.offset), claimed: false }
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
    const slot = unit.paths.map(p => slotByPath.get(p)).find(it => it != null && !it.claimed && unit.size <= it.end - it.offset)
    if (slot == null) {
      toPlace.push(index)
    } else {
      slot.claimed = true
      offsets[index] = slot.offset
      kept++
    }
  }

  const keptSlots = slots.filter(it => it.claimed)
  const freedBytes = slots.reduce((sum, it) => (it.claimed ? sum : sum + it.end - it.offset), 0)
  if (freedBytes > params.maxFreeRatio * packedBytes) {
    return fresh(true, freedBytes)
  }

  // the freed slots between the kept ones, then the open tail after the last kept one
  const holes: Array<{ start: number; end: number }> = []
  let cursor = 0
  for (const slot of keptSlots) {
    if (slot.offset > cursor) {
      holes.push({ start: cursor, end: slot.offset })
    }
    cursor = Math.max(cursor, slot.end)
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
  return { offsets, kept, filled, appended, compacted: false, freedBytes }
}

/**
 * Re-lays `asarFile` (just packed) with `planStableLayout` against the layout of `previousAsar`, or afresh with growth
 * margins when `previousAsar` is null. Per-file integrity and the header's entry order are unchanged; the header hash
 * (Electron's asar integrity) is computed from the result afterwards like for any other archive.
 * @internal
 */
export async function applyStableAsarLayout(asarFile: string, previousAsar: string | null, params: StableLayoutParams): Promise<StableLayoutPlan> {
  const previous = previousAsar == null ? null : await readAsarContentUnits(previousAsar)
  let plan: StableLayoutPlan | null = null
  const result = await relayoutAsarContent(asarFile, units => {
    plan = planStableLayout(units, previous, params)
    return plan.offsets
  })
  const { kept, filled, appended, compacted, freedBytes } = plan!
  log.info(
    {
      file: log.filePath(asarFile),
      previous: previousAsar == null ? null : log.filePath(previousAsar),
      kept,
      filled,
      appended,
      compacted,
      freedBytes,
      padding: result.paddingBytes,
      size: `${result.sizeBefore} → ${result.sizeAfter}`,
    },
    compacted ? "asar stable layout: too much of the previous layout was freed, laid out afresh" : "asar stable layout applied"
  )
  return plan!
}
