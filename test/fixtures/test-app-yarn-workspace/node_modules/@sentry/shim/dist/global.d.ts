import { Registry, ScopeLayer } from './interfaces';
/** Returns the global shim registry. */
export declare function getGlobalRegistry(): Registry;
/** Returns the global stack of scope layers. */
export declare function getGlobalStack(): ScopeLayer[];
