// copy from https://github.com/yarnpkg/berry/blob/master/packages/yarnpkg-nm/sources/hoist.ts
/**
BSD 2-Clause License

Copyright (c) 2016-present, Yarn Contributors.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

// commit: d63d411bcc5adcbffd198b8987c5a14c81eaf669
// fix(nm): optimize hoisting by treating peer deps same as other deps (#6517)
/**
 * High-level node_modules hoisting algorithm recipe
 *
 * 1. Take input dependency graph and start traversing it,
 * as you visit new node in the graph - clone it if there can be multiple paths
 * to access the node from the graph root to the node, e.g. essentially represent
 * the graph with a tree as you go, to make hoisting possible.
 * 2. You want to hoist every node possible to the top root node first,
 * then to each of its children etc, so you need to keep track what is your current
 * root node into which you are hoisting
 * 3. Traverse the dependency graph from the current root node and for each package name
 * that can be potentially hoisted to the current root node build a list of idents
 * in descending hoisting preference. You will check in next steps whether most preferred ident
 * for the given package name can be hoisted first, and if not, then you check the
 * less preferred ident, etc, until either some ident will be hoisted
 * or you run out of idents to check
 * (no need to convert the graph to the tree when you build this preference map).
 * 4. The children of the root node are already "hoisted", so you need to start
 * from the dependencies of these children. You take some child and
 * sort its dependencies so that regular dependencies without peer dependencies
 * will come first and then those dependencies that peer depend on them.
 * This is needed to make algorithm more efficient and hoist nodes which are easier
 * to hoist first and then handle peer dependent nodes.
 * 5. You take this sorted list of dependencies and check if each of them can be
 * hoisted to the current root node. To answer is the node can be hoisted you check
 * your constraints - require promise and peer dependency promise.
 * The possible answers can be: YES - the node is hoistable to the current root,
 * NO - the node is not hoistable to the current root
 * and DEPENDS - the node is hoistable to the root if nodes X, Y, Z are hoistable
 * to the root. The case DEPENDS happens when all the require and other
 * constraints are met, except peer dependency constraints. Note, that the nodes
 * that are not package idents currently at the top of preference list are considered
 * to have the answer NO right away, before doing any other constraint checks.
 * 6. When you have hoistable answer for each dependency of a node you then build
 * a list of nodes that are NOT hoistable. These are the nodes that have answer NO
 * and the nodes that DEPENDS on these nodes. All the other nodes are hoistable,
 * those that have answer YES and those that have answer DEPENDS,
 * because they are cyclically dependent on each another
 * 7. You hoist all the hoistable nodes to the current root and continue traversing
 * the tree. Note, you need to track newly added nodes to the current root,
 * because after you finished tree traversal you want to come back to these new nodes
 * first thing and hoist everything from each of them to the current tree root.
 * 8. After you have finished traversing newly hoisted current root nodes
 * it means you cannot hoist anything to the current tree root and you need to pick
 * the next node as current tree root and run the algorithm again
 * until you run out of candidates for current tree root.
 */
type PackageName = string
export enum HoisterDependencyKind {
  REGULAR,
  WORKSPACE,
  EXTERNAL_SOFT_LINK,
}
export type HoisterTree = {
  name: PackageName
  identName: PackageName
  reference: string
  dependencies: Set<HoisterTree>
  peerNames: Set<PackageName>
  hoistPriority?: number
  dependencyKind?: HoisterDependencyKind
}
export type HoisterResult = { name: PackageName; identName: PackageName; references: Set<string>; dependencies: Set<HoisterResult> }
type Locator = string
type AliasedLocator = string & { __aliasedLocator: true }
type Ident = string
type HoisterWorkTree = {
  name: PackageName
  references: Set<string>
  ident: Ident
  locator: Locator
  dependencies: Map<PackageName, HoisterWorkTree>
  originalDependencies: Map<PackageName, HoisterWorkTree>
  hoistedDependencies: Map<PackageName, HoisterWorkTree>
  peerNames: ReadonlySet<PackageName>
  decoupled: boolean
  reasons: Map<PackageName, string>
  isHoistBorder: boolean
  hoistedFrom: Map<PackageName, Array<string>>
  hoistedTo: Map<PackageName, string>
  hoistPriority: number
  dependencyKind: HoisterDependencyKind
}

/**
 * Mapping which packages depend on a given package alias + ident. It is used to determine hoisting weight,
 * e.g. which one among the group of packages with the same name should be hoisted.
 * The package having the biggest number of parents using this package will be hoisted.
 */
type PreferenceMap = Map<string, { peerDependents: Set<Ident>; dependents: Set<Ident>; hoistPriority: number }>

enum Hoistable {
  YES,
  NO,
  DEPENDS,
}
type HoistInfo =
  | {
      isHoistable: Hoistable.YES
    }
  | {
      isHoistable: Hoistable.NO
      reason: string | null
    }
  | {
      isHoistable: Hoistable.DEPENDS
      dependsOn: Set<HoisterWorkTree>
      reason: string | null
    }

type ShadowedNodes = Map<HoisterWorkTree, Set<PackageName>>

const makeLocator = (name: string, reference: string) => `${name}@${reference}`
const makeIdent = (name: string, reference: string) => {
  const hashIdx = reference.indexOf(`#`)
  // Strip virtual reference part, we don't need it for hoisting purposes
  const realReference = hashIdx >= 0 ? reference.substring(hashIdx + 1) : reference
  return makeLocator(name, realReference)
}

