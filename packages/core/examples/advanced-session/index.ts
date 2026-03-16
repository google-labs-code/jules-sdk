import { jules } from '@google/jules-sdk';
import '../_shared/check-env.js';
import { logStream } from '../_shared/log-stream.js';

const session = await jules.session({
  prompt: `Create a simple python script that prints 'Hello Advanced Session!' and test it.`,
});

console.log(`Session created: ${session.id}`);

// Wait for plan approval
await session.waitFor('awaitingPlanApproval');
console.log('Plan ready. Approving...');
await session.approve();

// Non-blocking result notification
session.result().then(outcome => {
  console.log(`\n--- Result ---`);
  console.log(`State: ${outcome.state}`);
  console.log(`PR: ${outcome.pullRequest?.url ?? 'none'}`);
  console.log(`Files: ${outcome.generatedFiles().all().length}`);
});

// Stream all activities with typed handlers
await logStream(session, {
  planGenerated: (a) => console.log('Plan:', a.plan?.steps.map(s => s.title)),
  agentMessaged: (a) => console.log('Agent:', a.message),
  progressUpdated: (a) => console.log(`Progress: ${a.title}`),
  sessionCompleted: () => console.log('Session complete!'),
});

// After streaming, the cache is populated — demonstrate jules.select()
const agentMessages = await jules.select({
  from: 'activities',
  where: { type: 'agentMessaged', sessionId: session.id },
  order: 'desc',
  limit: 3,
});

console.log(`\n--- Cached Activities (${agentMessages.length} agent messages) ---`);
for (const msg of agentMessages) {
  if (msg.type === 'agentMessaged') {
    console.log(`  ${msg.message.slice(0, 80)}...`);
  }
}
