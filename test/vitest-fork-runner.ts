import { createBirpc } from "birpc"
import EventEmitter from "node:events"
import * as nodeos from "node:os"
import { resolve } from "node:path"
import v8 from "node:v8"
import type { TinypoolChannel, Options as TinypoolOptions } from "tinypool"
import { Tinypool } from "tinypool"
import { ContextRPC, ContextTestEnvironment, SerializedConfig, WorkerGlobalState } from "vitest"
import { createMethodsRPC, WorkspaceProject, type ProcessPool, type Vitest } from "vitest/node"
import { groupFilesByEnv } from "./vitest-utils"

type WorkerRpc = WorkerGlobalState["rpc"]

type RunWithFiles = (specs: any[], invalidates?: string[]) => Promise<void>

const POOL_NAME = "custom-forks"

function createChildProcessChannel(project: WorkspaceProject) {
  const emitter = new EventEmitter()
  const cleanup = () => emitter.removeAllListeners()

  const events = { message: "message", response: "response" }
  const channel: TinypoolChannel = {
    onMessage: callback => emitter.on(events.message, callback),
    postMessage: message => emitter.emit(events.response, message),
  }

  const rpc: WorkerRpc = createBirpc(createMethodsRPC(project, { cacheFs: true }), {
    eventNames: ["onCancel"],
    serialize: v8.serialize,
    deserialize: v => v8.deserialize(Buffer.from(v)),
    post(v) {
      emitter.emit(events.message, v)
    },
    on(fn) {
      emitter.on(events.response, fn)
    },
    onTimeoutError(functionName) {
      throw new Error(`[vitest-pool]: Timeout calling "${functionName}"`)
    },
  })

  project.vitest.onCancel(reason => rpc.onCancel(reason))

  return { channel, cleanup }
}


export default function createForksPool(ctx: Vitest, { execArgv, env }): ProcessPool {
  const numCpus = typeof nodeos.availableParallelism === "function" ? nodeos.availableParallelism() : nodeos.cpus().length

  const threadsCount = ctx.config.watch ? Math.max(Math.floor(numCpus / 2), 1) : Math.max(numCpus - 1, 1)

  const poolOptions = ctx.config.poolOptions?.forks ?? {}

  const maxThreads = poolOptions.maxForks ?? ctx.config.maxWorkers ?? threadsCount
  const minThreads = poolOptions.minForks ?? ctx.config.minWorkers ?? threadsCount

  const worker = resolve(ctx.distPath, "workers/forks.js")

  const options: TinypoolOptions = {
    runtime: "child_process",
    filename: resolve(ctx.distPath, "worker.js"),

    maxThreads,
    minThreads,

    env,
    execArgv: [...(poolOptions.execArgv ?? []), ...execArgv],

    terminateTimeout: ctx.config.teardownTimeout,
    concurrentTasksPerWorker: 1,
  }

  const isolated = poolOptions.isolate ?? true

  if (isolated) {
    options.isolateWorkers = true
  }

  if (poolOptions.singleFork || !ctx.config.fileParallelism) {
    options.maxThreads = 1
    options.minThreads = 1
  }

  const pool = new Tinypool(options)

  const runWithFiles = (name: string): RunWithFiles => {
    let id = 0

    async function runFiles(project: WorkspaceProject, config: SerializedConfig, files: string[], environment: ContextTestEnvironment, invalidates: string[] = []) {
      ctx.state.clearFiles(project, files)
      const { channel, cleanup } = createChildProcessChannel(project)
      const workerId = ++id
      const data: ContextRPC = {
        pool: POOL_NAME,
        worker,
        config,
        files,
        invalidates,
        environment,
        workerId,
        projectName: project.name,
        providedContext: project.getProvidedContext(),
      }
      await runTestWithPotentialRetry(data, channel, files, project, cleanup, true)
    }

    return async (specs, invalidates) => {
      // Cancel pending tasks from pool when possible
      ctx.onCancel(() => pool.cancelPendingTasks())

      const configs = new Map<WorkspaceProject, SerializedConfig>()
      const getConfig = (project: WorkspaceProject): SerializedConfig => {
        if (configs.has(project)) {
          return configs.get(project)!
        }

        const config = project.serializedConfig
        configs.set(project, config)
        return config
      }

      const workspaceMap = new Map<string, WorkspaceProject[]>()
      for (const spec of specs) {
        const file = spec.moduleId
        const project = spec.project.workspaceProject
        const workspaceFiles = workspaceMap.get(file) ?? []
        workspaceFiles.push(project)
        workspaceMap.set(file, workspaceFiles)
      }

      const filesByEnv = await groupFilesByEnv(specs)
      const files = Object.values(filesByEnv).flat()
      const results: PromiseSettledResult<void>[] = []
      results.push(...(await Promise.allSettled(files.map(({ file, environment, project }) => runFiles(project, getConfig(project), [file], environment, invalidates)))))

      const errors = results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map(r => r.reason)
      if (errors.length > 0) {
        throw new AggregateError(errors, "Errors occurred while running tests. For more information, see serialized error.")
      }
    }

    async function runTestWithPotentialRetry(
      data: ContextRPC,
      channel: TinypoolChannel,
      files: string[],
      project: WorkspaceProject,
      cleanup: () => EventEmitter<[never]>,
      shouldRetry: boolean
    ) {
      // Handle electron-builder flaky (due to parallel file operations such as hdiutil and EPERM file locks) tests by retrying
      // This is a workaround until we can find a better solution. For now, just slot in a 500ms delay and retry once.
      const isSupposedToRetry = (error: Error) => {
        const { message } = error
        const isOsError = /Command failed: hdiutil/.test(message) || /ERR_ELECTRON_BUILDER_CANNOT_EXECUTE/.test(message) || /EPERM: operation not permitted/.test(message)
        return isOsError && shouldRetry
      }

      try {
        await pool.run(data, { name, channel })
      } catch (error) {
        if (!(error instanceof Error)) {
          throw error
        }

        // Worker got stuck and won't terminate - this may cause process to hang
        if (/Failed to terminate worker/.test(error.message)) {
          ctx.state.addProcessTimeoutCause(`Failed to terminate worker while running ${files.join(", ")}.`)
        }
        // Intentionally cancelled
        else if (
          (ctx as any).isCancelling && // TODO: Remove this when vitest is updated
          /The task has been cancelled/.test(error.message)
        ) {
          ctx.state.cancelFiles(files, project)
        }
        // Flaky test failure
        else if (isSupposedToRetry(error)) {
          await new Promise<void>(resolve => setTimeout(resolve, 500))
          ctx.logger.log(`Retrying test ${files.join(", ")} due to flaky test failure:`, error.message)
          await runTestWithPotentialRetry(data, channel, files, project, cleanup, false)
        } else {
          throw error
        }
      } finally {
        cleanup()
      }
    }
  }

  return {
    name: POOL_NAME,
    runTests: runWithFiles("run"),
    collectTests: runWithFiles("collect"),
    close: () => pool.destroy(),
  }
}