enum DebugLevel {
  NONE = -1,
  PERF = 0,
  CHECK = 1,
  REASONS = 2,
  INTENSIVE_CHECK = 9,
}

export type HoistOptions = {
  /** Runs self-checks after hoisting is finished */
  check?: boolean
  /** Debug level */
  debugLevel?: DebugLevel
  /** Hoist borders are defined by parent node locator and its dependency name. The dependency is considered a border, nothing can be hoisted past this dependency, but dependency can be hoisted */
  hoistingLimits?: Map<Locator, Set<PackageName>>
}

type InternalHoistOptions = {
  check?: boolean
  debugLevel: DebugLevel
  fastLookupPossible: boolean
  hoistingLimits: Map<Locator, Set<PackageName>>
}

/**
 * Hoists package tree.
 *
 * The root node of a tree must has id: '.'.
 * This function does not mutate its arguments, it hoists and returns tree copy.
 *
 * @param tree package tree (cycles in the tree are allowed)
 *
 * @returns hoisted tree copy
 */
export const hoist = (tree: HoisterTree, opts: HoistOptions = {}): HoisterResult => {
  const debugLevel = opts.debugLevel || Number(process.env.NM_DEBUG_LEVEL || DebugLevel.NONE)
  const check = opts.check || debugLevel >= (DebugLevel.INTENSIVE_CHECK as number)
  const hoistingLimits = opts.hoistingLimits || new Map()
  const options: InternalHoistOptions = { check, debugLevel, hoistingLimits, fastLookupPossible: true }
  let startTime: number

  if (options.debugLevel >= DebugLevel.PERF) startTime = Date.now()

  const treeCopy = cloneTree(tree, options)

  let anotherRoundNeeded = false
  let round = 0
  do {
    const result = hoistTo(treeCopy, [treeCopy], new Set([treeCopy.locator]), new Map(), options)
    anotherRoundNeeded = result.anotherRoundNeeded || result.isGraphChanged
    options.fastLookupPossible = false
    round++
  } while (anotherRoundNeeded)

  if (options.debugLevel >= DebugLevel.PERF) console.log(`hoist time: ${Date.now() - startTime!}ms, rounds: ${round}`)

  if (options.debugLevel >= DebugLevel.CHECK) {
    const prevTreeDump = dumpDepTree(treeCopy)
    const isGraphChanged = hoistTo(treeCopy, [treeCopy], new Set([treeCopy.locator]), new Map(), options).isGraphChanged
    if (isGraphChanged) throw new Error(`The hoisting result is not terminal, prev tree:\n${prevTreeDump}, next tree:\n${dumpDepTree(treeCopy)}`)
    const checkLog = selfCheck(treeCopy)
    if (checkLog) {
      throw new Error(`${checkLog}, after hoisting finished:\n${dumpDepTree(treeCopy)}`)
    }
  }

  if (options.debugLevel >= DebugLevel.REASONS) console.log(dumpDepTree(treeCopy))

  return shrinkTree(treeCopy)
}

const getZeroRoundUsedDependencies = (rootNodePath: Array<HoisterWorkTree>): Map<PackageName, HoisterWorkTree> => {
  const rootNode = rootNodePath[rootNodePath.length - 1]
  const usedDependencies = new Map()
  const seenNodes = new Set<HoisterWorkTree>()

  const addUsedDependencies = (node: HoisterWorkTree) => {
    if (seenNodes.has(node)) return
    seenNodes.add(node)

    for (const dep of node.hoistedDependencies.values()) usedDependencies.set(dep.name, dep)

    for (const dep of node.dependencies.values()) {
      if (!node.peerNames.has(dep.name)) {
        addUsedDependencies(dep)
      }
    }
  }

  addUsedDependencies(rootNode)

  return usedDependencies
}

const getUsedDependencies = (rootNodePath: Array<HoisterWorkTree>): Map<PackageName, HoisterWorkTree> => {
  const rootNode = rootNodePath[rootNodePath.length - 1]
  const usedDependencies = new Map()
  const seenNodes = new Set<HoisterWorkTree>()

  const hiddenDependencies = new Set<PackageName>()
  const addUsedDependencies = (node: HoisterWorkTree, hiddenDependencies: Set<PackageName>) => {
    if (seenNodes.has(node)) return
    seenNodes.add(node)

    for (const dep of node.hoistedDependencies.values()) {
      if (!hiddenDependencies.has(dep.name)) {
        let reachableDependency
        for (const node of rootNodePath) {
          reachableDependency = node.dependencies.get(dep.name)
          if (reachableDependency) {
            usedDependencies.set(reachableDependency.name, reachableDependency)
          }
        }
      }
    }

    const childrenHiddenDependencies = new Set<PackageName>()

    for (const dep of node.dependencies.values()) childrenHiddenDependencies.add(dep.name)

    for (const dep of node.dependencies.values()) {
      if (!node.peerNames.has(dep.name)) {
        addUsedDependencies(dep, childrenHiddenDependencies)
      }
    }
  }

  addUsedDependencies(rootNode, hiddenDependencies)

  return usedDependencies
}

