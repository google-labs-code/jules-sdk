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

// src/snapshot.ts
import {
  Activity,
  PullRequest,
  SessionInsights,
  SessionResource,
  SessionSnapshot,
  SessionState,
  SerializedSnapshot,
  TimelineEntry,
  ActivityPlanGenerated,
  ActivitySessionFailed,
  ActivityUserMessaged,
  ActivityAgentMessaged,
  ActivityProgressUpdated,
  GeneratedFile,
  SessionOutcome,
  GeneratedFiles,
  ChangeSet,
  ToJSONOptions,
} from './types.js';

export interface SessionSnapshotOptions {
  data: {
    session: SessionResource;
    activities?: Activity[];
  }
}

export class SessionSnapshotImpl implements SessionSnapshot {
  readonly id: string;
  readonly state: SessionState;
  readonly url: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly durationMs: number;
  readonly prompt: string;
  readonly title: string;
  readonly pr?: PullRequest;
  readonly activities: readonly Activity[];
  readonly activityCounts: Readonly<Record<string, number>>;
  readonly timeline: readonly TimelineEntry[];
  readonly insights: SessionInsights;
  readonly generatedFiles: GeneratedFiles;
  readonly changeSet: () => ChangeSet | undefined;

  constructor(options: SessionSnapshotOptions) {
    const { session, activities = [] } = options.data;
    this.id = session.id;
    this.state = session.state;
    this.url = session.url;
    this.createdAt = new Date(session.createTime);
    this.updatedAt = new Date(session.updateTime);
    this.durationMs = this.updatedAt.getTime() - this.createdAt.getTime();
    this.prompt = session.prompt;
    this.title = session.title;

    // Handle outcome - may not exist in test mocks or legacy data
    if (session.outcome) {
      this.pr = session.outcome.pullRequest;
      this.generatedFiles = session.outcome.generatedFiles();
      this.changeSet = session.outcome.changeSet;
    } else {
      // Fallback: extract PR from outputs if outcome is not populated
      const prOutput = session.outputs?.find((o) => o.type === 'pullRequest');
      this.pr = prOutput?.pullRequest;
      this.generatedFiles = { all: () => [], get: () => undefined, filter: () => [] };
      this.changeSet = () => undefined;
    }
    this.activities = Object.freeze(activities);

    // Compute derived views
    this.activityCounts = this.computeActivityCounts();
    this.timeline = this.computeTimeline();
    this.insights = this.computeInsights();

    // Make the instance immutable
    Object.freeze(this);
  }

