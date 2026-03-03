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

import type { Octokit } from 'octokit';
import type {
  ConflictResolutionInput,
  ConflictResolutionResult,
  ConflictResolutionSpec,
} from './spec.js';
import { CONFLICT_NOTIFICATION_TAG, CONFLICT_NOTIFICATION_HEADER } from './spec.js';
import type { SessionDispatcher } from '../../shared/session-dispatcher.js';
import type { FleetEmitter } from '../../shared/events.js';
import { extractSessionId } from '../ops/extract-session-id.js';
import { buildConflictPrompt } from './build-prompt.js';

export interface ConflictResolutionHandlerDeps {
  octokit: Octokit;
  dispatcher: SessionDispatcher;
  emit?: FleetEmitter;
}

/**
 * ConflictResolutionHandler uses an event-sourcing pattern to resolve
 * merge conflicts by messaging existing Jules sessions.
 *
 * PR comments serve as the event log:
 * - Each notification is recorded as a comment with CONFLICT_NOTIFICATION_MARKER
 * - On each cron run, the handler reads comments to determine state
 * - After maxNotifications, falls back to redispatch
 *
 * Never throws — all errors returned as Result.
 */
export class ConflictResolutionHandler implements ConflictResolutionSpec {
  private octokit: Octokit;
  private dispatcher: SessionDispatcher;
  private emit: FleetEmitter;

  constructor(deps: ConflictResolutionHandlerDeps) {
    this.octokit = deps.octokit;
    this.dispatcher = deps.dispatcher;
    this.emit = deps.emit ?? (() => { });
  }

  async execute(input: ConflictResolutionInput): Promise<ConflictResolutionResult> {
    try {
      // 1. Extract session ID from branch name
      const sessionId = extractSessionId(input.conflictingPR.branchName);
      if (!sessionId) {
        return {
          success: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: `Could not extract session ID from branch: ${input.conflictingPR.branchName}`,
            fallbackToRedispatch: true,
          },
        };
      }

      // 2. Read PR comments to determine current state (event sourcing)
      const notificationCount = await this.countNotifications(
        input.owner,
        input.repo,
        input.conflictingPR.number,
      );

      // 3. Check if max notifications reached → redispatch
      if (notificationCount >= input.maxNotifications) {
        return {
          success: false,
          error: {
            code: 'MAX_NOTIFICATIONS_REACHED',
            message: `Session notified ${notificationCount} times without resolution`,
            fallbackToRedispatch: true,
          },
        };
      }

      // 4. Build conflict context and fetch base branch content
      const baseContent = await this.fetchBaseContent(
        input.owner,
        input.repo,
        input.conflictingFiles,
        input.baseBranch,
      );

      const prompt = buildConflictPrompt({
        prNumber: input.conflictingPR.number,
        conflictingFiles: input.conflictingFiles,
        baseContent,
        peerPRs: input.peerPRs,
      });

      // 5. Send message to the session (fire-and-forget)
      this.emit({
        type: 'merge:conflict:notifying',
        prNumber: input.conflictingPR.number,
        sessionId,
      });

      try {
        if (!this.dispatcher.sendMessage) {
          return {
            success: false,
            error: {
              code: 'SEND_MESSAGE_FAILED',
              message: `Dispatcher does not support sendMessage`,
              fallbackToRedispatch: true,
            },
          };
        }
        await this.dispatcher.sendMessage(sessionId, prompt);
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'SEND_MESSAGE_FAILED',
            message: `Failed to message session ${sessionId}: ${error instanceof Error ? error.message : error}`,
            fallbackToRedispatch: true,
          },
        };
      }

      this.emit({
        type: 'merge:conflict:notified',
        prNumber: input.conflictingPR.number,
        sessionId,
      });

      // 6. Record the notification as a PR comment (event log)
      const newCount = notificationCount + 1;
      await this.recordNotification(
        input.owner,
        input.repo,
        input.conflictingPR.number,
        sessionId,
        newCount,
        input.maxNotifications,
        input.conflictingFiles,
      );

      return {
        success: true,
        data: {
          action: 'notified',
          sessionId,
          notificationCount: newCount,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: error instanceof Error ? error.message : String(error),
          fallbackToRedispatch: true,
        },
      };
    }
  }

  /**
   * Counts existing conflict notification comments on the PR.
   */
  private async countNotifications(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<number> {
    try {
      const { data: comments } = await this.octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: prNumber,
      });
      return comments.filter(
        (c: any) => c.body?.startsWith(CONFLICT_NOTIFICATION_TAG),
      ).length;
    } catch {
      return 0; // Non-fatal — assume no prior notifications
    }
  }

  /**
   * Records a conflict notification as a PR comment.
   */
  private async recordNotification(
    owner: string,
    repo: string,
    prNumber: number,
    sessionId: string,
    attempt: number,
    maxAttempts: number,
    conflictingFiles: string[],
  ): Promise<void> {
    const fileList = conflictingFiles.map((f) => `\`${f}\``).join(', ');
    const body = [
      CONFLICT_NOTIFICATION_TAG,
      CONFLICT_NOTIFICATION_HEADER,
      `Session \`${sessionId}\` has been messaged about merge conflicts.`,
      '',
      `**Attempt:** ${attempt}/${maxAttempts}`,
      `**Conflicting files:** ${fileList}`,
      `**Timestamp:** ${new Date().toISOString()}`,
      '',
      attempt >= maxAttempts
        ? '⛔ Max notifications reached. Next conflict will trigger redispatch.'
        : '🔄 The merge handler will retry on the next cron run.',
    ].join('\n');

    try {
      await this.octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body,
      });
    } catch {
      // Non-fatal — the notification was still sent to the session
    }
  }

  /**
   * Fetches file content from the base branch for conflict context.
   */
  private async fetchBaseContent(
    owner: string,
    repo: string,
    files: string[],
    baseBranch: string,
  ): Promise<Map<string, string>> {
    const content = new Map<string, string>();
    await Promise.all(
      files.map(async (file) => {
        try {
          const { data } = await this.octokit.rest.repos.getContent({
            owner,
            repo,
            path: file,
            ref: baseBranch,
          });
          if ('content' in data && data.content) {
            content.set(
              file,
              Buffer.from(data.content, 'base64').toString('utf-8'),
            );
          }
        } catch {
          // Non-fatal — skip files we can't fetch
        }
      }),
    );
    return content;
  }
}
