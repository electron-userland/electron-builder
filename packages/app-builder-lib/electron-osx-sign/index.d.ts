interface BaseSignOptions {
  app: string;
  identity?: string;
  platform?: string;
  keychain?: string;
}

interface SignOptions extends BaseSignOptions {
  binaries?: string[];
  entitlements?: string;
  'entitlements-inherit'?: string;
  'entitlements-loginhelper'?: string;
  'gatekeeper-assess'?: boolean;
  hardenedRuntime?: boolean;
  'identity-validation'?: boolean;
  ignore?: string;
  'pre-auto-entitlements'?: boolean;
  'pre-embed-provisioning-profile'?: boolean;
  'provisioning-profile'?: string;
  'requirements'?: string;
  'signature-size'?: number;
  type?: string;
  version?: string;
}

export function sign(opts: SignOptions, callback: (error: Error) => void): void;

export function signAsync(opts: SignOptions): Promise<any>;

interface FlatOptions extends BaseSignOptions {
  'identity-validation'?: boolean;
  install?: string;
  pkg?: string;
  scripts?: string;
}

export function flat(opts: FlatOptions, callback: (error: Error) => void): void;

export function flatAsync(opts: FlatOptions): Promise<any>;

export function getFilePathIfBinarySync(filePath: string): string | undefined