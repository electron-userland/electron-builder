/** The type of a process stack layer. */
export type LayerType = 'process' | 'domain' | 'local';

/** A layer in the process stack. */
export interface ScopeLayer {
  client?: any;
  scope: any;
  type: LayerType;
}

/** An object that contains a shim and maintains a scope stack. */
export interface Registry {
  stack: ScopeLayer[];
  shim?: any;
}
