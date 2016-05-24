declare module "electron-packager-tf" {
  /** Electron-packager Options. */
  export interface ElectronPackagerOptions {
    /** The source directory. */
    dir: string;
    /** The application name. */
    name: string;
    /**
     * Allowed values: linux, win32, darwin, all. Not required if `all` is used.
     * Arbitrary combinations of individual platforms are also supported via a comma-delimited string or array of strings.
     */
    platform?: string | string[];
    /** Allowed values: ia32, x64, all Not required if `all` is used. */
    arch?: string;
    /** Electron version (without the "v"). See https://github.com/atom/electron/releases. */
    version: string;

    /** Shortcut for `--arch=all --platform=all`. */
    all?: boolean;
    /** The output directory. */
    out?: string;
    /**
     * Currently you must look for conversion tools in order to supply an icon in the format required by the platform:
     * - OS X: `.icns`
     * - Windows: `.ico`
     *
     * For Linux builds, this option is not required, as the dock/window list icon is set via the icon option in the BrowserWindow contructor.
     * Setting the icon in the file manager is not currently supported.
     *
     * If the file extension is omitted, it is auto-completed to the correct extension based on the platform,
     * including when `--platform=all` is in effect.
     */
    icon?: string;

    /** The bundle identifier to use in the app plist. */
      "app-bundle-id"?: string;
    /** The release version to set for the app. */
      "app-version"?: string;
    /** The build version to set for the app (OS X only). */
      "build-version"?: string;
    /** The bundle identifier to use in the app helper plist. */
      "helper-bundle-id"?: string;
    /** Object hash of application metadata to embed into the executable (Windows only). */
      "version-string"?: VersionString;

    /** The directory of cached electron downloads. Defaults to "$HOME/.electron". */
    cache?: string;
    /** Do not copy files into App whose filenames regex .match this string. */
    ignore?: RegExp;
    /** Runs `npm prune --production` on the app. */
    prune?: boolean;
    /** If output directory for a platform already exists, replaces it rather than skipping it. */
    overwrite?: boolean;
    /** Packages the source code within your app into an archive. */
    asar?: boolean;
    /** Unpacks the files to app.asar.unpacked directory whose filenames regex .match this string. */
      "asar-unpack"?: string;
    /** Should contain the identity to be used when running `codesign` (OS X only). */
    sign?: string;

    "app-copyright"?: string

    generateFinalBasename: (context: any) => void
  }

  /** Object hash of application metadata to embed into the executable (Windows only). */
  export interface VersionString {
    CompanyName?: string;
    LegalCopyright?: string;
    FileDescription?: string;
    OriginalFilename?: string;
    FileVersion?: string;
    ProductVersion?: string;
    ProductName?: string;
    InternalName?: string;
  }
  
  export function pack(opts: ElectronPackagerOptions): Promise<string[]>
}