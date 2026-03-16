import { jules, Outcome } from '@google/jules-sdk';

/**
 * Runs the review session with the extracted GitPatch.
 * Streams progress and collects the review message from the agent.
 */
export async function reviewCode(
  originalPrompt: string,
  gitPatch: string
): Promise<{ outcome: Outcome; reviewMessage: string }> {
  console.error('\n--- Step 3: Review Session ---');

  const session = await jules.session({
    prompt: `
You are an expert code reviewer. Review the following GitPatch.

### Original Goals
${originalPrompt}

### GitPatch
\`\`\`diff
${gitPatch}
\`\`\`

Provide: Goal Satisfaction, Code Quality, Final Verdict (Pass/Fail).
`,
  });

  console.error(`Review session: ${session.id}`);

  let reviewMessage = '';

  session.result().then(outcome => {
    console.error(`Review session ${outcome.state}.`);
  });

  for await (const activity of session.stream()) {
    if (activity.type === 'agentMessaged') {
      reviewMessage = activity.message;
      console.error(`[Review]: ${activity.message.slice(0, 100)}...`);
    } else if (activity.type === 'progressUpdated') {
      console.error(`[Review] ${activity.title}`);
    }
  }

  // The stream has completed — session is done. Get outcome from the last state.
  const snapshot = await jules.session(session.id).snapshot();

  return {
    outcome: { state: snapshot.state } as Outcome,
    reviewMessage: reviewMessage || 'No feedback provided by the review agent.',
  };
}
