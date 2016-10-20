declare module "chalk" {
  let enabled: boolean;
  let supportsColor: boolean;
  let styles: ChalkStyleMap;

  export function stripColor(value: string): any;

  export function hasColor(str: string): boolean;

  export interface ChalkChain extends ChalkStyle {
    (...text: string[]): string;
  }

  export interface ChalkStyleElement {
    open: string;
    close: string;
  }

  // General
  let reset: ChalkChain;
  let bold: ChalkChain;
  let italic: ChalkChain;
  let underline: ChalkChain;
  let inverse: ChalkChain;
  let strikethrough: ChalkChain;
  let dim: ChalkChain;

  // Text colors
  let black: ChalkChain;
  let red: ChalkChain;
  let green: ChalkChain;
  let yellow: ChalkChain;
  let blue: ChalkChain;
  let magenta: ChalkChain;
  let cyan: ChalkChain;
  let white: ChalkChain;
  let gray: ChalkChain;
  let grey: ChalkChain;

  // Background colors
  let bgBlack: ChalkChain;
  let bgRed: ChalkChain;
  let bgGreen: ChalkChain;
  let bgYellow: ChalkChain;
  let bgBlue: ChalkChain;
  let bgMagenta: ChalkChain;
  let bgCyan: ChalkChain;
  let bgWhite: ChalkChain;


  export interface ChalkStyle {
    // General
    reset: ChalkChain;
    bold: ChalkChain;
    italic: ChalkChain;
    underline: ChalkChain;
    inverse: ChalkChain;
    strikethrough: ChalkChain;

    // Text colors
    black: ChalkChain;
    red: ChalkChain;
    green: ChalkChain;
    yellow: ChalkChain;
    blue: ChalkChain;
    magenta: ChalkChain;
    cyan: ChalkChain;
    white: ChalkChain;
    gray: ChalkChain;
    grey: ChalkChain;

    // Background colors
    bgBlack: ChalkChain;
    bgRed: ChalkChain;
    bgGreen: ChalkChain;
    bgYellow: ChalkChain;
    bgBlue: ChalkChain;
    bgMagenta: ChalkChain;
    bgCyan: ChalkChain;
    bgWhite: ChalkChain;
  }

  export interface ChalkStyleMap {
    // General
    reset: ChalkStyleElement;
    bold: ChalkStyleElement;
    italic: ChalkStyleElement;
    underline: ChalkStyleElement;
    inverse: ChalkStyleElement;
    strikethrough: ChalkStyleElement;

    // Text colors
    black: ChalkStyleElement;
    red: ChalkStyleElement;
    green: ChalkStyleElement;
    yellow: ChalkStyleElement;
    blue: ChalkStyleElement;
    magenta: ChalkStyleElement;
    cyan: ChalkStyleElement;
    white: ChalkStyleElement;
    gray: ChalkStyleElement;

    // Background colors
    bgBlack: ChalkStyleElement;
    bgRed: ChalkStyleElement;
    bgGreen: ChalkStyleElement;
    bgYellow: ChalkStyleElement;
    bgBlue: ChalkStyleElement;
    bgMagenta: ChalkStyleElement;
    bgCyan: ChalkStyleElement;
    bgWhite: ChalkStyleElement;
  }
}

