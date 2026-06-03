export interface NodeModuleInfo {
  readonly name: string
  readonly version: string
  readonly dir: string
  readonly dependencies?: Array<NodeModuleInfo>
}
