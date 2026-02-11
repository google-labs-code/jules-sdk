import path from "node:path";
import { jules } from "@google/jules-sdk";
import { findUpSync } from "find-up";
import type { IssueAnalysis } from "./types.js";

const date = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" })
  .format(new Date())
  .replaceAll("-", "_");

const root = path.dirname(findUpSync("turbo.json")!);
const tasksPath = path.join(root, ".fleet", date, "issue_tasks.json");
const { tasks } = await Bun.file(tasksPath).json() as IssueAnalysis;

// Use jules.all() to create a new session for each task
const sessions = await jules.all(tasks, task => ({
  prompt: task.prompt,
  source: {
    github: "google-labs-code/jules-sdk",
    baseBranch: "main",
  }
}));

for await (const session of sessions) {
  console.log(session.id)
}
