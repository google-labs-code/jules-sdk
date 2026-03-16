import * as core from '@actions/core';
import * as github from '@actions/github';
import { jules } from '@google/jules-sdk';
import '../_shared/check-env.js';

const REACT_SKILL = 'https://raw.githubusercontent.com/vercel-labs/agent-skills/refs/heads/main/skills/react-best-practices/AGENTS.md';

async function run() {
  const context = github.context;
  const owner = context.repo.owner || process.env.GITHUB_REPOSITORY?.split('/')[0] || 'unknown';
  const repo = context.repo.repo || process.env.GITHUB_REPOSITORY?.split('/')[1] || 'unknown';
  const baseBranch = (context.ref || process.env.GITHUB_REF || 'refs/heads/main').replace('refs/heads/', '');

  core.info(`Starting Jules session for ${owner}/${repo} on ${baseBranch}`);

  const session = await jules.session({
    prompt: `Analyze this repository and suggest Agent Skills to improve automation.
Use the Agent Skills specification at https://agentskills.io/specification.md and
the React Best Practices skill at ${REACT_SKILL} as references.

Tasks:
1. Review the repository structure, code, and workflows.
2. Identify 1-3 areas where an Agent Skill could help.
3. Create the corresponding Agent Skills configuration files.
4. Explain what each skill does and why it's useful.`,
    source: { github: `${owner}/${repo}`, baseBranch },
    autoPr: true,
  });

  core.info(`Session created: ${session.id}`);

  session.result().then(outcome => {
    core.info(`--- Result ---`);
    core.info(`State: ${outcome.state}`);
    if (outcome.pullRequest) {
      core.info(`PR: ${outcome.pullRequest.url}`);
      core.setOutput('pr-url', outcome.pullRequest.url);
    }
    core.info(`Files: ${outcome.generatedFiles().all().length}`);
    if (outcome.state === 'failed') core.setFailed('Session failed.');
  });

  for await (const activity of session.stream()) {
    switch (activity.type) {
      case 'planGenerated':
        core.info(`[Plan] ${activity.plan.steps.length} steps`);
        break;
      case 'progressUpdated':
        core.info(`[Progress] ${activity.title}`);
        break;
      case 'sessionCompleted':
        core.info('[Complete]');
        break;
    }
  }
}

run().catch(e => core.setFailed(e instanceof Error ? e.message : 'Unknown error'));