/**
 * This method clones the node and returns cloned node copy, if the node was not previously decoupled.
 *
 * The node is considered decoupled if there is no multiple parents to any node
 * on the path from the dependency graph root up to this node. This means that there are no other
 * nodes in dependency graph that somehow transitively use this node and hence node can be hoisted without
 * side effects.
 *
 * The process of node decoupling is done by going from root node of the graph up to the node in concern
 * and decoupling each node on this graph path.
 *
 * @param node original node
 *
 * @returns decoupled node
 */
const decoupleGraphNode = (parent: HoisterWorkTree, node: HoisterWorkTree): HoisterWorkTree => {
  if (node.decoupled) return node

  const {
    name,
    references,
    ident,
    locator,
    dependencies,
    originalDependencies,
    hoistedDependencies,
    peerNames,
    reasons,
    isHoistBorder,
    hoistPriority,
    dependencyKind,
    hoistedFrom,
    hoistedTo,
  } = node
  // To perform node hoisting from parent node we must clone parent nodes up to the root node,
  // because some other package in the tree might depend on the parent package where hoisting
  // cannot be performed
  const clone = {
    name,
    references: new Set(references),
    ident,
    locator,
    dependencies: new Map(dependencies),
    originalDependencies: new Map(originalDependencies),
    hoistedDependencies: new Map(hoistedDependencies),
    peerNames: new Set(peerNames),
    reasons: new Map(reasons),
    decoupled: true,
    isHoistBorder,
    hoistPriority,
    dependencyKind,
    hoistedFrom: new Map(hoistedFrom),
    hoistedTo: new Map(hoistedTo),
  }
  const selfDep = clone.dependencies.get(name)
  if (selfDep && selfDep.ident == clone.ident)
    // Update self-reference
    clone.dependencies.set(name, clone)

  parent.dependencies.set(clone.name, clone)

  return clone
}

/**
 * Builds a map of most preferred packages that might be hoisted to the root node.
 *
 * The values in the map are idents sorted by preference from most preferred to less preferred.
 * If the root node has already some version of a package, the value array will contain only
 * one element, since it is not possible for other versions of a package to be hoisted.
 *
 * @param rootNode root node
 * @param preferenceMap preference map
 */
const getHoistIdentMap = (rootNode: HoisterWorkTree, preferenceMap: PreferenceMap): Map<PackageName, Array<Ident>> => {
  const identMap = new Map<PackageName, Array<Ident>>([[rootNode.name, [rootNode.ident]]])

  for (const dep of rootNode.dependencies.values()) {
    if (!rootNode.peerNames.has(dep.name)) {
      identMap.set(dep.name, [dep.ident])
    }
  }

  const keyList = Array.from(preferenceMap.keys())
  keyList.sort((key1, key2) => {
    const entry1 = preferenceMap.get(key1)!
    const entry2 = preferenceMap.get(key2)!
    if (entry2.hoistPriority !== entry1.hoistPriority) {
      return entry2.hoistPriority - entry1.hoistPriority
    } else {
      const entry1Usages = entry1.dependents.size + entry1.peerDependents.size
      const entry2Usages = entry2.dependents.size + entry2.peerDependents.size
      return entry2Usages - entry1Usages
    }
  })

  for (const key of keyList) {
    const name = key.substring(0, key.indexOf(`@`, 1))
    const ident = key.substring(name.length + 1)
    if (!rootNode.peerNames.has(name)) {
      let idents = identMap.get(name)
      if (!idents) {
        idents = []
        identMap.set(name, idents)
      }
      if (idents.indexOf(ident) < 0) {
        idents.push(ident)
      }
    }
  }

  return identMap
}

/**
 * Gets regular node dependencies only and sorts them in the order so that
 * peer dependencies come before the dependency that rely on them.
 *
 * @param node graph node
 * @returns sorted regular dependencies
 */
const getSortedRegularDependencies = (node: HoisterWorkTree): Set<HoisterWorkTree> => {
  const dependencies: Set<HoisterWorkTree> = new Set()

  const addDep = (dep: HoisterWorkTree, seenDeps = new Set()) => {
    if (seenDeps.has(dep)) return
    seenDeps.add(dep)

    for (const peerName of dep.peerNames) {
      if (!node.peerNames.has(peerName)) {
        const peerDep = node.dependencies.get(peerName)
        if (peerDep && !dependencies.has(peerDep)) {
          addDep(peerDep, seenDeps)
        }
      }
    }
    dependencies.add(dep)
  }

  for (const dep of node.dependencies.values()) {
    if (!node.peerNames.has(dep.name)) {
      addDep(dep)
    }
  }

  return dependencies
}

/**
 * Performs hoisting all the dependencies down the tree to the root node.
 *
 * The algorithm used here reduces dependency graph by deduplicating
 * instances of the packages while keeping:
 * 1. Regular dependency promise: the package should require the exact version of the dependency
 * that was declared in its `package.json`
 * 2. Peer dependency promise: the package and its direct parent package
 * must use the same instance of the peer dependency
 *
 * The regular and peer dependency promises are kept while performing transform
 * on tree branches of packages at a time:
 * `root package` -> `parent package 1` ... `parent package n` -> `dependency`
 * We check wether we can hoist `dependency` to `root package`, this boils down basically
 * to checking:
 * 1. Wether `root package` does not depend on other version of `dependency`
 * 2. Wether all the peer dependencies of a `dependency` had already been hoisted from all `parent packages`
 *
 * If many versions of the `dependency` can be hoisted to the `root package` we choose the most used
 * `dependency` version in the project among them.
 *
 * This function mutates the tree.
 *
 * @param tree package dependencies graph
 * @param rootNode root node to hoist to
 * @param rootNodePath root node path in the tree
 * @param rootNodePathLocators a set of locators for nodes that lead from the top of the tree up to root node
 * @param options hoisting options
 */
