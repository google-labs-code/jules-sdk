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
import { SessionCheckInputSchema } from '../conflicts/session-spec.js';
import { SessionCheckHandler } from '../conflicts/session-handler.js';
import { GitCheckInputSchema } from '../conflicts/git-spec.js';
import { GitCheckHandler } from '../conflicts/git-handler.js';
import { createOctokit } from '../shared/github.js';
import { createJulesClient } from '../shared/session.js';

export default defineCommand({
  meta: {
    name: 'check-conflicts',
    description:
      'Check for merge conflicts between a Jules session and the remote base branch, or parse an existing CI merge failure.',
  },
  args: {
    // Session mode args
    session: {
      type: 'string',
      description: 'Jules session ID (triggers session mode)',
    },
    repo: {
      type: 'string',
      description: 'Repository in owner/repo format',
    },
    base: {
      type: 'string',
      description: 'Base branch (session mode only)',
      default: 'main',
    },
    // Git mode args
    pr: {
      type: 'string',
      description: 'Pull request number (triggers git mode)',
    },
    sha: {
      type: 'string',
      description: 'Failing commit SHA (git mode only)',
    },
  },
  async run({ args }) {
    // Infer mode from which arguments are present
    const isSessionMode = !!args.session;
    const isGitMode = !!args.pr;

    if (!isSessionMode && !isGitMode) {
      console.error(
        'Either --session (session mode) or --pr (git mode) is required.',
      );
      process.exit(2);
    }

    if (isSessionMode && isGitMode) {
      console.error('Cannot use both --session and --pr. Pick one mode.');
      process.exit(2);
    }

    let result: any;

    if (isSessionMode) {
      if (!args.repo) {
        console.error('--repo is required in session mode.');
        process.exit(2);
      }
      const input = SessionCheckInputSchema.parse({
        sessionId: args.session,
        repo: args.repo,
        base: args.base,
      });
      const handler = new SessionCheckHandler(createOctokit(), createJulesClient);
      result = await handler.execute(input);
    } else {
      if (!args.repo || !args.sha) {
        console.error('--repo and --sha are required in git mode.');
        process.exit(2);
      }
      const input = GitCheckInputSchema.parse({
        repo: args.repo,
        pullRequestNumber: parseInt(args.pr!, 10),
        failingCommitSha: args.sha,
      });
      const handler = new GitCheckHandler();
      result = await handler.execute(input);
    }

    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.success ? 0 : 1);
  },
});
