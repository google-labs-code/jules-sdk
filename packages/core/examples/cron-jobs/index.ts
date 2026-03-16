import { jules } from '@google/jules-sdk';
import { stitch } from '@google/stitch-sdk';
import cron from 'node-cron';
import '../_shared/check-env.js';
import { logStream } from '../_shared/log-stream.js';

if (!process.env.STITCH_API_KEY) {
  console.error('Set STITCH_API_KEY to run this example.');
  process.exit(1);
}

const STITCH_PROJECT_ID = process.env.STITCH_PROJECT_ID!;
const GITHUB_REPO = process.env.GITHUB_REPO;
const REACT_SKILL_URL = 'https://raw.githubusercontent.com/vercel-labs/agent-skills/refs/heads/main/skills/react-best-practices/AGENTS.md';

// Track which screens have already been processed
const processedScreenIds = new Set<string>();

async function processNewScreens() {
  console.log(`\n[${new Date().toISOString()}] Checking for new Stitch screens...`);

  const project = stitch.project(STITCH_PROJECT_ID);
  const screens = await project.screens();

  const newScreens = screens.filter((s: { id: string }) => !processedScreenIds.has(s.id));
  if (newScreens.length === 0) {
    console.log('No new screens to process.');
    return;
  }

  console.log(`Found ${newScreens.length} new screen(s).`);

  for (const screen of newScreens) {
    console.log(`\nProcessing screen: ${screen.id}`);
    const html = await screen.getHtml();

    const session = await jules.session({
      prompt: `Convert the following Stitch design to a React component using best practices.

## Design Export
${html}

## Agent Skill
Follow the React Best Practices skill at: ${REACT_SKILL_URL}

1. Create a well-structured React component matching this design.
2. Use TypeScript, semantic HTML, and CSS modules or styled-components.
3. Ensure accessibility (ARIA labels, keyboard navigation).
4. Export the component and its types.`,
      ...(GITHUB_REPO && { source: { github: GITHUB_REPO, baseBranch: 'main' } }),
      autoPr: true,
    });

    console.log(`Session created: ${session.id}`);

    // Non-blocking result notification
    session.result().then(outcome => {
      console.log(`\n--- [${screen.id}] Result ---`);
      console.log(`State: ${outcome.state}`);
      console.log(`PR: ${outcome.pullRequest?.url ?? 'none'}`);
      console.log(`Files: ${outcome.generatedFiles().all().length}`);
    });

    await logStream(session, {
      agentMessaged: (a) => console.log(`  Agent: ${a.message.slice(0, 120)}`),
      progressUpdated: (a) => console.log(`  Progress: ${a.title}`),
    });

    processedScreenIds.add(screen.id);
    console.log(`Screen ${screen.id} processed and marked.`);
  }
}

console.log('Stitch→Jules cron scheduler started (every 5 min). Ctrl+C to exit.');

cron.schedule('*/5 * * * *', () => {
  processNewScreens().catch(console.error);
});
