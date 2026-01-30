# SDK Configuration

The Jules SDK is designed to work out-of-the-box with minimal configuration, but offers granular control for advanced use cases.

## Default Client

The simplest way to use the SDK is via the pre-initialized `jules` instance. This instance automatically reads the `JULES_API_KEY` environment variable.

```typescript
import { jules } from '@google/jules-sdk';

const session = await jules.session({ ... });
```

## Custom Clients

If you need multiple configurations (e.g., connecting to different projects or using different API keys), you can create custom client instances using `jules.with()`.

This method creates a **copy** of the client with the new options merged in. It does not mutate the original instance.

```typescript
const customClient = jules.with({
  apiKey: 'another-api-key',
  config: {
    requestTimeoutMs: 60000
  }
});
```

## Configuration Options

### API Key

You can provide the API key explicitly if you are not using environment variables.

```typescript
jules.with({ apiKey: 'YOUR_KEY' });
```

### Polling

The SDK polls the API for updates during streaming and waiting. You can adjust the interval.

```typescript
jules.with({
  config: {
    // Check for updates every 2 seconds (default is 5000ms)
    pollingIntervalMs: 2000
  }
});
```

### Timeouts

Set the maximum duration for individual HTTP requests.

```typescript
jules.with({
  config: {
    // Time out requests after 10 seconds (default is 30000ms)
    requestTimeoutMs: 10000
  }
});
```

### Rate Limit Retries

The SDK automatically handles `429 Too Many Requests` errors with exponential backoff. You can tune this behavior.

```typescript
jules.with({
  config: {
    rateLimitRetry: {
      // Stop retrying after 5 minutes
      maxRetryTimeMs: 300000,
      // Start with a 1 second delay
      baseDelayMs: 1000,
      // Cap the delay at 30 seconds
      maxDelayMs: 30000
    }
  }
});
```

## Interface Reference

```typescript
interface JulesOptions {
  apiKey?: string;
  baseUrl?: string;
  config?: {
    pollingIntervalMs?: number;
    requestTimeoutMs?: number;
    rateLimitRetry?: {
      maxRetryTimeMs?: number;
      baseDelayMs?: number;
      maxDelayMs?: number;
    };
  };
}
```
