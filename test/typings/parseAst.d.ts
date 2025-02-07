
import type { ParseAst, ParseAstAsync } from 'rollup/parseAst';

declare module 'rollup/parseAst' {
  export const parseAst: ParseAst;
  export const parseAstAsync: ParseAstAsync;
}

declare global {
  export const parseAst: ParseAst;
  export const parseAstAsync: ParseAstAsync;
}