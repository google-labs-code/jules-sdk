# Jules API Discovery Document - Daily Sync Report

**Date:** 2026-02-22
**Status:** 🔴 BREAKING DRIFT

---

## 1. Discrepancies Found

### Session Resource (Breaking)
*   **Missing Field:** The `source` object (type `Source`) is defined in the SDK's `SessionResource` (`packages/core/src/types.ts`) but is completely absent from the Discovery Document's `Session` resource. The API only returns `sourceContext`. This field will be `undefined` at runtime.
*   **Additive Fields:** The Discovery Document includes `requirePlanApproval` (boolean), `automationMode` (enum), and `archived` (boolean) which are missing from the SDK's `SessionResource`.
*   **SourceContext Additions:** The Discovery Document includes `workingBranch` and `environmentVariablesEnabled` in `SourceContext`, which are missing from the SDK.

### Artifacts (Breaking)
*   **Media Artifact:** The Discovery Document uses `mimeType` instead of `format`. The SDK expects `format`.
*   **BashOutput Artifact:** The Discovery Document uses a single `output` field (combining stdout/stderr) instead of separate `stdout` and `stderr` fields. The SDK expects separate fields.

### Enums (Potential Drift)
*   **SessionState:** The Discovery Document defines state values in `SCREAMING_SNAKE_CASE` (e.g., `STATE_UNSPECIFIED`, `QUEUED`), while the SDK `SessionState` type uses `camelCase` (e.g., `unspecified`, `queued`). Unless the API implicitly maps these (unlikely for JSON), the SDK types do not match the runtime values.

## 2. Code Impact

*   **`packages/core/src/types.ts`**:
    *   `SessionResource`: The `source` field is incorrectly typed as `Source` (object) but will be `undefined` at runtime.
    *   `SessionResource`: Missing `requirePlanApproval`, `automationMode`, `archived`.
    *   `SourceContext`: Missing `workingBranch`, `environmentVariablesEnabled`.
    *   `RestMediaArtifact`: Defines `format`, but API returns `mimeType`.
    *   `RestBashOutputArtifact`: Defines `stdout` and `stderr`, but API returns `output`.
    *   `SessionState`: Enum values likely mismatch (`SCREAMING_SNAKE_CASE` vs `camelCase`).

*   **`packages/core/src/mappers.ts`**:
    *   `mapRestArtifactToSdkArtifact`:
        *   **Media Mapping:** `restArtifact.media.format` will be `undefined`.
        *   **BashOutput Mapping:** `restArtifact.bashOutput.stdout` and `stderr` will be `undefined`.

## 3. Actionable Recommendations

*   **Session Resource:**
    *   **Urgent:** Remove the `source` field from `SessionResource` in `types.ts` as it is not returned by the API. If the full source object is needed, the SDK must fetch it separately using `sourceContext.source`.
    *   **Add:** Add `requirePlanApproval`, `automationMode`, `archived` to `SessionResource`.
*   **Artifacts:**
    *   **Media:** Update `RestMediaArtifact` to use `mimeType`. Update `mappers.ts` to map `mimeType` to the SDK's `format` (or update SDK `MediaArtifact` to use `mimeType` as well).
    *   **BashOutput:** Update `RestBashOutputArtifact` to use `output`. Update `mappers.ts` to map `output` to `stdout` (and leave `stderr` empty or parse if possible).
*   **Enums:**
    *   **SessionState:** Update `SessionState` type in `types.ts` to match the API's `SCREAMING_SNAKE_CASE` values, or implement a mapper in `ApiClient` to transform them to `camelCase` before returning.
