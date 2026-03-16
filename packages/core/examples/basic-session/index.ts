import { jules } from '@google/jules-sdk';
import '../_shared/check-env.js';
import { logStream } from '../_shared/log-stream.js';

const session = await jules.session({
  prompt: 'Analyze the README and suggest three improvements.',
});

console.log(`Session: ${session.id}`);

// Non-blocking result notification
session.result().then(outcome => {
  console.log(`\n--- Result ---`);
  console.log(`State: ${outcome.state}`);
  console.log(`PR: ${outcome.pullRequest?.url ?? 'none'}`);
  console.log(`Files: ${outcome.generatedFiles().all().length}`);
});

// Stream with typed handlers
await logStream(session, {
  agentMessaged: (a) => console.log(`Agent: ${a.message}`),
  progressUpdated: (a) => console.log(`Progress: ${a.title}`),
  planGenerated: (a) => console.log(`Plan: ${a.plan.steps.length} steps`),
  sessionCompleted: () => console.log('Done!'),
});