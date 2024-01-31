import { JestMatchers } from 'node_modules/@types/jest/index.d.ts'

declare global {
  namespace jest {
    interface Expect<R> {
      toBeOneOf(items: Array<R>): JestMatchers<R>;
      toContainsOneOf(items: Array<R>): JestMatchers<R>;
    }
  }
}
