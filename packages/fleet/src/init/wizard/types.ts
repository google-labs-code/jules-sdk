// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/** Resolved inputs from the wizard or flags+env validation */
export interface InitWizardResult {
  owner: string;
  repo: string;
  baseBranch: string;
  authMethod: 'token' | 'app';
  /** Secrets to upload (name → value). Empty if user declines or non-interactive. */
  secretsToUpload: Record<string, string>;
  /** Whether to perform a dry run (list files but don't create PR) */
  dryRun: boolean;
  /** Whether to overwrite existing workflow files */
  overwrite: boolean;
}

/** Parsed args from citty */
export interface InitArgs {
  repo?: string;
  base?: string;
  'non-interactive'?: boolean;
  'dry-run'?: boolean;
  auth?: string;
  'app-id'?: string;
  'installation-id'?: string;
  'upload-secrets'?: boolean;
}