const hoistTo = (
  tree: HoisterWorkTree,
  rootNodePath: Array<HoisterWorkTree>,
  rootNodePathLocators: Set<Locator>,
  parentShadowedNodes: ShadowedNodes,
  options: InternalHoistOptions,
  seenNodes: Set<HoisterWorkTree> = new Set()
): { anotherRoundNeeded: boolean; isGraphChanged: boolean } => {
  const rootNode = rootNodePath[rootNodePath.length - 1]
  if (seenNodes.has(rootNode)) return { anotherRoundNeeded: false, isGraphChanged: false }
  seenNodes.add(rootNode)

  const preferenceMap = buildPreferenceMap(rootNode)

  const hoistIdentMap = getHoistIdentMap(rootNode, preferenceMap)

  const usedDependencies = tree == rootNode ? new Map() : options.fastLookupPossible ? getZeroRoundUsedDependencies(rootNodePath) : getUsedDependencies(rootNodePath)

  let wasStateChanged

  let anotherRoundNeeded = false
  let isGraphChanged = false

  const hoistIdents = new Map(Array.from(hoistIdentMap.entries()).map(([k, v]) => [k, v[0]]))
  const shadowedNodes: ShadowedNodes = new Map()
  do {
    const result = hoistGraph(tree, rootNodePath, rootNodePathLocators, usedDependencies, hoistIdents, hoistIdentMap, parentShadowedNodes, shadowedNodes, options)
    if (result.isGraphChanged) isGraphChanged = true
    if (result.anotherRoundNeeded) anotherRoundNeeded = true

    wasStateChanged = false
    for (const [name, idents] of hoistIdentMap) {
      if (idents.length > 1 && !rootNode.dependencies.has(name)) {
        hoistIdents.delete(name)
        idents.shift()
        hoistIdents.set(name, idents[0])
        wasStateChanged = true
      }
    }
  } while (wasStateChanged)

  for (const dependency of rootNode.dependencies.values()) {
    if (!rootNode.peerNames.has(dependency.name) && !rootNodePathLocators.has(dependency.locator)) {
      rootNodePathLocators.add(dependency.locator)
      const result = hoistTo(tree, [...rootNodePath, dependency], rootNodePathLocators, shadowedNodes, options)
      if (result.isGraphChanged) isGraphChanged = true
      if (result.anotherRoundNeeded) anotherRoundNeeded = true

      rootNodePathLocators.delete(dependency.locator)
    }
  }

  return { anotherRoundNeeded, isGraphChanged }
}

const hasUnhoistedDependencies = (node: HoisterWorkTree): boolean => {
  for (const [subName, subDependency] of node.dependencies) {
    if (!node.peerNames.has(subName) && subDependency.ident !== node.ident) {
      return true
    }
  }
  return false
}

