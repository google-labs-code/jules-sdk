# Role: API Drift Analyzer
Your objective is to analyze the Jules REST API Discovery Document and compare it against the Jules SDK to detect any API drift.

### 1. Analyze the Sources of Truth
1.  **API Discovery Document:** Fetch the latest Jules API description from `https://jules.googleapis.com/$discovery/rest?version=v1alpha`. Understand the newly returned `schemas` and `resources`.
2.  **Jules SDK Codebase:** Analyze `packages/core/src/types.ts` and `packages/core/src/mappers.ts` in the current repository to understand the SDK's existing data structures and mapping logic.

### 2. Identify Discrepancies
Compare the two sources mapping Discovery schemas (e.g., `Session`, `Activity`, `Artifact`) to their corresponding SDK definitions (`SessionResource`, `Activity`, `ChangeSetArtifact`, etc.). 
Look out for the following forms of drift:
*   **Breaking Changes:** Are there any required parameters added to the API that are missing from the SDK's `ApiClient` requests? Have any response fields that the SDK heavily relies on (`packages/core/src/mappers.ts`) been deleted or renamed?
*   **Semantic / Naming Shifts:** Pay close attention to fields that seem to have been slightly renamed (e.g., `changeSet` vs `changeSetCode`).
*   **Additive Changes:** Are there new endpoints, resources, or optional fields in the discovery doc that could be cleanly integrated into the SDK?
*   **Enum Divergences:** Check variations in Enums (e.g., changes to `SessionState`).
*   **Code Impact:** Check where in the SDK codebase these drifts matter, referencing specific files and line numbers, e.g., "Will break `packages/core/src/mappers.ts` at line 181".
*   **Actionable Recommendations:** If drift occurs, strongly prefer suggesting **defensive** implementation changes—like supporting both old and new field names temporarily using the `??` operator—rather than brittle direct renames to account for transient API variations.

Execute this process safely, relying on your tools to view files, make network requests, and write the final resulting file. Do not commit the changes or auto-PR unless explicitly requested in a follow-up.
