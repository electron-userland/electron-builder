// copy from https://github.com/yarnpkg/berry/blob/master/packages/yarnpkg-nm/tests/hoist.test.ts
import { hoist, HoisterTree, HoisterResult, HoisterDependencyKind } from "app-builder-lib/out/node-module-collector/hoist"
import { expect } from "vitest"

const toTree = (obj: any, key: string = `.`, nodes = new Map()): HoisterTree => {
  let node = nodes.get(key)
  const name = key.match(/@?[^@]+/)![0]
  if (!node) {
    node = {
      name,
      identName: (obj[key] || {}).identName || name,
      reference: key.match(/@?[^@]+@?(.+)?/)![1] || ``,
      dependencies: new Set<HoisterTree>(),
      peerNames: new Set<string>((obj[key] || {}).peerNames || []),
      dependencyKind: (obj[key] || {}).dependencyKind,
    }
    nodes.set(key, node)

    for (const dep of (obj[key] || {}).dependencies || []) {
      node.dependencies.add(toTree(obj, dep, nodes))
    }
  }
  return node
}

const getTreeHeight = (tree: HoisterResult): number => {
  let height = 0
  let maxHeight = 0
  const seen = new Set<HoisterResult>()

  const visitNode = (node: HoisterResult) => {
    if (seen.has(node)) return
    seen.add(node)

    height += 1
    maxHeight = Math.max(height, maxHeight)
    for (const dep of node.dependencies) visitNode(dep)
    height -= 1
  }

  visitNode(tree)

  return maxHeight
}

