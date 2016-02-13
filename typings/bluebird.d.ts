// Type definitions for bluebird 2.0.0
// Project: https://github.com/petkaantonov/bluebird
// Definitions by: Bart van der Schoor <https://github.com/Bartvds>, falsandtru <https://github.com/falsandtru>
// Definitions: https://github.com/borisyankov/DefinitelyTyped

declare module 'bluebird' {
  interface Disposer {
  }

  class BluebirdPromise<T> implements Promise<T> {
    constructor(callback: (resolve: (value?: T | PromiseLike<T>) => void, reject: (reason?: Error) => void, onCancel?: (handler: () => void) => void) => void)

    static config(options: any): void

    static all<T>(values: Iterable<T | PromiseLike<T>>): BluebirdPromise<T[]>

    static mapSeries<T>(items: Iterable<T>, mapper: (item: T) => BluebirdPromise<any>): BluebirdPromise<any>

    static reject(error: Error): BluebirdPromise<any>

    static coroutine(generator: Function): Function

    /**
     * Returns a function that will wrap the given `nodeFunction`. Instead of taking a callback, the returned function will return a promise whose fate is decided by the callback behavior of the given node function. The node function should conform to node.js convention of accepting a callback as last argument and calling that callback with error as the first argument and success value on the second argument.
     *
     * If the `nodeFunction` calls its callback with multiple success values, the fulfillment value will be an array of them.
     *
     * If you pass a `receiver`, the `nodeFunction` will be called as a method on the `receiver`.
     */
    static promisify<T>(func: (callback: (err: any, result: T) => void) => void, receiver?: any): () => BluebirdPromise<T>;
    static promisify<T, A1>(func: (arg1: A1, callback: (err: any, result: T) => void) => void, receiver?: any): (arg1: A1) => BluebirdPromise<T>;
    static promisify<T, A1, A2>(func: (arg1: A1, arg2: A2, callback: (err: any, result: T) => void) => void, receiver?: any): (arg1: A1, arg2: A2) => BluebirdPromise<T>;
    static  promisify<T, A1, A2>(func: (arg1: A1, arg2: A2, callback: (error: Error) => void) => void, receiver?: any): (arg1: A1, arg2: A2) => BluebirdPromise<T>;
    static promisify<T, A1, A2, A3>(func: (arg1: A1, arg2: A2, arg3: A3, callback: (err: any, result: T) => void) => void, receiver?: any): (arg1: A1, arg2: A2, arg3: A3) => BluebirdPromise<T>;
    static promisify<T, A1, A2, A3, A4>(func: (arg1: A1, arg2: A2, arg3: A3, arg4: A4, callback: (err: any, result: T) => void) => void, receiver?: any): (arg1: A1, arg2: A2, arg3: A3, arg4: A4) => BluebirdPromise<T>;
    static promisify<T, A1, A2, A3, A4, A5>(func: (arg1: A1, arg2: A2, arg3: A3, arg4: A4, arg5: A5, callback: (err: any, result: T) => void) => void, receiver?: any): (arg1: A1, arg2: A2, arg3: A3, arg4: A4, arg5: A5) => BluebirdPromise<T>;
    static promisify(nodeFunction: Function, receiver?: any): Function;

    static resolve<T>(value: T | PromiseLike<T>): BluebirdPromise<T>
    static resolve(): BluebirdPromise<void>

    then<R>(fulfilled: (value: T) => R | PromiseLike<R>, rejected?: (reason: any) => R | PromiseLike<R>): BluebirdPromise<R>

    //noinspection ReservedWordAsName
    catch(onrejected?: (reason: any) => T | PromiseLike<T>): BluebirdPromise<T>
    //noinspection ReservedWordAsName
    catch(onrejected?: (reason: any) => void): BluebirdPromise<T>;

    [Symbol.toStringTag]: any

    disposer(disposer: (result: T, promise: Promise<any>) => Promise<any> | void): Disposer

    thenReturn<T>(result: T): BluebirdPromise<T>

    cancel(): void

    isFulfilled(): boolean

    value(): T
  }

  export { BluebirdPromise as Promise }
}