const getNodeHoistInfo = (
  rootNode: HoisterWorkTree,
  rootNodePathLocators: Set<Locator>,
  nodePath: Array<HoisterWorkTree>,
  node: HoisterWorkTree,
  usedDependencies: Map<PackageName, HoisterWorkTree>,
  hoistIdents: Map<PackageName, Ident>,
  hoistIdentMap: Map<Ident, Array<Ident>>,
  shadowedNodes: ShadowedNodes,
  { outputReason, fastLookupPossible }: { outputReason: boolean; fastLookupPossible: boolean }
): HoistInfo => {
  let reasonRoot
  let reason: string | null = null
  let dependsOn: Set<HoisterWorkTree> | null = new Set()
  if (outputReason)
    reasonRoot = `${Array.from(rootNodePathLocators)
      .map(x => prettyPrintLocator(x))
      .join(`→`)}`

  const parentNode = nodePath[nodePath.length - 1]
  // We cannot hoist self-references
  const isSelfReference = node.ident === parentNode.ident
  let isHoistable = !isSelfReference
  if (outputReason && !isHoistable) reason = `- self-reference`

  if (isHoistable) {
    isHoistable = node.dependencyKind !== HoisterDependencyKind.WORKSPACE
    if (outputReason && !isHoistable) {
      reason = `- workspace`
    }
  }

  if (isHoistable && node.dependencyKind === HoisterDependencyKind.EXTERNAL_SOFT_LINK) {
    isHoistable = !hasUnhoistedDependencies(node)
    if (outputReason && !isHoistable) {
      reason = `- external soft link with unhoisted dependencies`
    }
  }

  if (isHoistable) {
    isHoistable = !rootNode.peerNames.has(node.name)
    if (outputReason && !isHoistable) {
      reason = `- cannot shadow peer: ${prettyPrintLocator(rootNode.originalDependencies.get(node.name)!.locator)} at ${reasonRoot}`
    }
  }

  if (isHoistable) {
    let isNameAvailable = false
    const usedDep = usedDependencies.get(node.name)
    isNameAvailable = !usedDep || usedDep.ident === node.ident
    if (outputReason && !isNameAvailable) reason = `- filled by: ${prettyPrintLocator(usedDep!.locator)} at ${reasonRoot}`
    if (isNameAvailable) {
      for (let idx = nodePath.length - 1; idx >= 1; idx--) {
        const parent = nodePath[idx]
        const parentDep = parent.dependencies.get(node.name)
        if (parentDep && parentDep.ident !== node.ident) {
          isNameAvailable = false
          let shadowedNames = shadowedNodes.get(parentNode)
          if (!shadowedNames) {
            shadowedNames = new Set()
            shadowedNodes.set(parentNode, shadowedNames)
          }
          shadowedNames.add(node.name)
          if (outputReason)
            reason = `- filled by ${prettyPrintLocator(parentDep.locator)} at ${nodePath
              .slice(0, idx)
              .map(x => prettyPrintLocator(x.locator))
              .join(`→`)}`
          break
        }
      }
    }

    isHoistable = isNameAvailable
  }

  if (isHoistable) {
    const hoistedIdent = hoistIdents.get(node.name)
    isHoistable = hoistedIdent === node.ident
    if (outputReason && !isHoistable) {
      reason = `- filled by: ${prettyPrintLocator(hoistIdentMap.get(node.name)![0])} at ${reasonRoot}`
    }
  }

  if (isHoistable) {
    let arePeerDepsSatisfied = true
    const checkList = new Set(node.peerNames)
    for (let idx = nodePath.length - 1; idx >= 1; idx--) {
      const parent = nodePath[idx]
      for (const name of checkList) {
        if (parent.peerNames.has(name) && parent.originalDependencies.has(name)) continue

        const parentDepNode = parent.dependencies.get(name)
        if (parentDepNode && rootNode.dependencies.get(name) !== parentDepNode) {
          if (idx === nodePath.length - 1) {
            dependsOn!.add(parentDepNode)
          } else {
            dependsOn = null
            arePeerDepsSatisfied = false
            if (outputReason) {
              reason = `- peer dependency ${prettyPrintLocator(parentDepNode.locator)} from parent ${prettyPrintLocator(parent.locator)} was not hoisted to ${reasonRoot}`
            }
          }
        }
        checkList.delete(name)
      }
      if (!arePeerDepsSatisfied) {
        break
      }
    }
    isHoistable = arePeerDepsSatisfied
  }

  if (isHoistable && !fastLookupPossible) {
    for (const origDep of node.hoistedDependencies.values()) {
      const usedDep = usedDependencies.get(origDep.name) || rootNode.dependencies.get(origDep.name)
      if (!usedDep || origDep.ident !== usedDep.ident) {
        isHoistable = false
        if (outputReason) reason = `- previously hoisted dependency mismatch, needed: ${prettyPrintLocator(origDep.locator)}, available: ${prettyPrintLocator(usedDep?.locator)}`

        break
      }
    }
  }

  if (dependsOn !== null && dependsOn.size > 0) {
    return { isHoistable: Hoistable.DEPENDS, dependsOn, reason }
  } else {
    return { isHoistable: isHoistable ? Hoistable.YES : Hoistable.NO, reason }
  }
}

const getAliasedLocator = (node: HoisterWorkTree): AliasedLocator => `${node.name}@${node.locator}` as AliasedLocator

/**
 * Performs actual graph transformation, by hoisting packages to the root node.
 *
 * @param tree dependency tree
 * @param rootNodePath root node path in the tree
 * @param rootNodePathLocators a set of locators for nodes that lead from the top of the tree up to root node
 * @param usedDependencies map of dependency nodes from parents of root node used by root node and its children via parent lookup
 * @param hoistIdents idents that should be attempted to be hoisted to the root node
 */
