import * as React from "react";
import { render } from "ink";
import { TaskController } from "./task";
import { TwoColumnDashboard } from "./dashboard";

// Task list
const tasks: TaskController[] = [];

const rerender = () => {
  render(<TwoColumnDashboard tasks={tasks.map(t => t.snapshot)} />);
};

// Create tasks
const build = new TaskController("Build", rerender);
const lint = new TaskController("Lint", rerender);

tasks.push(build, lint);

// Start tasks
build.start();
lint.start();

build.setPayload({ step: "compile", file: "src/a.ts", ok: true });
lint.setPayload({ file: "src/b.ts", warnings: 2 });

let i = 0;
const interval = setInterval(() => {
  build.log(`Building chunk ${i}`);
  build.setProgress(i);
  lint.log(`Linting file ${i}.ts`);
  lint.setProgress(i);

  i += 10;

  if (i > 100) {
    build.success();
    lint.error("Failed lint rules");
    rerender();
    clearInterval(interval);
  } else {
    rerender();
  }
}, 400);
