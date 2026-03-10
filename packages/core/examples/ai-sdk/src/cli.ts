import { defineCommand, runMain } from 'citty';

const main = defineCommand({
  meta: {
    name: 'ai-sdk-example',
    version: '1.0.0',
    description:
      'A CLI demonstrating Vercel AI SDK integration with Jules SDK using Agent DX principles.',
  },
  subCommands: {
    start: () => import('./commands/start.js').then((m) => m.default),
  },
});

runMain(main);
