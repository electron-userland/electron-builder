import { TaskController } from "./task";

export const dashboardTasks: Record<string, TaskController> = {};

export const getTask = (label: string) => {
  if (!dashboardTasks[label]) {
    // rerender function will be set later when dashboard is initialized
    dashboardTasks[label] = new TaskController(label, () => rerenderDashboard?.());
  }
  return dashboardTasks[label];
};

let rerenderDashboard: (() => void) | null = null;

export const setDashboardRerender = (fn: () => void) => {
  rerenderDashboard = fn;
};
