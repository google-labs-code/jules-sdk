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

import { defineCommand } from 'citty';
import { TraceInputSchema } from '../trace/spec.js';
import { TraceHandler } from '../trace/handler.js';
import { createFleetOctokit } from '../shared/auth/octokit.js';
import { getGitRepoInfo } from '../shared/auth/git.js';
import { createRenderer } from '../shared/ui/index.js';

export default defineCommand({
  meta: {
    name: 'trace',
    description:
      'Trace the correlation chain for fleet runs (session → issue → PR)',
  },
  args: {
    session: {
      type: 'string',
      description: 'Jules session ID to trace',
    },
    issue: {
      type: 'string',
      description: 'GitHub issue number to trace',
    },
    milestone: {
      type: 'string',
      description: 'Milestone ID to trace all issues',
    },
    owner: {
      type: 'string',
      description: 'Repository owner (auto-detected from git remote if omitted)',
    },
    repo: {
      type: 'string',
      description: 'Repository name (auto-detected from git remote if omitted)',
    },
    format: {
      type: 'string',
      description: 'Output format: json or md (default: json)',
      default: 'json',
    },
  },
  async run({ args }) {
    const renderer = createRenderer();

    // Auto-detect owner/repo from git remote if not provided
    let owner = args.owner;
    let repo = args.repo;
    if (!owner || !repo) {
      const repoInfo = await getGitRepoInfo();
      owner = owner || repoInfo.owner;
      repo = repo || repoInfo.repo;
    }

    renderer.start(`Fleet Trace — ${owner}/${repo}`);

    const input = TraceInputSchema.parse({
      sessionId: args.session,
      issueNumber: args.issue ? parseInt(args.issue, 10) : undefined,
      milestone: args.milestone,
      repo: `${owner}/${repo}`,
      format: args.format,
    });

    const octokit = createFleetOctokit();
    const handler = new TraceHandler({ octokit });
    const result = await handler.execute(input);

    if (!result.success) {
      renderer.error(result.error.message);
      process.exit(1);
    }

    const { data } = result;

    if (args.format === 'md') {
      // Markdown output
      const lines: string[] = [];
      lines.push(`# Fleet Trace — ${data.repo}`);
      lines.push(`Entry point: **${data.entryPoint}** | Generated: ${data.generatedAt}`);
      lines.push('');

      for (const session of data.sessions) {
        lines.push(`## Session ${session.sessionId}`);
        if (session.dispatchedBy) {
          lines.push(`- **Issue:** #${session.dispatchedBy.issueNumber} — ${session.dispatchedBy.issueTitle}`);
        }
        if (session.pullRequest) {
          lines.push(`- **PR:** #${session.pullRequest.number} — ${session.pullRequest.title} (${session.pullRequest.state}${session.pullRequest.merged ? ', merged' : ''})`);
        }
        if (session.changedFiles.length > 0) {
          lines.push(`- **Files changed:** ${session.changedFiles.length}`);
          for (const f of session.changedFiles) {
            lines.push(`  - ${f}`);
          }
        }
        lines.push('');
      }

      if (data.scores) {
        lines.push('## Scores');
        lines.push(`- Merge success: ${data.scores.mergeSuccess ?? 'N/A'}`);
        lines.push(`- Files changed: ${data.scores.filesChanged}`);
        lines.push(`- Issue linked: ${data.scores.issueLinked}`);
      }

      console.log(lines.join('\n'));
    } else {
      // JSON output
      console.log(JSON.stringify(data, null, 2));
    }

    renderer.end(`Traced ${data.sessions.length} session(s).`);
  },
});
