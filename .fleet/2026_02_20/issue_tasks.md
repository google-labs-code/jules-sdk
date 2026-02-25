# Issue Analysis: google-labs-code/jules-sdk

> Analyzed 4 issues on 2026-02-20T19:47:44.314Z

## Executive Summary

I found 3 primary root causes across the reported issues: inconsistent configuration handling between `session()` and `run()`, lack of timeout mechanisms in polling operations, and insufficient resilience in the API client (missing 5xx retries and concurrency control). One issue (#18) appears to be a backend constraint but is partially mitigated by fixing the configuration inconsistency (#24).

## Root Cause Analysis

### RC-1: Inconsistent `autoPr` Configuration Mapping

**Related issues:** #24 (Primary), #18 (Related)
**Severity:** Medium
**Files involved:** `packages/core/src/client.ts`

#### Diagnosis

The `jules.run(config)` method correctly maps the `autoPr` configuration to the `automationMode` API field:

```typescript
// packages/core/src/client.ts:537
          automationMode:
            config.autoPr === false
              ? 'AUTOMATION_MODE_UNSPECIFIED'
              : 'AUTO_CREATE_PR',
```

However, `jules.session(config)` hardcodes this value to `AUTOMATION_MODE_UNSPECIFIED`, ignoring the user's `autoPr` setting:

```typescript
// packages/core/src/client.ts:636
            automationMode: 'AUTOMATION_MODE_UNSPECIFIED',
```

This prevents users from initiating sessions that automatically create PRs, which is inconsistent with the documentation and limits flexibility (also impacting #18 by forcing a mode that requires manual approval).

#### Proposed Solution

Update `jules.session(config)` to use the same logic as `jules.run(config)` for determining `automationMode`.

```typescript
// packages/core/src/client.ts
            automationMode:
              config.autoPr === false
                ? 'AUTOMATION_MODE_UNSPECIFIED'
                : 'AUTO_CREATE_PR',
```

#### Test Plan

1.  Verify `jules.session({ autoPr: true })` sends `AUTO_CREATE_PR`.
2.  Verify `jules.session({ autoPr: false })` sends `AUTOMATION_MODE_UNSPECIFIED`.
3.  Verify `jules.session({})` (default) behavior.

---

### RC-2: Infinite Polling in `result()`

**Related issues:** #23
**Severity:** High
**Files involved:** `packages/core/src/polling.ts`, `packages/core/src/session.ts`

#### Diagnosis

The `pollUntilCompletion` function uses an infinite loop (`while (true)`) without any timeout or max attempts check. If the session remains in `IN_PROGRESS` state (e.g., due to a backend stall), the promise never resolves, hanging the application.

```typescript
// packages/core/src/polling.ts:38
export async function pollSession(...) {
  while (true) {
    // ... fetches session ...
    if (predicateFn(session)) return session;
    await sleep(pollingInterval);
  }
}
```

#### Proposed Solution

1.  Add an optional `timeoutMs` parameter to `pollSession` and `pollUntilCompletion`.
2.  Implement a timeout check within the loop or race against a timeout promise.
3.  Update `SessionClient.result()` to accept `{ timeoutMs?: number }` and pass it down.
4.  Throw a `TimeoutError` if the timeout is exceeded.

#### Test Plan

1.  Mock a session that stays `IN_PROGRESS`.
2.  Call `result({ timeoutMs: 100 })`.
3.  Verify it throws `TimeoutError` after ~100ms.

---

### RC-3: API Client Resilience (Missing 5xx Retries & Concurrency Control)

**Related issues:** #20
**Severity:** High
**Files involved:** `packages/core/src/api.ts`

#### Diagnosis

The `ApiClient` currently only retries on `429 Too Many Requests`. It does not retry on transient server errors (500, 502, 503, 504).

```typescript
// packages/core/src/api.ts:114
if (response.status === 429) {
  // ... retries ...
}
// ... throws immediately for other errors ...
```

Additionally, there is no client-side concurrency limiting. When a user spawns 10+ parallel sessions, the client floods the backend, leading to failure (likely 503s or 404s due to overload).

#### Proposed Solution

1.  **5xx Retries**: Expand the retry logic to include 500, 502, 503, and 504 status codes. Use the same exponential backoff strategy as 429.
2.  **Concurrency Control**: Implement a semaphore (e.g., using `p-limit` logic internally) in `ApiClient` to limit the number of concurrent `fetch` requests (e.g., max 50).

#### Test Plan

1.  **Retries**: Mock a 503 response followed by a 200. Verify the client retries and succeeds.
2.  **Concurrency**: Mock a slow endpoint. Fire 100 requests. Verify that only N requests are in flight simultaneously.

## Task Plan

| #   | Task                     | Root Cause | Issues   | Files                                                                                                                                                              | Risk   |
| --- | ------------------------ | ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 1   | `fix-config-consistency` | RC-1       | #24, #18 | `packages/core/src/client.ts`, `packages/core/tests/session.test.ts`                                                                                               | Low    |
| 2   | `add-polling-timeout`    | RC-2       | #23      | `packages/core/src/polling.ts`, `packages/core/src/session.ts`, `packages/core/src/types.ts`, `packages/core/src/errors.ts`, `packages/core/tests/polling.test.ts` | Medium |
| 3   | `improve-api-resilience` | RC-3       | #20      | `packages/core/src/api.ts`, `packages/core/tests/api.test.ts`                                                                                                      | Medium |

## File Ownership Matrix

| File                                  | Task | Change Type |
| ------------------------------------- | ---- | ----------- |
| `packages/core/src/client.ts`         | 1    | Modify      |
| `packages/core/tests/session.test.ts` | 1    | Modify      |
| `packages/core/src/polling.ts`        | 2    | Modify      |
| `packages/core/src/session.ts`        | 2    | Modify      |
| `packages/core/src/types.ts`          | 2    | Modify      |
| `packages/core/src/errors.ts`         | 2    | Modify      |
| `packages/core/tests/polling.test.ts` | 2    | Modify      |
| `packages/core/src/api.ts`            | 3    | Modify      |
| `packages/core/tests/api.test.ts`     | 3    | Modify      |

## Unaddressable Issues

| Issue | Reason                                                                                                                                                                                                                                                                                                                                                 | Suggested Owner |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| #18   | The combination `requireApproval: false` + `AUTOMATION_MODE_UNSPECIFIED` is rejected by the backend with `FAILED_PRECONDITION`. This is a server-side constraint. However, fixing #24 allows users to switch to `AUTO_CREATE_PR` mode (by setting `autoPr: true`), which may bypass this constraint if automation mode is less strict about approvals. | Backend Team    |
