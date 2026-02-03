import type { JulesClient, ChangeSetArtifact, Activity } from '@google/jules-sdk';
import type {
  ReviewChangesResult,
  ReviewChangesOptions,
  FileChange,
  FilesSummary,
  SessionStatus,
} from './types.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map session state to semantic status.
 */
function getSemanticStatus(state: string): SessionStatus {
  const busyStates = new Set([
    'queued', 'QUEUED',
    'planning', 'PLANNING',
    'inProgress', 'IN_PROGRESS', 'in_progress',
  ]);
  const failedStates = new Set(['failed', 'FAILED']);

  if (failedStates.has(state)) return 'failed';
  if (busyStates.has(state)) return 'busy';
  return 'stable';
}

/**
 * Check if session is currently in a busy state.
 */
function isBusyState(state: string): boolean {
  return getSemanticStatus(state) === 'busy';
}

/**
 * Check if session has ever been in a stable state before.
 * This is detected by looking for sessionCompleted or planApproved activities.
 */
function hasStableHistory(activities: readonly Activity[]): boolean {
  return activities.some(a =>
    a.type === 'sessionCompleted' ||
    a.type === 'planApproved'
  );
}

/**
 * Compute the net change type when a file has multiple changes.
 * - created -> modified = created
 * - created -> deleted = null (omit)
 * - modified -> deleted = deleted
 */
function computeNetChangeType(
  first: 'created' | 'modified' | 'deleted',
  latest: 'created' | 'modified' | 'deleted',
): ('created' | 'modified' | 'deleted') | null {
  if (first === 'created' && latest === 'deleted') return null;
  if (first === 'created') return 'created';
  return latest;
}

/**
 * Aggregate file changes from activity artifacts.
 * Tracks which activities touched each file and computes net change type.
 */
function aggregateFromActivities(activities: readonly Activity[]): FileChange[] {
  const fileMap = new Map<
    string,
    {
      firstChangeType: 'created' | 'modified' | 'deleted';
      latestChangeType: 'created' | 'modified' | 'deleted';
      activityIds: string[];
      additions: number;
      deletions: number;
    }
  >();

  for (const activity of activities) {
    for (const artifact of activity.artifacts) {
      if (artifact.type === 'changeSet') {
        const changeSet = artifact as ChangeSetArtifact;
        const parsed = changeSet.parsed();

        for (const file of parsed.files) {
          const existing = fileMap.get(file.path);
          if (existing) {
            existing.activityIds.push(activity.id);
            existing.additions += file.additions;
            existing.deletions += file.deletions;
            existing.latestChangeType = file.changeType;
          } else {
            fileMap.set(file.path, {
              firstChangeType: file.changeType,
              latestChangeType: file.changeType,
              activityIds: [activity.id],
              additions: file.additions,
              deletions: file.deletions,
            });
          }
        }
      }
    }
  }

  // Compute net changeType and filter out created->deleted
  const files: FileChange[] = [];
  for (const [path, info] of fileMap.entries()) {
    const netChangeType = computeNetChangeType(
      info.firstChangeType,
      info.latestChangeType,
    );
    if (netChangeType === null) continue;

    files.push({
      path,
      changeType: netChangeType,
      activityIds: info.activityIds,
      additions: info.additions,
      deletions: info.deletions,
    });
  }

  return files;
}

/**
 * Get files from session outcome changeSet.
 */
function getFilesFromOutcome(changeSet: ChangeSetArtifact | undefined): FileChange[] {
  if (!changeSet) return [];

  const parsed = changeSet.parsed();
  return parsed.files.map(f => ({
    path: f.path,
    changeType: f.changeType,
    activityIds: ['outcome'],
    additions: f.additions,
    deletions: f.deletions,
  }));
}

/**
 * Get files from a single activity's changeSet.
 */
function getFilesFromActivity(activity: Activity): FileChange[] {
  const files: FileChange[] = [];

  for (const artifact of activity.artifacts) {
    if (artifact.type === 'changeSet') {
      const changeSet = artifact as ChangeSetArtifact;
      const parsed = changeSet.parsed();

      for (const file of parsed.files) {
        files.push({
          path: file.path,
          changeType: file.changeType,
          activityIds: [activity.id],
          additions: file.additions,
          deletions: file.deletions,
        });
      }
    }
  }

  return files;
}

