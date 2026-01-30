# Getting Started with Jules SDK

The Jules SDK allows you to orchestrate fleet of coding agents in the cloud. This guide will help you get set up and running your first session.

## Installation

Install the package using npm (or your preferred package manager):

```bash
npm i @google/jules-sdk
```

## Configuration

The SDK requires an API key to authenticate with the Jules service. You can obtain one from the [Google Cloud Console](https://console.cloud.google.com).

Set the API key as an environment variable:

```bash
export JULES_API_KEY=<your-api-key>
```

Alternatively, you can pass the key programmatically (not recommended for production code committed to version control):

```typescript
import { jules } from '@google/jules-sdk';

// Using a custom client instance
const client = jules.with({ apiKey: 'your-api-key' });
```

## Your First Session

Here is a minimal example of creating a session that fixes a simple bug in a GitHub repository.

```typescript
import { jules } from '@google/jules-sdk';

async function main() {
  // 1. Start a session
  console.log('Starting session...');
  const session = await jules.session({
    prompt: 'Update the README to include a "Contributing" section.',
    source: {
      github: 'your-username/your-repo',
      baseBranch: 'main'
    },
    autoPr: true // Automatically create a Pull Request when done
  });

  console.log(`Session created: ${session.id}`);

  // 2. Monitor progress
  for await (const activity of session.stream()) {
    if (activity.type === 'planGenerated') {
      console.log('Plan generated with', activity.plan.steps.length, 'steps');
    } else if (activity.type === 'progressUpdated') {
      console.log('Progress:', activity.title);
    } else if (activity.type === 'sessionCompleted') {
      console.log('Session completed successfully!');
    }
  }

  // 3. Get the result
  const outcome = await session.result();
  if (outcome.pullRequest) {
    console.log(`Pull Request created: ${outcome.pullRequest.url}`);
  }
}

main().catch(console.error);
```

## Next Steps

- **[Sessions](./sessions.md)**: Learn about interactive vs. automated sessions.
- **[Streaming](./streaming.md)**: Observe agent activity in real-time.
- **[Artifacts](./artifacts.md)**: Work with code changes, shell output, and images.
- **[Configuration](./configuration.md)**: Advanced SDK configuration.
