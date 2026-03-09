import * as core from '@actions/core';
import * as github from '@actions/github';
import { jules } from '@google/jules-sdk';

async function run() {
  try {
    // 1. Read inputs defined in action.yml
    const prompt = core.getInput('prompt', { required: true });

    // 2. The Jules SDK requires JULES_API_KEY environment variable.
    // GitHub Actions can pass this via `env:` or `with:` which sets an input.
    // If you prefer not to use the environment variable, you can initialize
    // the client specifically:
    // const julesClient = jules.with({ apiKey: core.getInput('api-key') });

    // We will assume JULES_API_KEY is available in the environment,
    // which is the default behavior of the `jules` instance.
    if (!process.env.JULES_API_KEY) {
      throw new Error('JULES_API_KEY environment variable is missing.');
    }

    // 3. Get context about the current repository from the GitHub Action payload
    const context = github.context;
    const owner = context.repo.owner;
    const repo = context.repo.repo;
    const ref = context.ref;

    // Convert refs/heads/main to main
    let baseBranch = 'main';
    if (ref.startsWith('refs/heads/')) {
      baseBranch = ref.replace('refs/heads/', '');
    }

    core.info(`Starting Jules session for ${owner}/${repo} on branch ${baseBranch}`);
    core.info(`Prompt: ${prompt}`);

    // 4. Create a new Jules session
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

    // 5. Monitor the progress
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

    // 6. Wait for the final outcome
    const outcome = await session.result();

    if (outcome.state === 'failed') {
      core.setFailed(`Session failed.`);
      return;
    }

    core.info(`Session finished successfully.`);

    if (outcome.pullRequest) {
      core.info(`Pull Request created: ${outcome.pullRequest.url}`);
      // Set an output that other steps in the workflow can use
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