const hoistGraph = (
  tree: HoisterWorkTree,
  rootNodePath: Array<HoisterWorkTree>,
  rootNodePathLocators: Set<Locator>,
  usedDependencies: Map<PackageName, HoisterWorkTree>,
  hoistIdents: Map<PackageName, Ident>,
  hoistIdentMap: Map<Ident, Array<Ident>>,
  parentShadowedNodes: ShadowedNodes,
  shadowedNodes: ShadowedNodes,
  options: InternalHoistOptions
): { anotherRoundNeeded: boolean; isGraphChanged: boolean } => {
  const rootNode = rootNodePath[rootNodePath.length - 1]
  const seenNodes = new Set<HoisterWorkTree>()
  let anotherRoundNeeded = false
  let isGraphChanged = false

  const hoistNodeDependencies = (
    nodePath: Array<HoisterWorkTree>,
    locatorPath: Array<Locator>,
    aliasedLocatorPath: Array<AliasedLocator>,
    parentNode: HoisterWorkTree,
    newNodes: Set<HoisterWorkTree>
  ) => {
    if (seenNodes.has(parentNode)) return
    const nextLocatorPath = [...locatorPath, getAliasedLocator(parentNode)]
    const nextAliasedLocatorPath = [...aliasedLocatorPath, getAliasedLocator(parentNode)]

    const dependantTree = new Map<PackageName, Set<PackageName>>()
    const hoistInfos = new Map<HoisterWorkTree, HoistInfo>()
    for (const subDependency of getSortedRegularDependencies(parentNode)) {
      const hoistInfo = getNodeHoistInfo(
        rootNode,
        rootNodePathLocators,
        [rootNode, ...nodePath, parentNode],
        subDependency,
        usedDependencies,
        hoistIdents,
        hoistIdentMap,
        shadowedNodes,
        { outputReason: options.debugLevel >= DebugLevel.REASONS, fastLookupPossible: options.fastLookupPossible }
      )

      hoistInfos.set(subDependency, hoistInfo)
      if (hoistInfo.isHoistable === Hoistable.DEPENDS) {
        for (const node of hoistInfo.dependsOn) {
          const nodeDependants = dependantTree.get(node.name) || new Set()
          nodeDependants.add(subDependency.name)
          dependantTree.set(node.name, nodeDependants)
        }
      }
    }

    const unhoistableNodes = new Set<HoisterWorkTree>()
    const addUnhoistableNode = (node: HoisterWorkTree, hoistInfo: HoistInfo, reason: string) => {
      if (!unhoistableNodes.has(node)) {
        unhoistableNodes.add(node)
        hoistInfos.set(node, { isHoistable: Hoistable.NO, reason })
        for (const dependantName of dependantTree.get(node.name) || []) {
          addUnhoistableNode(
            parentNode.dependencies.get(dependantName)!,
            hoistInfo,
            options.debugLevel >= DebugLevel.REASONS
              ? `- peer dependency ${prettyPrintLocator(node.locator)} from parent ${prettyPrintLocator(parentNode.locator)} was not hoisted`
              : ``
          )
        }
      }
    }

    for (const [node, hoistInfo] of hoistInfos) if (hoistInfo.isHoistable === Hoistable.NO) addUnhoistableNode(node, hoistInfo, hoistInfo.reason!)

    let wereNodesHoisted = false
    for (const node of hoistInfos.keys()) {
      if (!unhoistableNodes.has(node)) {
        isGraphChanged = true
        const shadowedNames = parentShadowedNodes.get(parentNode)
        if (shadowedNames && shadowedNames.has(node.name)) anotherRoundNeeded = true

        wereNodesHoisted = true
        parentNode.dependencies.delete(node.name)
        parentNode.hoistedDependencies.set(node.name, node)
        parentNode.reasons.delete(node.name)

        const hoistedNode = rootNode.dependencies.get(node.name)
        if (options.debugLevel >= DebugLevel.REASONS) {
          const hoistedFrom = Array.from(locatorPath)
            .concat([parentNode.locator])
            .map(x => prettyPrintLocator(x))
            .join(`→`)
          let hoistedFromArray = rootNode.hoistedFrom.get(node.name)
          if (!hoistedFromArray) {
            hoistedFromArray = []
            rootNode.hoistedFrom.set(node.name, hoistedFromArray)
          }
          hoistedFromArray.push(hoistedFrom)

          parentNode.hoistedTo.set(
            node.name,
            Array.from(rootNodePath)
              .map(x => prettyPrintLocator(x.locator))
              .join(`→`)
          )
        }
        // Add hoisted node to root node, in case it is not already there
        if (!hoistedNode) {
          // Avoid adding other version of root node to itself
          if (rootNode.ident !== node.ident) {
            rootNode.dependencies.set(node.name, node)
            newNodes.add(node)
          }
        } else {
          for (const reference of node.references) {
            hoistedNode.references.add(reference)
          }
        }
      }
    }

    if (parentNode.dependencyKind === HoisterDependencyKind.EXTERNAL_SOFT_LINK && wereNodesHoisted) anotherRoundNeeded = true

    if (options.check) {
      const checkLog = selfCheck(tree)
      if (checkLog) {
        throw new Error(
          `${checkLog}, after hoisting dependencies of ${[rootNode, ...nodePath, parentNode].map(x => prettyPrintLocator(x.locator)).join(`→`)}:\n${dumpDepTree(tree)}`
        )
      }
    }

    const children = getSortedRegularDependencies(parentNode)
    for (const node of children) {
      if (unhoistableNodes.has(node)) {
        const hoistInfo = hoistInfos.get(node)!
        const hoistableIdent = hoistIdents.get(node.name)
        if ((hoistableIdent === node.ident || !parentNode.reasons.has(node.name)) && hoistInfo.isHoistable !== Hoistable.YES) parentNode.reasons.set(node.name, hoistInfo.reason!)

        if (!node.isHoistBorder && nextAliasedLocatorPath.indexOf(getAliasedLocator(node)) < 0) {
          seenNodes.add(parentNode)
          const decoupledNode = decoupleGraphNode(parentNode, node)

          hoistNodeDependencies([...nodePath, parentNode], nextLocatorPath, nextAliasedLocatorPath, decoupledNode, nextNewNodes)

          seenNodes.delete(parentNode)
        }
      }
    }
  }

  let newNodes
  let nextNewNodes = new Set(getSortedRegularDependencies(rootNode))
  const aliasedRootNodePathLocators = Array.from(rootNodePath).map(x => getAliasedLocator(x))
  do {
    newNodes = nextNewNodes
    nextNewNodes = new Set()
    for (const dep of newNodes) {
      if (dep.locator === rootNode.locator || dep.isHoistBorder) continue
      const decoupledDependency = decoupleGraphNode(rootNode, dep)

      hoistNodeDependencies([], Array.from(rootNodePathLocators), aliasedRootNodePathLocators, decoupledDependency, nextNewNodes)
    }
  } while (nextNewNodes.size > 0)

  return { anotherRoundNeeded, isGraphChanged }
}

