/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Validates a given sessionId to prevent directory/path traversal
 * and injection attacks when interacting with the local filesystem.
 *
 * @param sessionId - The session ID to validate.
 * @throws {Error} If the session ID is invalid.
 */
export function validateSessionId(sessionId: string): void {
  if (!sessionId) {
    throw new Error('INVALID_SESSION_ID: Session ID cannot be empty');
  }

  const cleanId = sessionId.replace(/^sessions\//, '');

  if (!cleanId) {
    throw new Error('INVALID_SESSION_ID: Session ID cannot be empty');
  }

  if (cleanId.includes('\x00') || /[\x01-\x1f\x7f]/.test(cleanId)) {
    throw new Error(
      `INVALID_SESSION_ID: Session ID contains control characters: ${sessionId}`,
    );
  }

  if (cleanId.includes('/') || cleanId.includes('\\')) {
    throw new Error(
      `INVALID_SESSION_ID: Session ID cannot contain slashes or backslashes: ${sessionId}`,
    );
  }

  if (cleanId === '.' || cleanId === '..') {
    throw new Error(
      `INVALID_SESSION_ID: Session ID cannot be "." or "..": ${sessionId}`,
    );
  }
}

/**
 * Validates a given pageToken to prevent directory/path traversal, control characters,
 * and injection risks when interacting with local filesystems, caches, or logs.
 *
 * @param pageToken - The page token to validate.
 * @throws {Error} If the page token is invalid.
 */
export function validatePageToken(pageToken: string): void {
  if (!pageToken) {
    throw new Error('INVALID_PAGE_TOKEN: Page token cannot be empty');
  }

  if (pageToken.includes('\x00') || /[\x01-\x1f\x7f]/.test(pageToken)) {
    throw new Error(
      `CONTROL_CHAR: Page token contains control characters: ${pageToken}`,
    );
  }

  if (pageToken.includes('/') || pageToken.includes('\\')) {
    throw new Error(
      `INVALID_PAGE_TOKEN: Page token cannot contain slashes or backslashes: ${pageToken}`,
    );
  }

  if (pageToken === '.' || pageToken === '..') {
    throw new Error(
      `PATH_TRAVERSAL: Page token cannot be "." or "..": ${pageToken}`,
    );
  }
}

/**
 * Validates a given GitHub repository string to prevent injection and traversal
 * when interacting with downstream filesystems and APIs.
 *
 * @param repo - The repository string (owner/repo).
 * @throws {Error} If the repository name is invalid.
 */
export function validateRepository(repo: string): void {
  if (!repo) {
    throw new Error('INVALID_REPOSITORY: Repository cannot be empty');
  }

  if (repo.includes('\x00') || /[\x01-\x1f\x7f]/.test(repo)) {
    throw new Error(
      `CONTROL_CHAR: Repository contains control characters: ${repo}`,
    );
  }

  const parts = repo.split('/');
  if (parts.length !== 2) {
    throw new Error(
      `INVALID_REPOSITORY: Repository must be in owner/repo format: ${repo}`,
    );
  }

  const [owner, repoName] = parts;
  if (!owner || !repoName) {
    throw new Error(
      `INVALID_REPOSITORY: Repository must be in owner/repo format: ${repo}`,
    );
  }

  const validNameRegex = /^[a-zA-Z0-9-._]+$/;
  if (!validNameRegex.test(owner) || !validNameRegex.test(repoName)) {
    throw new Error(
      `INVALID_REPOSITORY: Repository name contains invalid characters: ${repo}`,
    );
  }

  if (
    owner === '.' ||
    owner === '..' ||
    repoName === '.' ||
    repoName === '..'
  ) {
    throw new Error(
      `PATH_TRAVERSAL: Repository name cannot contain path traversal segments: ${repo}`,
    );
  }
}

/**
 * Validates a given Git branch name to ensure it conforms to security-safe
 * git reference naming rules and avoids script injection or command execution risks.
 *
 * @param branch - The branch name to validate.
 * @throws {Error} If the branch name is invalid.
 */
export function validateBranchName(branch: string): void {
  if (!branch) {
    throw new Error('INVALID_BRANCH: Branch name cannot be empty');
  }
  if (branch.startsWith('refs/')) {
    throw new Error(
      `RESERVED_BRANCH: Branch name must not start with refs/: ${branch}`,
    );
  }
  // git ref rules: no spaces, no control chars, no consecutive dots, no trailing dot/slash/lock
  if (/\s/.test(branch)) {
    throw new Error(`INVALID_BRANCH: Branch name contains spaces: ${branch}`);
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
    throw new Error(`INVALID_BRANCH: Branch name ends with .lock: ${branch}`);
  }
}

/**
 * Validates a given file path to prevent directory/path traversal, control character,
 * and absolute path escape risks.
 *
 * @param filePath - The file path to validate.
 * @throws {Error} If the file path is invalid.
 */
export function validateFilePath(filePath: string): void {
  if (!filePath) {
    throw new Error('INVALID_FILE_PATH: File path cannot be empty');
  }
  if (filePath.includes('\x00') || /[\x01-\x1f\x7f]/.test(filePath)) {
    throw new Error(
      `CONTROL_CHAR: File path contains control characters: ${filePath}`,
    );
  }
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error(`ABSOLUTE_PATH: File path must be relative: ${filePath}`);
  }
  const parts = normalized.split('/');
  if (parts.some((p) => p === '..')) {
    throw new Error(`PATH_TRAVERSAL: File path escapes repo root: ${filePath}`);
  }
}

/**
 * Validates a given activityId to prevent directory/path traversal, control characters,
 * and injection risks when interacting with local filesystems, caches, or logs.
 *
 * @param activityId - The activity ID to validate.
 * @throws {Error} If the activity ID is invalid.
 */
export function validateActivityId(activityId: string): void {
  if (!activityId) {
    throw new Error('INVALID_ACTIVITY_ID: Activity ID cannot be empty');
  }

  if (activityId.includes('\x00') || /[\x01-\x1f\x7f]/.test(activityId)) {
    throw new Error(
      `CONTROL_CHAR: Activity ID contains control characters: ${activityId}`,
    );
  }

  if (activityId.includes('/') || activityId.includes('\\')) {
    throw new Error(
      `INVALID_ACTIVITY_ID: Activity ID cannot contain slashes or backslashes: ${activityId}`,
    );
  }

  if (activityId === '.' || activityId === '..') {
    throw new Error(
      `PATH_TRAVERSAL: Activity ID cannot be "." or "..": ${activityId}`,
    );
  }
}
