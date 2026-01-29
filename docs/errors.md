# Error Handling

The Jules SDK uses a typed error hierarchy to make it easy to handle specific failure scenarios programmatically. All errors thrown by the SDK inherit from the base `JulesError` class.

## Error Hierarchy

- `JulesError` (Base class)
  - `JulesNetworkError`
  - `JulesApiError`
    - `JulesAuthenticationError` (401/403)
    - `JulesRateLimitError` (429)
  - `MissingApiKeyError`
  - `SourceNotFoundError`
  - `AutomatedSessionFailedError`
  - `SyncInProgressError`
  - `InvalidStateError`

## Handling Errors

You can catch errors globally or specifically using `instanceof` checks.

```typescript
import {
  jules,
  JulesError,
  JulesAuthenticationError,
  AutomatedSessionFailedError
} from '@google/jules-sdk';

try {
  await jules.run({ ... });
} catch (error) {
  if (error instanceof JulesAuthenticationError) {
    console.error('Invalid API Key. Please check your credentials.');
  } else if (error instanceof AutomatedSessionFailedError) {
    console.error('The session failed to complete the task.');
  } else if (error instanceof JulesError) {
    // Catch-all for other SDK errors
    console.error(`SDK Error: ${error.message}`);
  } else {
    // Unknown system errors
    throw error;
  }
}
```

## Common Errors

### `JulesNetworkError`
Thrown when the SDK cannot reach the Jules API (e.g., DNS failure, offline).

### `JulesAuthenticationError`
Thrown when the API key is missing, invalid, or expired.

### `JulesRateLimitError`
Thrown when you have exceeded the API rate limits. The SDK automatically retries for a period of time before throwing this error.

### `SourceNotFoundError`
Thrown when trying to create a session with a GitHub repository that doesn't exist or is not accessible to the installation.

```typescript
try {
  await jules.session({
    source: { github: 'ghost/does-not-exist', baseBranch: 'main' },
    prompt: '...'
  });
} catch (e) {
  if (e instanceof SourceNotFoundError) {
    console.log("Repo not found!");
  }
}
```

### `InvalidStateError`
Thrown when attempting an operation that is not valid for the current session state (e.g., calling `approve()` on a session that is not waiting for approval).

### `SyncInProgressError`
Thrown when calling `jules.sync()` while another sync operation is already running. The SDK prevents concurrent syncs to avoid data corruption.