const selfCheck = (tree: HoisterWorkTree): string => {
  const log: Array<string> = []

  const seenNodes = new Set()
  const parents = new Set<HoisterWorkTree>()

  const checkNode = (node: HoisterWorkTree, parentDeps: Map<PackageName, HoisterWorkTree>, parent: HoisterWorkTree) => {
    if (seenNodes.has(node)) return
    seenNodes.add(node)

    if (parents.has(node)) return

    const dependencies = new Map(parentDeps)
    for (const dep of node.dependencies.values()) if (!node.peerNames.has(dep.name)) dependencies.set(dep.name, dep)

    for (const origDep of node.originalDependencies.values()) {
      const dep = dependencies.get(origDep.name)
      const prettyPrintTreePath = () =>
        `${Array.from(parents)
          .concat([node])
          .map(x => prettyPrintLocator(x.locator))
          .join(`→`)}`
      if (node.peerNames.has(origDep.name)) {
        const parentDep = parentDeps.get(origDep.name)
        if (parentDep !== dep || !parentDep || parentDep.ident !== origDep.ident) {
          log.push(`${prettyPrintTreePath()} - broken peer promise: expected ${origDep.ident} but found ${parentDep ? parentDep.ident : parentDep}`)
        }
      } else {
        const hoistedFrom = parent.hoistedFrom.get(node.name)
        const originalHoistedTo = node.hoistedTo.get(origDep.name)
        const prettyHoistedFrom = `${hoistedFrom ? ` hoisted from ${hoistedFrom.join(`, `)}` : ``}`
        const prettyOriginalHoistedTo = `${originalHoistedTo ? ` hoisted to ${originalHoistedTo}` : ``}`
        const prettyNodePath = `${prettyPrintTreePath()}${prettyHoistedFrom}`
        if (!dep) {
          log.push(`${prettyNodePath} - broken require promise: no required dependency ${origDep.name}${prettyOriginalHoistedTo} found`)
        } else if (dep.ident !== origDep.ident) {
          log.push(`${prettyNodePath} - broken require promise for ${origDep.name}${prettyOriginalHoistedTo}: expected ${origDep.ident}, but found: ${dep.ident}`)
        }
      }
    }

    parents.add(node)
    for (const dep of node.dependencies.values()) {
      if (!node.peerNames.has(dep.name)) {
        checkNode(dep, dependencies, node)
      }
    }
    parents.delete(node)
  }

  checkNode(tree, tree.dependencies, tree)

  return log.join(`\n`)
}

/**
 * Creates a clone of package tree with extra fields used for hoisting purposes.
 *
 * @param tree package tree clone
 */
const cloneTree = (tree: HoisterTree, options: InternalHoistOptions): HoisterWorkTree => {
  const { identName, name, reference, peerNames } = tree
  const treeCopy: HoisterWorkTree = {
    name,
    references: new Set([reference]),
    locator: makeLocator(identName, reference),
    ident: makeIdent(identName, reference),
    dependencies: new Map(),
    originalDependencies: new Map(),
    hoistedDependencies: new Map(),
    peerNames: new Set(peerNames),
    reasons: new Map(),
    decoupled: true,
    isHoistBorder: true,
    hoistPriority: 0,
    dependencyKind: HoisterDependencyKind.WORKSPACE,
    hoistedFrom: new Map(),
    hoistedTo: new Map(),
  }

  const seenNodes = new Map<HoisterTree, HoisterWorkTree>([[tree, treeCopy]])

  const addNode = (node: HoisterTree, parentNode: HoisterWorkTree) => {
    let workNode = seenNodes.get(node)
    const isSeen = !!workNode
    if (!workNode) {
      const { name, identName, reference, peerNames, hoistPriority, dependencyKind } = node
      const dependenciesNmHoistingLimits = options.hoistingLimits.get(parentNode.locator)
      workNode = {
        name,
        references: new Set([reference]),
        locator: makeLocator(identName, reference),
        ident: makeIdent(identName, reference),
        dependencies: new Map(),
        originalDependencies: new Map(),
        hoistedDependencies: new Map(),
        peerNames: new Set(peerNames),
        reasons: new Map(),
        decoupled: true,
        isHoistBorder: dependenciesNmHoistingLimits ? dependenciesNmHoistingLimits.has(name) : false,
        hoistPriority: hoistPriority || 0,
        dependencyKind: dependencyKind || HoisterDependencyKind.REGULAR,
        hoistedFrom: new Map(),
        hoistedTo: new Map(),
      }
      seenNodes.set(node, workNode)
    }

    parentNode.dependencies.set(node.name, workNode)
    parentNode.originalDependencies.set(node.name, workNode)

    if (!isSeen) {
      for (const dep of node.dependencies) {
        addNode(dep, workNode)
      }
    } else {
      const seenCoupledNodes = new Set()

      const markNodeCoupled = (node: HoisterWorkTree) => {
        if (seenCoupledNodes.has(node)) return
        seenCoupledNodes.add(node)
        node.decoupled = false

        for (const dep of node.dependencies.values()) {
          if (!node.peerNames.has(dep.name)) {
            markNodeCoupled(dep)
          }
        }
      }

      markNodeCoupled(workNode)
    }
  }

  for (const dep of tree.dependencies) addNode(dep, treeCopy)

  return treeCopy
}

const getIdentName = (locator: Locator) => locator.substring(0, locator.indexOf(`@`, 1))

/**
 * Creates a clone of hoisted package tree with extra fields removed
 *
 * @param tree stripped down hoisted package tree clone
 */