describe(`hoist`, () => {
  it(`should do very basic hoisting`, () => {
    // . -> A -> B
    // should be hoisted to:
    // . -> A
    //   -> B
    const tree = {
      ".": { dependencies: [`A`] },
      A: { dependencies: [`B`] },
    }
    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(2)
  })

  it(`should support basic cyclic dependencies`, () => {
    // . -> C -> A -> B -> A
    //             -> D -> E
    // should be hoisted to:
    // . -> A
    //   -> B
    //   -> C
    //   -> D
    //   -> E
    const tree = {
      ".": { dependencies: [`C`] },
      C: { dependencies: [`A`] },
      A: { dependencies: [`B`, `D`] },
      B: { dependencies: [`A`, `E`] },
    }
    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(2)
  })

  // it(`should support simple cyclic peer dependencies`, () => {
  //   //   -> D -> A --> B
  //   //        -> B --> C
  //   //        -> C --> A
  //   // Ideally should be hoisted to:
  //   //   -> D
  //   //   -> A
  //   //   -> B
  //   //   -> C
  //   // but its difficult and its okay if hoister at least doesn't loop and leave the graph in original state

  //   const tree = {
  //     '.': {dependencies: [`D`]},
  //     D: {dependencies: [`A`, `B`, `C`]},
  //     A: {dependencies: [`B`], peerNames: [`B`]},
  //     B: {dependencies: [`C`], peerNames: [`C`]},
  //     C: {dependencies: [`A`], peerNames: [`A`]},
  //   };
  //   expect(getTreeHeight(hoist(toTree(tree), {check: true}))).toEqual(3);
  // });

  it(`should support cyclic peer dependencies`, () => {
    // . -> E@X
    //   -> D -> A --> B
    //        -> B --> C
    //        -> C --> A
    //             --> E@Y
    //        -> E@Y
    // Should be hoisted to:
    // . -> E@X
    //   -> D -> A
    //        -> B
    //        -> C
    //        -> E@Y
    const tree = {
      ".": { dependencies: [`D`, `E@X`] },
      D: { dependencies: [`A`, `B`, `C`, `E@Y`] },
      A: { dependencies: [`B`], peerNames: [`B`] },
      B: { dependencies: [`C`], peerNames: [`C`] },
      C: { dependencies: [`A`, `E@Y`], peerNames: [`A`, `E`] },
    }
    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(3)
  })

  it(`should keep require promise`, () => {
    // . -> A -> B -> C@X -> D@X
    //             -> F@X -> G@X
    //        -> C@Z
    //        -> F@Z
    //   -> C@Y
    //   -> D@Y
    // should be hoisted to:
    // . -> A
    //        -> C@Z
    //        -> D@X
    //   -> B -> C@X
    //        -> F@X
    //   -> C@Y
    //   -> D@Y
    //   -> F@Z
    //   -> G@X
    const tree = {
      ".": { dependencies: [`A`, `C@Y`, `D@Y`] },
      A: { dependencies: [`B`, `C@Z`, `F@Z`] },
      B: { dependencies: [`C@X`, `F@X`] },
      "F@X": { dependencies: [`G@X`] },
      "C@X": { dependencies: [`D@X`] },
    }
    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(3)
  })

  it(`should not forget hoisted dependencies`, () => {
    // . -> A -> B -> C@X
    //             -> A
    //   -> C@Y
    // should be hoisted to (B cannot be hoisted to the top, otherwise it will require C@Y instead of C@X)
    // . -> A -> B
    //        -> C@X
    //   -> C@Y
    const tree = {
      ".": { dependencies: [`A`, `C@Y`] },
      A: { dependencies: [`B`] },
      B: { dependencies: [`A`, `C@X`] },
    }
    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(3)
  })

  it(`should not hoist different package with the same name`, () => {
    // . -> A -> B@X
    //   -> B@Y
    // should not be changed
    const tree = {
      ".": { dependencies: [`A`, `B@Y`] },
      A: { dependencies: [`B@X`] },
    }
    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(3)
  })

  it(`should not hoist package that has several versions on the same tree path`, () => {
    // . -> A -> B@X -> C -> B@Y
    // should be hoisted to:
    // . -> A
    //   -> B@X
    //   -> C -> B@Y
    const tree = {
      ".": { dependencies: [`A`] },
      A: { dependencies: [`B@X`] },
      "B@X": { dependencies: [`C`] },
      C: { dependencies: [`B@Y`] },
    }
    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(3)
  })

  it(`should perform deep hoisting`, () => {
    // . -> A -> B@X -> C@Y
    //        -> C@X
    //   -> B@Y
    //   -> C@X
    // should be hoisted to:
    // . -> A -> B@X -> C@Y
    //   -> B@Y
    //   -> C@X
    const tree = {
      ".": { dependencies: [`A`, `B@Y`, `C@X`] },
      A: { dependencies: [`B@X`, `C@X`] },
      "B@X": { dependencies: [`C@Y`] },
      C: { dependencies: [`B@Y`] },
    }
    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(4)
  })

  it(`should tolerate self-dependencies`, () => {
    // . -> . -> A -> A -> B@X -> B@X -> C@Y
    //                  -> C@X
    //   -> B@Y
    //   -> C@X
    // should be hoisted to:
    // . -> A -> B@X -> C@Y
    //   -> B@Y
    //   -> C@X
    const tree = {
      ".": { dependencies: [`.`, `A`, `B@Y`, `C@X`] },
      A: { dependencies: [`A`, `B@X`, `C@X`] },
      "B@X": { dependencies: [`B@X`, `C@Y`] },
      C: { dependencies: [`B@Y`] },
    }
    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(4)
  })

  it(`should honor package popularity when hoisting`, () => {
    // . -> A -> B@X
    //   -> C -> B@X
    //   -> D -> B@Y
    //   -> E -> B@Y
    //   -> F -> G -> B@Y
    // should be hoisted to:
    // . -> A -> B@X
    //   -> C -> B@X
    //   -> D
    //   -> E
    //   -> F
    //   -> G
    //   -> B@Y
    const tree = {
      ".": { dependencies: [`A`, `C`, `D`, `E`, `F`] },
      A: { dependencies: [`B@X`] },
      C: { dependencies: [`B@X`] },
      D: { dependencies: [`B@Y`] },
      E: { dependencies: [`B@Y`] },
      F: { dependencies: [`G`] },
      G: { dependencies: [`B@Y`] },
    }
    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(3)
  })

  it(`should honor peer dependencies`, () => {
    // . -> A -> B --> D@X
    //        -> D@X
    //   -> D@Y
    // should be hoisted to (A and B should share single D@X dependency):
    // . -> A -> B
    //        -> D@X
    //   -> D@Y
    const tree = {
      ".": { dependencies: [`A`, `D@Y`] },
      A: { dependencies: [`B`, `D@X`] },
      B: { dependencies: [`D@X`], peerNames: [`D`] },
    }
    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(3)
  })

  it(`should honor package popularity considering number of all references over number of references by peers`, () => {
    // . -> A -> Z@X
    //   -> B -> Z@X
    //   -> C -> Z@X
    //   -> D -> Z@Y
    //        -> U -> Z@Y
    // should be hoisted to:
    // . -> A
    //   -> B
    //   -> C
    //   -> D -> U
    //        -> Z@Y
    //   -> Z@X
    const tree = toTree({
      ".": { dependencies: [`A`, `B`, `C`, `D`] },
      A: { dependencies: [`Z@X`] },
      B: { dependencies: [`Z@X`] },
      C: { dependencies: [`Z@X`] },
      D: { dependencies: [`Z@Y`, `U`] },
      U: { dependencies: [`Z@Y`], peerNames: [`Z`] },
    })
    const result = hoist(tree, { check: true })
    expect(getTreeHeight(result)).toEqual(3)

    const topLevelDeps = [...result.dependencies]
    const hoistedZ = topLevelDeps.find(x => x.name === `Z`)!
    expect(hoistedZ.references).toContain(`X`)
    expect(hoistedZ.references).not.toContain(`Y`)

    const D = topLevelDeps.find(x => x.name === `D`)!
    const dDeps = [...D.dependencies]
    expect(dDeps.length).toEqual(2)
    const nestedZ = dDeps.find(x => x.name === `Z`)!
    expect(nestedZ.references).not.toContain(`X`)
    expect(nestedZ.references).toContain(`Y`)
  })

  it(`should hoist dependencies after hoisting peer dep`, () => {
    // . -> A -> B --> D@X
    //      -> D@X
    // should be hoisted to (B should be hoisted because its inherited dep D@X was hoisted):
    // . -> A
    //   -> B
    //   -> D@X
    const tree = {
      ".": { dependencies: [`A`] },
      A: { dependencies: [`B`, `D@X`] },
      B: { dependencies: [`D@X`], peerNames: [`D`] },
    }
    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(2)
  })

  it(`should honor unhoisted peer dependencies`, () => {
    // . -> A --> B@X
    //        -> C@X -> B@Y
    //   -> B@X
    //   -> C@Y
    // should be hoisted to:
    // . -> A -> C@X -> B@Y
    //   -> B@X
    //   -> C@Y
    const tree = {
      ".": { dependencies: [`A`, `B@X`, `C@Y`] },
      A: { dependencies: [`B@X`, `C@X`], peerNames: [`B`] },
      "C@X": { dependencies: [`B@Y`] },
    }
    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(4)
  })

  it(`should honor peer dependency promise for the same version of dependency`, () => {
    // . -> A -> B -> C
    //   --> B
    // should be hoisted to (B must not be hoisted to the top):
    // . -> A -> B
    //   -> C
    const tree = {
      ".": { dependencies: [`A`], peerNames: [`B`] },
      A: { dependencies: [`B`] },
      B: { dependencies: [`C`] },
    }
    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(3)
  })

  it(`should hoist different copies of a package independently`, () => {
    // . -> A -> B@X -> C@X
    //        -> C@Y
    //   -> D -> B@X -> C@X
    //   -> B@Y
    //   -> C@Z
    // should be hoisted to (top C@X instance must not be hoisted):
    // . -> A -> B@X -> C@X
    //        -> C@Y
    //   -> D -> B@X
    //        -> C@X
    //   -> B@Y
    //   -> C@Z
    const tree = {
      ".": { dependencies: [`A`, `D`, `B@Y`, `C@Z`] },
      A: { dependencies: [`B@X`, `C@Y`] },
      "B@X": { dependencies: [`C@X`] },
      D: { dependencies: [`B@X`] },
    }
    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(4)
  })

  it(`should hoist different copies of a package independently (complicated case)`, () => {
    // . -> A -> B@X -> C@X -> D@X
    //        -> C@Y
    //   -> E -> B@X -> C@X -> D@X
    //   -> F -> G -> B@X -> C@X -> D@X
    //             -> D@Z
    //   -> B@Y
    //   -> D@Y
    //   -> C@Z
    // should be hoisted to (top C@X instance must not be hoisted):
    // . -> A -> B@X →->C@X
    //        -> C@Y
    //        -> D@X
    //   -> E -> B@X
    //        -> C@X
    //        -> D@X
    //   -> F -> B@X -> D@X
    //        -> C@X
    //        -> D@Z
    //   -> B@Y
    //   -> D@Y
    //   -> C@Z
    const tree = {
      ".": { dependencies: [`A`, `E`, `F`, `B@Y`, `C@Z`, `D@Y`] },
      A: { dependencies: [`B@X`, `C@Y`] },
      "B@X": { dependencies: [`C@X`] },
      "C@X": { dependencies: [`D@X`] },
      E: { dependencies: [`B@X`] },
      F: { dependencies: [`G`] },
      G: { dependencies: [`B@X`, `D@Z`] },
    }
    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(4)
  })

  it(`should keep peer dependency promise for the case where the package with same ident is a dependency of parent node`, () => {
    // . -> A -> B@X --> C
    //        -> C@Y
    //   -> B@X --> C
    //   -> C@X
    // B@X cannot be hoisted to the top from A, because its peer dependency promise will be violated in this case
    // `npm` and `yarn v1` will hoist B@X to the top, they have incorrect hoisting
    const tree = {
      ".": { dependencies: [`A`, `B@X#2`, `C@X`] },
      A: { dependencies: [`B@X#1`, `C@Y`] },
      "B@X#1": { dependencies: [`C@Y`], peerNames: [`C`] },
      "B@X#2": { dependencies: [`C@X`], peerNames: [`C`] },
    }
    const hoistedTree = hoist(toTree(tree), { check: true })
    const [A] = Array.from(hoistedTree.dependencies).filter(x => x.name === `A`)
    expect(Array.from(A.dependencies).filter(x => x.name === `B`)).toBeDefined()
  })

  it(`should hoist cyclic peer dependencies`, () => {
    // . -> A -> B -> C --> D
    //             -> D --> E
    //                  --> C
    //             --> E
    //
    //             -> F --> G
    //             -> G
    //        -> C --> D
    //        -> D --> E
    //             --> C
    //        -> E --> C
    // should be hoisted to:
    // . -> A
    //   -> B
    //   -> C
    //   -> D
    //   -> E
    //   -> F
    //   -> G
    const tree = {
      ".": { dependencies: [`A`] },
      A: { dependencies: [`B`, `C`, `D`, `E`] },
      B: { dependencies: [`C`, `D`, `E`, `F`, `G`], peerNames: [`E`] },
      C: { dependencies: [`D`], peerNames: [`D`] },
      D: { dependencies: [`E`, `C`], peerNames: [`E`, `C`] },
      E: { dependencies: [`C`], peerNames: [`C`] },
    }
    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(2)
  })

  it(`should respect transitive peer dependencies mixed with direct peer dependencies`, () => {
    // . -> A -> B -> D --> C
    //                  --> E
    //             -> E
    //             --> C
    //        -> C@X
    //   -> C@Y
    // D cannot be hoisted to the top, otherwise it will use C@Y, instead of C@X
    const tree = {
      ".": { dependencies: [`A`, `C@Y`] },
      A: { dependencies: [`B`, `C@X`] },
      B: { dependencies: [`D`, `E`, `C@X`], peerNames: [`C`] },
      D: { dependencies: [`C@X`, `E`], peerNames: [`C`, `E`] },
    }
    const hoistedTree = hoist(toTree(tree), { check: true })
    const D = Array.from(hoistedTree.dependencies).filter(x => x.name === `D`)
    expect(D).toEqual([])
  })

  it(`should not hoist packages past hoist boundary`, () => {
    // . -> A -> B -> D
    //   -> C -> D
    // If B and C are hoist borders, the result should be:
    // . -> A
    //   -> B -> D
    //   -> C -> D
    const tree = {
      ".": { dependencies: [`A`, `C`] },
      A: { dependencies: [`B`] },
      B: { dependencies: [`D`] },
      C: { dependencies: [`D`] },
    }
    const hoistingLimits = new Map([
      [`.@`, new Set([`C`])],
      [`A@`, new Set([`B`])],
    ])
    expect(getTreeHeight(hoist(toTree(tree), { check: true, hoistingLimits }))).toEqual(3)
  })

  it(`should not hoist multiple package past nohoist root`, () => {
    // . -> A -> B -> C -> D -> E
    // If B is a hoist border, the result should be:
    // . -> A
    //   -> B -> C
    //        -> D
    const tree = {
      ".": { dependencies: [`A`] },
      A: { dependencies: [`B`] },
      B: { dependencies: [`C`] },
      C: { dependencies: [`D`] },
      D: { dependencies: [`E`] },
    }
    const hoistingLimits = new Map([[`A@`, new Set([`B`])]])
    expect(getTreeHeight(hoist(toTree(tree), { check: true, hoistingLimits }))).toEqual(3)
  })

  it(`should hoist a tree which requires multiple passes to get terminal result`, () => {
    // . -> A -> D@X -> F@X -> E@X -> B@Y -> C@Z
    //                             -> C@X
    //                      -> C@Z
    //               -> C@X
    //   -> B@X
    //   -> C@Z
    //   -> D@Y
    //   -> E@Y
    //   -> F@Y
    // We try to hoist everything we can to the `.` node first, we cannot hoist anything
    // Then we try to hoist everything we can to `A` (`C@Z` has a priority, because its more popular), we have:
    // . -> A -> D@X -> C@X
    //        -> F@X
    //        -> E@X -> C@X
    //        -> B@Y
    //        -> C@Z
    //   -> B@X
    //   -> C@Z
    //   -> D@Y
    //   -> E@Y
    //   -> F@Y
    // And now we can hoist `C@Z` from `A`, but we need another pass to do it and the final result will be:
    // . -> A -> D@X -> C@X
    //        -> F@X
    //        -> E@X -> C@X
    //        -> B@Y
    //   -> B@X
    //   -> C@Z
    //   -> D@Y
    //   -> E@Y
    //   -> F@Y
    const tree = {
      ".": { dependencies: [`A`, `B@X`, `C@Z`, `D@Y`, `E@Y`, `F@Y`] },
      A: { dependencies: [`D@X`] },
      "D@X": { dependencies: [`F@X`, `C@X`] },
      "F@X": { dependencies: [`E@X`, `C@Z`] },
      "E@X": { dependencies: [`B@Y`, `C@X`] },
      "B@Y": { dependencies: [`C@Z`] },
    }
    const hoistedTree = hoist(toTree(tree), { check: true })
    const AC = Array.from(Array.from(hoistedTree.dependencies).filter(x => x.name === `A`)[0].dependencies).filter(x => x.name === `C`)
    expect(AC).toEqual([])
  })

  it(`should hoist dependencies that peer dependent on their parent`, () => {
    // . -> C -> A -> B --> A
    // should be hoisted to:
    // . -> A
    //   -> B
    //   -> C
    const tree = {
      ".": { dependencies: [`C`] },
      C: { dependencies: [`A`] },
      A: { dependencies: [`A`, `B`] },
      B: { dependencies: [`A`], peerNames: [`A`] },
    }
    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(2)
  })

  it(`should hoist direct workspace dependencies into non-root workspace`, () => {
    // . -> W1(w) -> W2(w) -> W3(w)-> A@X
    //            -> A@Y
    //   -> W3
    //   -> A@Z
    // The A@X must be hoisted into W2(w)
    // Accessing A via . -> W3 with --preserve-symlinks will result in A@Z,
    // but accessing it via W3(w) will result in A@Y, however if we don't do it,
    // inner workspaces will have multiple unexpected copies of dependencies
    const tree = {
      ".": { dependencies: [`W1(w)`, `W3`, `A@Z`], dependencyKind: HoisterDependencyKind.WORKSPACE },
      "W1(w)": { dependencies: [`W2(w)`, `A@Y`], dependencyKind: HoisterDependencyKind.WORKSPACE },
      "W2(w)": { dependencies: [`W3(w)`], dependencyKind: HoisterDependencyKind.WORKSPACE },
      "W3(w)": { dependencies: [`A@X`], dependencyKind: HoisterDependencyKind.WORKSPACE },
    }

    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(4)
  })

  it(`should hoist dependencies to the top from workspaces that have no hoist borders given there is workspace with hoist borders`, () => {
    // . -> W1(w)| -> A@X --> B
    //             -> B@X
    //   -> W2(w)  -> A@Y --> B
    //             -> B@Y
    // should be hoisted to:
    // . -> W1(w)| -> A@X -->B
    //             -> B@X
    //   -> W2(w)
    //   -> A@Y --> B
    //   -> B@Y

    const tree = {
      ".": { dependencies: [`W1(w)`, `W2(w)`], dependencyKind: HoisterDependencyKind.WORKSPACE },
      "W1(w)": { dependencies: [`A@X`, `B@X`], dependencyKind: HoisterDependencyKind.WORKSPACE },
      "A@X": { dependencies: [`B@X`], peerNames: [`B`] },
      "A@Y": { dependencies: [`B@Y`], peerNames: [`B`] },
      "W2(w)": { dependencies: [`A@Y`, `B@Y`], dependencyKind: HoisterDependencyKind.WORKSPACE },
    }

    const hoistingLimits = new Map([[`.@`, new Set([`W1(w)`])]])

    const hoistedTree = hoist(toTree(tree), { check: true, hoistingLimits })
    const W2 = Array.from(Array.from(hoistedTree.dependencies).filter(x => x.name === `W2(w)`)[0].dependencies)
    expect(W2).toEqual([])
  })

  it(`should hoist aliased packages`, () => {
    const tree = {
      ".": { dependencies: [`Aalias`] },
      Aalias: { identName: `A`, dependencies: [`A`] },
      A: { dependencies: [`B`] },
    }
    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(3)
  })

  it(`should not hoist portal with unhoistable dependencies`, () => {
    const tree = {
      ".": { dependencies: [`P1`, `B@Y`] },
      P1: { dependencies: [`P2`], dependencyKind: HoisterDependencyKind.EXTERNAL_SOFT_LINK },
      P2: { dependencies: [`B@X`], dependencyKind: HoisterDependencyKind.EXTERNAL_SOFT_LINK },
    }
    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(3)
  })

  it(`should hoist nested portals with hoisted dependencies`, () => {
    const tree = {
      ".": { dependencies: [`P1`, `B@X`] },
      P1: { dependencies: [`P2`, `B@X`], dependencyKind: HoisterDependencyKind.EXTERNAL_SOFT_LINK },
      P2: { dependencies: [`P3`, `B@X`], dependencyKind: HoisterDependencyKind.EXTERNAL_SOFT_LINK },
      P3: { dependencies: [`B@X`], dependencyKind: HoisterDependencyKind.EXTERNAL_SOFT_LINK },
    }
    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(2)
  })

  it(`should support two branch circular graph hoisting`, () => {
    // . -> B -> D@X -> F@X
    //               -> E@X -> D@X
    //                      -> F@X
    //   -> C -> D@Y -> F@Y
    //               -> E@Y -> D@Y
    //                      -> F@Y
    // This graph with two similar circular branches should be hoisted in a finite time
    const tree = {
      ".": { dependencies: [`B`, `C`] },
      B: { dependencies: [`D@X`] },
      C: { dependencies: [`D@Y`] },
      "D@X": { dependencies: [`E@X`, `F@X`] },
      "D@Y": { dependencies: [`E@Y`, `F@X`] },
      "E@X": { dependencies: [`D@X`, `F@X`] },
      "E@Y": { dependencies: [`D@Y`, `F@Y`] },
    }
    expect(getTreeHeight(hoist(toTree(tree), { check: true }))).toEqual(4)
  })
})
