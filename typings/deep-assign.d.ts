declare module "deep-assign" {
  function deepAssign<T, U>(target: T, source: U): T & U

  function deepAssign<T, U>(target: T, source: U, source2: U): T & U

  export = deepAssign
}