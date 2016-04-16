declare module "deep-assign" {
  function deepAssign<T, U>(target: T, source: U): T & U

  export = deepAssign
}