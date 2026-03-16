import { jules } from '@google/jules-sdk';
import { stitch } from '@google/stitch-sdk';
import { resolveSource } from '../_shared/resolve-source.js';
import '../_shared/check-env.js';

if (!process.env.STITCH_API_KEY) {
  console.error('Set STITCH_API_KEY to run this example.');
  process.exit(1);
}

const source = resolveSource();
const REACT_SKILL = 'https://raw.githubusercontent.com/vercel-labs/agent-skills/refs/heads/main/skills/react-best-practices/AGENTS.md';

console.log(`--- Jules + Stitch Integration ---`);
console.log(`Repo: ${source.github} | Branch: ${source.baseBranch}\n`);

// 1. Generate a design with Stitch
console.log('Generating design with Stitch...');
const project = await stitch.createProject('Jules Integration Example');
const screen = await project.generate(
  'A hero section with a dark theme, a large title, a subtitle, and a call-to-action button.',
);

// getHtml() returns the full HTML document (Tailwind CDN-based)
const html = await screen.getHtml();
console.log(`Stitch HTML generated (${html.length} chars)\n`);

// 2. Send to Jules for React + Tailwind v4 conversion
const session = await jules.session({
  prompt: `Convert the following Stitch design into a React component using Tailwind v4.

## Stitch Design (Full HTML with Tailwind CDN)
\`\`\`html
${html}
\`\`\`

## Agent Skill
Follow the React Best Practices skill: ${REACT_SKILL}

## Requirements
1. Create a well-structured React component from the design.
2. Migrate the CDN-based Tailwind classes to Tailwind v4 (CSS-first config, \`@theme\` block).
3. Use TypeScript and semantic HTML.
4. Ensure accessibility (ARIA labels, keyboard navigation).
5. Export the component and its types.`,
  source,
  autoPr: true,
});

console.log(`Session created: ${session.id}`);

// Non-blocking result notification
session.result().then(outcome => {
  console.log(`\n--- Result ---`);
  console.log(`State: ${outcome.state}`);
  console.log(`PR: ${outcome.pullRequest?.url ?? 'none'}`);
  console.log(`Files: ${outcome.generatedFiles().all().length}`);
});

for await (const activity of session.stream()) {
  switch (activity.type) {
    case 'planGenerated':
      console.log('\n[PLAN]');
      activity.plan.steps.forEach((step, i) => console.log(`  ${i + 1}. ${step.title}`));
      break;
    case 'progressUpdated':
      console.log(`[PROGRESS] ${activity.title}`);
      break;
    case 'agentMessaged':
      console.log(`[AGENT] ${activity.message}`);
      break;
    case 'sessionCompleted':
      console.log('[COMPLETE]');
      break;
  }
}
