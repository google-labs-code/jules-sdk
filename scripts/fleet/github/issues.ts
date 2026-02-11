import { Octokit } from "octokit";
import { cachePlugin } from "./cache-plugin.js";

/** Octokit with built-in ETag caching */
export const CachedOctokit = Octokit.plugin(cachePlugin) as typeof Octokit;

/** Fetch open issues from a public repo */
export async function getIssues(
  owner: string,
  repo: string,
  options?: { perPage?: number; state?: "open" | "closed" | "all" }
) {
  const octokit = new CachedOctokit({
    auth: process.env.GITHUB_TOKEN,
  });
  const { data } = await octokit.rest.issues.listForRepo({
    owner,
    repo,
    state: options?.state ?? "open",
    per_page: options?.perPage ?? 30,
  });
  return data.filter((issue) => !issue.pull_request);
}

export { cachePlugin } from "./cache-plugin.js";
