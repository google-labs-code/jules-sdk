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

export function validateFilePath(filePath: string): void {
  if (filePath.includes("\x00") || /[\x01-\x1f\x7f]/.test(filePath)) {
    throw new Error(
      `CONTROL_CHAR: File path contains control characters: ${filePath}`,
    );
  }
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (parts.some((p) => p === "..")) {
    throw new Error(
      `PATH_TRAVERSAL: File path escapes repo root: ${filePath}`,
    );
  }
}

export function validateBranchName(branch: string): void {
  if (branch.startsWith("refs/")) {
    throw new Error(
      `RESERVED_BRANCH: Branch name must not start with refs/: ${branch}`,
    );
  }
  // git ref rules: no spaces, no control chars, no consecutive dots, no trailing dot/slash/lock
  if (/\s/.test(branch)) {
    throw new Error(
      `INVALID_BRANCH: Branch name contains spaces: ${branch}`,
    );
  }
  if (/[\x00-\x1f\x7f~^:?*\[\\]/.test(branch)) {
    throw new Error(
      `INVALID_BRANCH: Branch name contains invalid characters: ${branch}`,
    );
  }
  if (/\.\./.test(branch)) {
    throw new Error(
      `INVALID_BRANCH: Branch name contains consecutive dots: ${branch}`,
    );
  }
  if (/\.$/.test(branch) || /\/$/.test(branch)) {
    throw new Error(
      `INVALID_BRANCH: Branch name ends with dot or slash: ${branch}`,
    );
  }
  if (/\.lock$/.test(branch)) {
    throw new Error(
      `INVALID_BRANCH: Branch name ends with .lock: ${branch}`,
    );
  }
}
