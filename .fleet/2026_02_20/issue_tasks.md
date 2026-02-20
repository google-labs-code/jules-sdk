# Issue Analysis: google-labs-code/jules-sdk

> Analyzed 4 issues on 2026-02-20T19:22:31.946Z

## Executive Summary

I analyzed 4 open issues, identifying 3 distinct root causes. All issues are addressable within the current codebase. The primary issues involve inconsistent session configuration (#18, #24), polling mechanism hanging indefinitely (#23), and lack of resilience in API clients under load (#20). I have designed 2 consolidated tasks to address these issues, grouping related file modifications to avoid merge conflicts.

## Root Cause Analysis

### RC-1: Inconsistent Session Configuration & Polling

**Related issues:** #18, #23, #24
**Severity:** High
**Files involved:** `packages/core/src/client.ts`, `packages/core/src/session.ts`, `packages/core/src/polling.ts`

#### Diagnosis

1.  **Session Configuration (#18, #24):** The `jules.session()` method hardcodes `automationMode: 'AUTOMATION_MODE_UNSPECIFIED'`, ignoring the `autoPr` configuration option. This leads to inconsistency with documentation and failure when `requireApproval: false` is used (which the backend rejects for unspecified mode).
    ```typescript
    // packages/core/src/client.ts
    const session = await this.apiClient.request<SessionResource>('sessions', {
      method: 'POST',
      body: {
        ...body,
        automationMode: 'AUTOMATION_MODE_UNSPECIFIED', // Hardcoded!
        requirePlanApproval: config.requireApproval ?? true,
      },
    });
    ```
2.  **Polling Hangs (#23):** The `pollSession` function in `polling.ts` uses an infinite `while (true)` loop without any timeout mechanism. If a session enters a zombie state (or backend fails to update state), `result()` hangs forever.
    ```typescript
    // packages/core/src/polling.ts
    export async function pollSession(...) {
      while (true) { // Infinite loop
        // ...
        await sleep(pollingInterval);
      }
    }
    ```

#### Proposed Solution

1.  **Update `session()` logic:** Align `jules.session()` with `jules.run()` to respect `autoPr` and map it to `AUTO_CREATE_PR` or `AUTOMATION_MODE_UNSPECIFIED`. This likely resolves the `requireApproval: false` rejection as well.
2.  **Add Timeout to Polling:** Modify `pollSession` and `pollUntilCompletion` to accept an optional `timeoutMs`. If the timeout is exceeded, throw a `TimeoutError`. Update `SessionClient.result()` and `AutomatedSession.result()` to expose this timeout option.

#### Test Plan

- Verify `jules.session({ autoPr: true })` sends `AUTO_CREATE_PR`.
- Verify `jules.session({ requireApproval: false, autoPr: true })` works.
- Verify `result({ timeoutMs: 100 })` throws `TimeoutError` if session doesn't complete in time.

---

### RC-2: API Client Resilience & Rate Limiting

**Related issues:** #20
**Severity:** Medium
**Files involved:** `packages/core/src/api.ts`, `packages/core/src/sources.ts`

#### Diagnosis

1.  **Missing Jitter:** The `ApiClient` uses exponential backoff for 429s but lacks jitter, leading to thundering herd problems under high concurrency.
2.  **Transient 404s:** `SourceManager.get` returns `undefined` immediately on 404. Under high load or eventual consistency scenarios, this causes "Could not get source" errors for existing sources.

#### Proposed Solution

1.  **Add Jitter:** Update `ApiClient` retry logic to include randomized jitter.
2.  **Retry Source Lookup:** Use `withFirstRequestRetry` in `SourceManager.get` to handle transient 404s before returning `undefined`.

#### Test Plan

- Simulate 429 responses and verify backoff timing includes jitter.
- Simulate transient 404s for source lookup and verify it succeeds after retry.

## Task Plan

| #   | Task                        | Root Cause | Issues        | Files                                                                                         | Risk   |
| --- | --------------------------- | ---------- | ------------- | --------------------------------------------------------------------------------------------- | ------ |
| 1   | Enhance Session Reliability | RC-1       | #18, #23, #24 | `packages/core/src/client.ts`, `packages/core/src/polling.ts`, `packages/core/src/session.ts` | Medium |
| 2   | Enhance API Resilience      | RC-2       | #20           | `packages/core/src/api.ts`, `packages/core/src/sources.ts`                                    | Low    |

## File Ownership Matrix

| File                                    | Task | Change Type |
| --------------------------------------- | ---- | ----------- |
| `packages/core/src/client.ts`           | 1    | Modify      |
| `packages/core/src/polling.ts`          | 1    | Modify      |
| `packages/core/src/session.ts`          | 1    | Modify      |
| `packages/core/tests/session.test.ts`   | 1    | Modify      |
| `packages/core/tests/polling.test.ts`   | 1    | Modify      |
| `packages/core/src/api.ts`              | 2    | Modify      |
| `packages/core/src/sources.ts`          | 2    | Modify      |
| `packages/core/tests/api-retry.test.ts` | 2    | Modify      |
| `packages/core/tests/sources.test.ts`   | 2    | Modify      |

## Unaddressable Issues

None.
