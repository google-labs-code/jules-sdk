import { getIssuesAsMarkdown } from "./github/markdown.js";
import { jules } from "@google/jules-sdk";
import { analyzeIssuesPrompt } from "./prompts/analyze-issues.js";

const issuesMarkdown = await getIssuesAsMarkdown("google-labs-code", "jules-sdk");

const prompt = analyzeIssuesPrompt({
  owner: "google-labs-code",
  repo: "jules-sdk",
  issuesMarkdown,
});

console.log(prompt);

const planner_session = await jules.session({
  prompt,
  source: {
    github: "google-labs-code/jules-sdk",
    baseBranch: "ci/issue-fleet",
  },
  autoPr: true
});

console.log(planner_session);