// ============================================================================
// Formatting Functions
// ============================================================================

/**
 * Format files as a tree structure grouped by directory.
 */
function formatAsTree(files: FileChange[]): string {
  const lines: string[] = [];
  const byDir = new Map<string, FileChange[]>();

  for (const file of files) {
    const parts = file.path.split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir)!.push(file);
  }

  const sortedDirs = [...byDir.keys()].sort();
  for (const dir of sortedDirs) {
    lines.push(`${dir}/`);
    const dirFiles = byDir.get(dir)!;
    for (const file of dirFiles) {
      const basename = file.path.split('/').pop()!;
      const icon =
        file.changeType === 'created'
          ? '🟢'
          : file.changeType === 'deleted'
            ? '🔴'
            : '🟡';
      const stats =
        file.changeType === 'deleted'
          ? `(-${file.deletions})`
          : `(+${file.additions}${file.deletions > 0 ? ` / -${file.deletions}` : ''})`;

      // Include activity IDs (truncated)
      const activityInfo = file.activityIds.length > 0 && file.activityIds[0] !== 'outcome'
        ? ` [${file.activityIds.slice(0, 2).map(id => id.slice(0, 8)).join(', ')}${file.activityIds.length > 2 ? '...' : ''}]`
        : '';

      lines.push(`  ${icon} ${basename} ${stats}${activityInfo}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format files as a detailed list.
 */
function formatAsDetailed(files: FileChange[]): string {
  const lines: string[] = [];

  for (const file of files) {
    const icon =
      file.changeType === 'created'
        ? '🟢'
        : file.changeType === 'deleted'
          ? '🔴'
          : '🟡';
    lines.push(`${icon} ${file.path}`);
    lines.push(`   Type: ${file.changeType}`);
    lines.push(`   Lines: +${file.additions} / -${file.deletions}`);
    if (file.activityIds.length > 0 && file.activityIds[0] !== 'outcome') {
      lines.push(`   Activities: ${file.activityIds.slice(0, 3).map(id => id.slice(0, 8)).join(', ')}${file.activityIds.length > 3 ? '...' : ''}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format as summary with header and tree.
 */
function formatAsSummary(
  title: string,
  state: string,
  status: SessionStatus,
  url: string,
  files: FileChange[],
  summary: FilesSummary,
  hasStableHistory: boolean,
  pr?: { url: string; title: string },
): string {
  const lines: string[] = [];

  lines.push(`Session: "${title}" (${state})`);
  lines.push(`URL: ${url}`);
  if (pr) {
    lines.push(`PR: [${pr.title}](${pr.url})`);
  }
  lines.push('');

  // Warning for busy sessions with stable history
  if (status === 'busy' && hasStableHistory) {
    lines.push('⚠️ Session was previously stable. Current changes may modify earlier work.');
    lines.push('');
  }

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);
  const inProgressMarker = status === 'busy' ? ' (in progress)' : '';

  lines.push(
    `📊 Summary: ${summary.totalFiles} files changed (+${totalAdditions} / -${totalDeletions})${inProgressMarker}`,
  );
  if (summary.created > 0) lines.push(`  🟢 ${summary.created} created`);
  if (summary.modified > 0) lines.push(`  🟡 ${summary.modified} modified`);
  if (summary.deleted > 0) lines.push(`  🔴 ${summary.deleted} deleted`);
  lines.push('');

  lines.push('📁 Changes:');
  lines.push(formatAsTree(files));

  return lines.join('\n');
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Review code changes from a Jules session.
 *
 * Automatically detects whether the session is busy or stable:
 * - **busy**: Aggregates file changes from activity artifacts
 * - **stable**: Uses session outcome changeSet
 *
 * Both modes track which activities touched each file (via activityIds).
 *
 * @param client - The Jules client instance
 * @param sessionId - The session ID to review
 * @param options - Format, filter, and detail options
 * @returns Review result with files, summary, and formatted output
 */
export async function codeReview(
  client: JulesClient,
  sessionId: string,
  options: ReviewChangesOptions = {},
): Promise<ReviewChangesResult> {
  if (!sessionId) {
    throw new Error('sessionId is required');
  }

  const { format = 'summary', filter = 'all', detail = 'standard', activityId } = options;

  // Get session and hydrate activities
  const session = client.session(sessionId);
  await session.activities.hydrate();
  const snapshot = await session.snapshot();

  // FIX: Ensure activities is always an array
  const activities = snapshot.activities ?? [];

  const status = getSemanticStatus(snapshot.state);
  const isBusy = status === 'busy';
  const stableHistory = hasStableHistory(activities);

  // Find specific activity if activityId provided
  let targetActivity: Activity | undefined;
  if (activityId) {
    targetActivity = activities.find(a => a.id === activityId);
    if (!targetActivity) {
      throw new Error(`Activity ${activityId} not found in session ${sessionId}`);
    }
  }

  // Get files based on mode
  let files: FileChange[];
  if (activityId && targetActivity) {
    // Activity-scoped: get files from just this activity
    files = getFilesFromActivity(targetActivity);
  } else if (isBusy) {
    // Busy mode: aggregate from activities
    files = aggregateFromActivities(activities);
  } else {
    // Stable mode: use session outcome changeSet, but also get activity IDs if available

    // FIX: Defensive check for changeSet being a function
    const changeSet = typeof snapshot.changeSet === 'function'
      ? snapshot.changeSet() as ChangeSetArtifact | undefined
      : undefined;

    // Try to get activity IDs by also aggregating from activities
    const activityFiles = aggregateFromActivities(activities);
    const activityFileMap = new Map(activityFiles.map(f => [f.path, f.activityIds]));

    // Use outcome changeSet for accurate final state, but enrich with activity IDs
    files = getFilesFromOutcome(changeSet).map(f => ({
      ...f,
      activityIds: activityFileMap.get(f.path) || f.activityIds,
    }));
  }

  // Apply filter
  if (filter !== 'all') {
    files = files.filter(f => f.changeType === filter);
  }

  // Compute summary
  const summary: FilesSummary = {
    totalFiles: files.length,
    created: files.filter(f => f.changeType === 'created').length,
    modified: files.filter(f => f.changeType === 'modified').length,
    deleted: files.filter(f => f.changeType === 'deleted').length,
  };

  // Extract PR info
  const pr = snapshot.pr
    ? { url: snapshot.pr.url, title: snapshot.pr.title }
    : undefined;

  // Format output
  let formatted: string;
  switch (format) {
    case 'markdown':
      formatted = snapshot.toMarkdown();
      break;
    case 'tree':
      formatted = formatAsTree(files);
      break;
    case 'detailed':
      formatted = formatAsDetailed(files);
      break;
    case 'summary':
    default:
      formatted = formatAsSummary(
        snapshot.title,
        snapshot.state,
        status,
        snapshot.url,
        files,
        summary,
        stableHistory,
        pr,
      );
      break;
  }

  // Build result
  const result: ReviewChangesResult = {
    sessionId: snapshot.id,
    title: snapshot.title,
    state: snapshot.state,
    status,
    url: snapshot.url,
    hasStableHistory: stableHistory,
    warning: isBusy && stableHistory
      ? 'Session was previously stable. Current changes may modify earlier work.'
      : undefined,
    files,
    summary,
    formatted,
  };

  // Add timing and insights for standard/full detail
  if (detail === 'standard' || detail === 'full') {
    result.createdAt = snapshot.createdAt.toISOString();
    result.updatedAt = snapshot.updatedAt.toISOString();
    result.durationMs = snapshot.durationMs;

    const inProgressSuffix = isBusy ? ' (in progress)' : '';
    result.insights = {
      completionAttempts: snapshot.insights.completionAttempts,
      planRegenerations: snapshot.insights.planRegenerations,
      userInterventions: snapshot.insights.userInterventions,
      failedCommandCount: snapshot.insights.failedCommands.length,
    };

    if (pr) {
      result.pr = pr;
    }
  }

  // Add activity counts for full detail
  if (detail === 'full') {
    result.activityCounts = { ...snapshot.activityCounts };
  }

  return result;
}