  private computeActivityCounts(): Readonly<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const activity of this.activities) {
      counts[activity.type] = (counts[activity.type] || 0) + 1;
    }
    return counts;
  }

  private computeTimeline(): readonly TimelineEntry[] {
    return this.activities.map((activity) => ({
      time: activity.createTime,
      type: activity.type,
      summary: this.generateSummary(activity),
    }));
  }

  private generateSummary(activity: Activity): string {
    switch (activity.type) {
      case 'planGenerated':
        return `Plan with ${(activity as ActivityPlanGenerated).plan.steps.length} steps`;
      case 'planApproved':
        return 'Plan approved';
      case 'sessionCompleted':
        return 'Session completed';
      case 'sessionFailed':
        return `Failed: ${(activity as ActivitySessionFailed).reason}`;
      case 'userMessaged': {
        const msg = (activity as ActivityUserMessaged).message;
        return `User: ${msg.substring(0, 100)}${msg.length > 100 ? '...' : ''}`;
      }
      case 'agentMessaged': {
        const msg = (activity as ActivityAgentMessaged).message;
        return `Agent: ${msg.substring(0, 100)}${msg.length > 100 ? '...' : ''}`;
      }
      case 'progressUpdated': {
        const progress = activity as ActivityProgressUpdated;
        return progress.title || progress.description || 'Progress update';
      }
      default:
        // This case should be unreachable if all activity types are handled.
        // Casting to Activity bypasses the 'never' type inference.
        return (activity as Activity).type;
    }
  }

  private computeInsights(): SessionInsights {
    const failedCommands = this.activities.filter((activity) =>
      activity.artifacts.some((artifact) => {
        if (artifact.type === 'bashOutput') {
          return artifact.exitCode !== 0;
        }
        return false;
      }),
    );

    return {
      completionAttempts: this.activityCounts['sessionCompleted'] || 0,
      planRegenerations: this.activityCounts['planGenerated'] || 0,
      userInterventions: this.activityCounts['userMessaged'] || 0,
      failedCommands,
    };
  }

  toJSON(options: ToJSONOptions = { exclude: ['activities', 'generatedFiles'] }): Partial<SerializedSnapshot> {
    const full: SerializedSnapshot = {
      id: this.id,
      state: this.state,
      url: this.url,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      durationMs: this.durationMs,
      prompt: this.prompt,
      title: this.title,
      activities: this.activities as Activity[],
      activityCounts: this.activityCounts,
      timeline: this.timeline as TimelineEntry[],
      generatedFiles: this.generatedFiles.all(),
      insights: {
        completionAttempts: this.insights.completionAttempts,
        planRegenerations: this.insights.planRegenerations,
        userInterventions: this.insights.userInterventions,
        failedCommandCount: this.insights.failedCommands.length,
      },
      pr: this.pr,
    };

    // If include is specified, return only those fields
    if (options?.include) {
      return Object.fromEntries(
        options.include
          .filter((key) => key in full)
          .map((key) => [key, full[key]]),
      ) as Partial<SerializedSnapshot>;
    }

    // If exclude is specified, return all fields except those
    if (options?.exclude) {
      const result = { ...full };
      for (const key of options.exclude) {
        delete result[key];
      }
      return result;
    }

    return full;
  }

  toMarkdown(): string {
    const lines: string[] = [];

    // Header
    lines.push(`# Session: ${this.title}`);
    lines.push(`**Status**: \`${this.state}\` | **ID**: \`${this.id}\``);
    lines.push('');

    // Stats & PR
    lines.push('## Overview');
    lines.push(`- **Duration**: ${Math.round(this.durationMs / 1000)}s`);
    lines.push(`- **Total Activities**: ${this.activities.length}`);
    if (this.pr) {
      lines.push(`- **Pull Request**: [${this.pr.title}](${this.pr.url})`);
    }
    if (this.generatedFiles.all().length > 0) {
      lines.push(`- **Generated Files**: ${this.generatedFiles.all().length}`);
      for (const file of this.generatedFiles.all()) {
        lines.push(`  - ${file.path}`);
        lines.push(`  - Type: ${file.changeType}`);
        lines.push(`  - Additions: ${file.additions}`);
        lines.push(`  - Deletions: ${file.deletions}`);
      }
    }
    lines.push('');

    // Insights
    lines.push('## Insights');
    lines.push(
      `- **Completion Attempts**: ${this.insights.completionAttempts}`,
    );
    lines.push(`- **Plan Regenerations**: ${this.insights.planRegenerations}`);
    lines.push(`- **User Interventions**: ${this.insights.userInterventions}`);
    lines.push(`- **Failed Commands**: ${this.insights.failedCommands.length}`);
    lines.push('');

    // Timeline
    lines.push('## Timeline');
    if (this.timeline.length === 0) {
      lines.push('_No activities recorded._');
    } else {
      for (const entry of this.timeline) {
        lines.push(`- **[${entry.type}]** ${entry.summary} _(${entry.time})_`);
      }
    }
    lines.push('');

    // Activity Counts
    if (Object.keys(this.activityCounts).length > 0) {
      lines.push('## Activity Counts');
      lines.push('```');
      for (const [type, count] of Object.entries(this.activityCounts)) {
        lines.push(`${type.padEnd(20)}: ${count}`);
      }
      lines.push('```');
    }

    return lines.join('\n');
  }
}
