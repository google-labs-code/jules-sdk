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

import type {
  Activity,
  ActivitySummary,
  ActivityAgentMessaged,
  ActivityPlanGenerated,
  ActivityProgressUpdated,
  ActivityUserMessaged,
  ActivitySessionFailed,
} from '../types.js';

const MAX_SUMMARY_LENGTH = 200;

/**
 * Creates a concise summary for an activity.
 * @param activity The activity to summarize.
 * @returns A summary of the activity.
 */
export function toSummary(activity: Activity): ActivitySummary {
  const { id, type, createTime } = activity;
  let summary: string = type; // Default fallback is the type name

  switch (activity.type) {
    case 'agentMessaged':
    case 'userMessaged': {
      const message = (activity as ActivityAgentMessaged | ActivityUserMessaged)
        .message;
      if (!message || message.length === 0) {
        summary = type; // Fallback to type name for empty messages
      } else if (message.length > MAX_SUMMARY_LENGTH) {
        summary = message.substring(0, MAX_SUMMARY_LENGTH) + '...';
      } else {
        summary = message;
      }
      break;
    }
    case 'progressUpdated': {
      const progress = activity as ActivityProgressUpdated;
      // Handle missing title/description gracefully
      if (progress.title && progress.description) {
        summary = `${progress.title}: ${progress.description}`;
      } else if (progress.title) {
        summary = progress.title;
      } else if (progress.description) {
        summary = progress.description;
      }
      // else: fallback to type name (already set)
      break;
    }
    case 'planGenerated': {
      const plan = activity as ActivityPlanGenerated;
      const stepCount = plan.plan?.steps?.length ?? 0;
      summary = `Plan generated with ${stepCount} steps`;
      break;
    }
    case 'planApproved':
      summary = 'Plan approved';
      break;
    case 'sessionCompleted':
      summary = 'Session completed';
      break;
    case 'sessionFailed': {
      const failed = activity as ActivitySessionFailed;
      summary = failed.reason
        ? `Session failed: ${failed.reason}`
        : 'Session failed';
      break;
    }
  }

  return { id, type, createTime, summary };
}
