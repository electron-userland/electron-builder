declare module "progress-stream" {
  import ReadWriteStream = NodeJS.ReadWriteStream;
  interface Options {
    time?: number
    length?: number
  }

  interface Progress {
    percentage: number
    delta: number
  }

  function progress(options: Options, onProgress?: (progress: Progress) => void): ReadWriteStream

  export = progress
}