const shrinkTree = (tree: HoisterWorkTree): HoisterResult => {
  const treeCopy: HoisterResult = {
    name: tree.name,
    identName: getIdentName(tree.locator),
    references: new Set(tree.references),
    dependencies: new Set(),
  }

  const seenNodes = new Set<HoisterWorkTree>([tree])

  const addNode = (node: HoisterWorkTree, parentWorkNode: HoisterWorkTree, parentNode: HoisterResult) => {
    const isSeen = seenNodes.has(node)

    let resultNode: HoisterResult
    if (parentWorkNode === node) {
      resultNode = parentNode
    } else {
      const { name, references, locator } = node
      resultNode = {
        name,
        identName: getIdentName(locator),
        references,
        dependencies: new Set<HoisterResult>(),
      }
    }
    parentNode.dependencies.add(resultNode)

    if (!isSeen) {
      seenNodes.add(node)
      for (const dep of node.dependencies.values()) {
        if (!node.peerNames.has(dep.name)) {
          addNode(dep, node, resultNode)
        }
      }
      seenNodes.delete(node)
    }
  }

  for (const dep of tree.dependencies.values()) addNode(dep, tree, treeCopy)

  return treeCopy
}

/**
 * Builds mapping, where key is an alias + dependent package ident and the value is the list of
 * parent package idents who depend on this package.
 *
 * @param rootNode package tree root node
 *
 * @returns preference map
 */
const buildPreferenceMap = (rootNode: HoisterWorkTree): PreferenceMap => {
  const preferenceMap: PreferenceMap = new Map()

  const seenNodes = new Set<HoisterWorkTree>([rootNode])
  const getPreferenceKey = (node: HoisterWorkTree) => `${node.name}@${node.ident}`

  const getOrCreatePreferenceEntry = (node: HoisterWorkTree) => {
    const key = getPreferenceKey(node)
    let entry = preferenceMap.get(key)
    if (!entry) {
      entry = { dependents: new Set<Ident>(), peerDependents: new Set<Ident>(), hoistPriority: 0 }
      preferenceMap.set(key, entry)
    }
    return entry
  }

  const addDependent = (dependent: HoisterWorkTree, node: HoisterWorkTree) => {
    const isSeen = !!seenNodes.has(node)

    const entry = getOrCreatePreferenceEntry(node)
    entry.dependents.add(dependent.ident)

    if (!isSeen) {
      seenNodes.add(node)
      for (const dep of node.dependencies.values()) {
        const entry = getOrCreatePreferenceEntry(dep)
        entry.hoistPriority = Math.max(entry.hoistPriority, dep.hoistPriority)
        if (node.peerNames.has(dep.name)) {
          entry.peerDependents.add(node.ident)
        } else {
          addDependent(node, dep)
        }
      }
    }
  }

  for (const dep of rootNode.dependencies.values()) if (!rootNode.peerNames.has(dep.name)) addDependent(rootNode, dep)

  return preferenceMap
}

const prettyPrintLocator = (locator?: Locator) => {
  if (!locator) return `none`

  const idx = locator.indexOf(`@`, 1)
  let name = locator.substring(0, idx)
  if (name.endsWith(`$wsroot$`)) name = `wh:${name.replace(`$wsroot$`, ``)}`
  const reference = locator.substring(idx + 1)
  if (reference === `workspace:.`) {
    return `.`
  } else if (!reference) {
    return `${name}`
  } else {
    let version = (reference.indexOf(`#`) > 0 ? reference.split(`#`)[1] : reference).replace(`npm:`, ``)
    if (reference.startsWith(`virtual`)) name = `v:${name}`
    if (version.startsWith(`workspace`)) {
      name = `w:${name}`
      version = ``
    }

    return `${name}${version ? `@${version}` : ``}`
  }
}

const MAX_NODES_TO_DUMP = 50000

/**
 * Pretty-prints dependency tree in the `yarn why`-like format
 *
 * The function is used for troubleshooting purposes only.
 *
 * @param pkg node_modules tree
 *
 * @returns sorted node_modules tree
 */

const dumpDepTree = (tree: HoisterWorkTree) => {
  let nodeCount = 0
  const dumpPackage = (pkg: HoisterWorkTree, parents: Set<HoisterWorkTree>, prefix = ``): string => {
    if (nodeCount > MAX_NODES_TO_DUMP || parents.has(pkg)) return ``

    nodeCount++
    const dependencies = Array.from(pkg.dependencies.values()).sort((n1, n2) => {
      if (n1.name === n2.name) {
        return 0
      } else {
        return n1.name > n2.name ? 1 : -1
      }
    })

    let str = ``
    parents.add(pkg)
    for (let idx = 0; idx < dependencies.length; idx++) {
      const dep = dependencies[idx]
      if (!pkg.peerNames.has(dep.name) && dep !== pkg) {
        const reason = pkg.reasons.get(dep.name)
        const identName = getIdentName(dep.locator)
        str += `${prefix}${idx < dependencies.length - 1 ? `├─` : `└─`}${(parents.has(dep) ? `>` : ``) + (identName !== dep.name ? `a:${dep.name}:` : ``) + prettyPrintLocator(dep.locator) + (reason ? ` ${reason}` : ``)}\n`
        str += dumpPackage(dep, parents, `${prefix}${idx < dependencies.length - 1 ? `│ ` : `  `}`)
      }
    }
    parents.delete(pkg)
    return str
  }

  const treeDump = dumpPackage(tree, new Set())

  return treeDump + (nodeCount > MAX_NODES_TO_DUMP ? `\nTree is too large, part of the tree has been dunped\n` : ``)
}
