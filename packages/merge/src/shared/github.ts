// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Octokit } from '@octokit/rest';

/**
 * GitHub operations layer — all functions accept Octokit as the first argument
 * for dependency injection (no global singletons).
 */

export async function getBranch(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
) {
  const { data } = await octokit.repos.getBranch({ owner, repo, branch });
  return data;
}

export async function getPullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  pull_number: number,
) {
  const { data } = await octokit.pulls.get({ owner, repo, pull_number });
  return data;
}

export async function compareCommits(
  octokit: Octokit,
  owner: string,
  repo: string,
  base: string,
  head: string,
) {
  const { data } = await octokit.repos.compareCommits({
    owner,
    repo,
    base,
    head,
  });
  return data;
}

export async function getContents(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string,
) {
  const { data } = await octokit.repos.getContent({ owner, repo, path, ref });
  if (Array.isArray(data) || data.type !== 'file') {
    throw new Error(`Expected file at ${path}`);
  }
  return {
    content: Buffer.from(data.content, 'base64').toString('utf8'),
    sha: data.sha,
  };
}

export async function getTree(
  octokit: Octokit,
  owner: string,
  repo: string,
  tree_sha: string,
) {
  const { data } = await octokit.git.getTree({ owner, repo, tree_sha });
  return data;
}

export async function createBlob(
  octokit: Octokit,
  owner: string,
  repo: string,
  content: string,
  encoding: 'utf-8' | 'base64' = 'utf-8',
) {
  const { data } = await octokit.git.createBlob({
    owner,
    repo,
    content,
    encoding,
  });
  return data;
}

export async function createTree(
  octokit: Octokit,
  owner: string,
  repo: string,
  base_tree: string,
  tree: any[],
) {
  const { data } = await octokit.git.createTree({
    owner,
    repo,
    base_tree,
    tree,
  });
  return data;
}

export async function createCommit(
  octokit: Octokit,
  owner: string,
  repo: string,
  message: string,
  tree: string,
  parents: string[],
) {
  const { data } = await octokit.git.createCommit({
    owner,
    repo,
    message,
    tree,
    parents,
  });
  return data;
}

export async function createRef(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
  sha: string,
) {
  const { data } = await octokit.git.createRef({ owner, repo, ref, sha });
  return data;
}

export async function updateRef(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
  sha: string,
  force: boolean = false,
) {
  const { data } = await octokit.git.updateRef({
    owner,
    repo,
    ref: ref.replace(/^refs\//, ''),
    sha,
    force,
  });
  return data;
}

export async function createPullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  title: string,
  head: string,
  base: string,
  body?: string,
) {
  const { data } = await octokit.pulls.create({
    owner,
    repo,
    title,
    head,
    base,
    body,
  });
  return data;
}

export async function listPullRequests(
  octokit: Octokit,
  owner: string,
  repo: string,
  head: string,
  base: string,
  state: 'open' | 'closed' | 'all' = 'open',
) {
  const { data } = await octokit.pulls.list({
    owner,
    repo,
    head: `${owner}:${head}`,
    base,
    state,
    per_page: 1,
  });
  return data;
}

export async function getRepo(
  octokit: Octokit,
  owner: string,
  repo: string,
) {
  const { data } = await octokit.repos.get({ owner, repo });
  return data;
}

export async function mergePullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  pull_number: number,
  merge_method: 'merge' | 'squash' | 'rebase' = 'merge',
) {
  const { data } = await octokit.pulls.merge({
    owner,
    repo,
    pull_number,
    merge_method,
  });
  return data;
}

export async function deleteBranch(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
) {
  await octokit.git.deleteRef({ owner, repo, ref: `heads/${branch}` });
}
