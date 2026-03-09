import { jules, JulesError } from '@google/jules-sdk';

/**
 * Advanced Session Example
 *
 * Demonstrates:
 * - Interactive session creation
 * - Waiting for plan approval
 * - Monitoring progress via reactive streams
 * - Handling code diffs (changeSet)
 */
async function runAdvancedSession() {
  try {
    console.log('Starting advanced session...');

    // Interactive Sessions allow you to provide feedback and guide the process
    const session = await jules.session({
      prompt: `Create a simple python script that prints 'Hello Advanced Session!' and test it.`,
      // For a repoless session, we don't provide a source
    });

    console.log(`Session created: ${session.id}`);

    // Wait for the plan to be generated and ready for approval
    console.log('Waiting for plan approval...');
    await session.waitFor('awaitingPlanApproval');

    console.log('Plan is ready. Approving it now.');
    await session.approve();

    // Stream activities and artifacts
    for await (const activity of session.stream()) {
      switch (activity.type) {
        case 'planGenerated':
          console.log(
            'Plan:',
            activity.plan?.steps.map((s) => s.title)
          );
          break;
        case 'agentMessaged':
          console.log('Agent says:', activity.message);
          break;
        case 'progressUpdated':
          console.log(`Progress: ${activity.title}`);
          break;
        case 'sessionCompleted':
          console.log('Session complete!');
          break;
      }

      // Check artifacts
      for (const artifact of activity.artifacts ?? []) {
        if (artifact.type === 'bashOutput') {
          console.log(`[BASH] ${artifact.toString()}`);
        }
        if (artifact.type === 'changeSet') {
          const parsed = artifact.parsed();
          for (const file of parsed.files) {
            console.log(
              `[DIFF] ${file.path}: +${file.additions} -${file.deletions}`
            );
          }
        }
      }
    }

    const outcome = await session.result();
    console.log(`Session finished with state: ${outcome.state}`);

  } catch (error) {
    if (error instanceof JulesError) {
      console.error(`SDK error: ${error.message}`);
    } else {
      console.error('Unknown error:', error);
    }
  }
}

if (require.main === module) {
  runAdvancedSession();
}
