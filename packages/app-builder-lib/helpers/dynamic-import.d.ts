export declare function dynamicImport(path: string): Promise<any>;
/** Like {@link dynamicImport()}, except it tries out {@link require()} first. */
export declare function dynamicImportMaybe(path: string): Promise<any>;