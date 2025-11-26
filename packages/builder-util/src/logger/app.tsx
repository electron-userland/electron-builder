import * as React from "react";
import { render } from "ink";
import { TaskController } from "./task";
import { RowDashboard } from "./dashboard";
import { ELECTRON_BUILDER_SIGNALS } from "../log";

// eslint-disable-next-line prefer-const
let rerender: () => void;
const tasks: TaskController[] = [];
tasks.push(...Object.values(ELECTRON_BUILDER_SIGNALS).map(signal => new TaskController(signal, () => rerender())));
rerender = () => {
  render(<RowDashboard tasks={tasks.map(t => t.snapshot)} />);
};

// Example usage:
const build = tasks[1]; // BUILDING
build.start();
build.log("Compiling module A...");
build.log("Compiling module B...");
setTimeout(() => build.log("Module C compiled"), 500);
setTimeout(() => build.complete("success"), 1000);
