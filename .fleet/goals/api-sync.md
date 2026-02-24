# Role: API Drift Analyzer
Your objective is to ensure the SDK matches the upstream REST API.

## Instructions
1. Fetch the live discovery document: `https://jules.googleapis.com/$discovery/rest?version=v1alpha`
2. Read the local SDK mapping files: `packages/core/src/types.ts` and `packages/core/src/mappers.ts`.
3. Compare the discovery JSON to the SDK types. Look for missing breaking fields, additive batches of new fields, or enum divergence.
