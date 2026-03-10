import * as core from '@actions/core';
import * as github from '@actions/github';
import { jules } from '@google/jules-sdk';

async function run() {
  try {
    if (!process.env.JULES_API_KEY) {
      throw new Error('JULES_API_KEY environment variable is missing.');
    }

    // 1. Get context about the current repository from the GitHub Action payload
    const context = github.context;
    // In a cron job, context.repo will still point to the repository where the workflow is running
    const owner = context.repo.owner || process.env.GITHUB_REPOSITORY?.split('/')[0] || 'unknown';
    const repo = context.repo.repo || process.env.GITHUB_REPOSITORY?.split('/')[1] || 'unknown';
    const ref = context.ref || process.env.GITHUB_REF || 'refs/heads/main';

    let baseBranch = 'main';
    if (ref.startsWith('refs/heads/')) {
      baseBranch = ref.replace('refs/heads/', '');
    }

    core.info(`Starting Jules session for ${owner}/${repo} on branch ${baseBranch}`);

    // 2. Construct the prompt for generating Agent Skills
    const prompt = `Analyze this repository and suggest Agent Skills to improve automation of common or complex tasks.

Use the Agent Skills specification located at https://agentskills.io/specification.md as a reference for formatting and structuring the skills.

Tasks:
1. Review the repository structure, code, and existing workflows.
2. Identify 1 to 3 areas where an Agent Skill could be beneficial (e.g., code review, automated testing, boilerplate generation, or specific formatting rules).
3. Create the corresponding Agent Skills configuration files (e.g., in a \`.jules/skills\` directory or similar, as per the specification).
4. Provide a brief explanation of what each skill does and why it is useful for this repository.`;

    core.info(`Prompt: ${prompt}`);

    // 3. Create a new Jules session
    const session = await jules.session({
      prompt: prompt,
      source: {
        github: `${owner}/${repo}`,
        baseBranch: baseBranch,
      },
      // Automatically create a PR when the session is complete
      autoPr: true,
    });

    core.info(`Session created successfully. ID: ${session.id}`);

    // 4. Monitor the progress
    for await (const activity of session.stream()) {
      switch (activity.type) {
        case 'planGenerated':
          core.info(`[Plan Generated] ${activity.plan.steps.length} steps.`);
          break;
        case 'progressUpdated':
          core.info(`[Progress Updated] ${activity.title}`);
          break;
        case 'sessionCompleted':
          core.info(`[Session Completed]`);
          break;
      }
    }

    // 5. Wait for the final outcome
    const outcome = await session.result();

    if (outcome.state === 'failed') {
      core.setFailed(`Session failed.`);
      return;
    }

    core.info(`Session finished successfully.`);

    if (outcome.pullRequest) {
      core.info(`Pull Request created: ${outcome.pullRequest.url}`);
      core.setOutput('pr-url', outcome.pullRequest.url);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Action failed with error: ${error.message}`);
    } else {
      core.setFailed(`Action failed with an unknown error.`);
    }
  }
}

run();
