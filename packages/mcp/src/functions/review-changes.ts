import type { JulesClient, ChangeSetArtifact } from '@google/jules-sdk';
import type {
  ReviewChangesResult,
  ReviewChangesOptions,
  FileChange,
  FilesSummary,
  SessionStatus,
} from './types.js';

/**
 * Map session state to semantic status.
 */
function getSemanticStatus(state: string): SessionStatus {
  switch (state) {
    case 'queued':
    case 'planning':
    case 'inProgress':
      return 'busy';
    // TODO: Add a 'waiting' SessionStatus
    case 'awaitingPlanApproval':
    case 'awaitingUserFeedback':
    case 'paused':
    case 'completed':
      return 'stable';
    case 'failed':
      return 'failed';
    default:
      return 'busy';
  }
}

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
      lines.push(`  ${icon} ${basename} ${stats}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format files as a summary.
 */
function formatAsSummary(
  title: string,
  state: string,
  url: string,
  files: FileChange[],
  summary: FilesSummary,
  pr?: { url: string; title: string },
): string {
  const lines: string[] = [];

  lines.push(`Session: "${title}" (${state})`);
  lines.push(`URL: ${url}`);
  if (pr) {
    lines.push(`PR: [${pr.title}](${pr.url})`);
  }
  lines.push('');

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  lines.push(
    `📊 Summary: ${summary.totalFiles} files changed (+${totalAdditions} / -${totalDeletions})`,
  );
  if (summary.created > 0) lines.push(`  🟢 ${summary.created} created`);
  if (summary.modified > 0) lines.push(`  🟡 ${summary.modified} modified`);
  if (summary.deleted > 0) lines.push(`  🔴 ${summary.deleted} deleted`);
  lines.push('');

  lines.push('📁 Changes:');
  lines.push(formatAsTree(files));

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
  }

  return lines.join('\n');
}

/**
 * Review code changes from a Jules session.
 *
 * Uses session.snapshot() to leverage the core SDK's aggregation logic.
 * Supports detail levels to control token usage:
 * - minimal: files and summary only
 * - standard: + insights, timing, url, pr
 * - full: + activityCounts
 *
 * @param client - The Jules client instance
 * @param sessionId - The session ID to review
 * @param options - Format, filter, and detail options
 * @returns Review result with files, summary, and formatted output
 */
export async function reviewChanges(
  client: JulesClient,
  sessionId: string,
  options: ReviewChangesOptions = {},
): Promise<ReviewChangesResult> {
  if (!sessionId) {
    throw new Error('sessionId is required');
  }

  const { format = 'summary', filter = 'all', detail = 'standard' } = options;

  // Use snapshot() to leverage core SDK aggregation
  const session = client.session(sessionId);
  const snapshot = await session.snapshot();

  // Get changeSet from snapshot (already aggregated by core SDK)
  // Cast to ChangeSetArtifact to access parsed() method
  const changeSet = snapshot.changeSet() as ChangeSetArtifact | undefined;
  const parsed = changeSet?.parsed();

  // Use parsed files and summary from core SDK
  let files: FileChange[] = parsed?.files.map((f) => ({
    path: f.path,
    changeType: f.changeType,
    activityIds: [], // Not tracked in aggregated changeSet
    additions: f.additions,
    deletions: f.deletions,
  })) ?? [];

  // Apply filter
  if (filter !== 'all') {
    files = files.filter((f) => f.changeType === filter);
  }

  // Use summary from parsed changeSet, recompute if filtered
  let summary: FilesSummary;
  if (filter === 'all' && parsed?.summary) {
    summary = parsed.summary;
  } else {
    summary = {
      totalFiles: files.length,
      created: files.filter((f) => f.changeType === 'created').length,
      modified: files.filter((f) => f.changeType === 'modified').length,
      deleted: files.filter((f) => f.changeType === 'deleted').length,
    };
  }

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
        snapshot.url,
        files,
        summary,
        pr,
      );
      break;
  }

  // Build result based on detail level
  const result: ReviewChangesResult = {
    sessionId: snapshot.id,
    title: snapshot.title,
    state: snapshot.state,
    status: getSemanticStatus(snapshot.state),
    url: snapshot.url,
    files,
    summary,
    formatted,
  };

  // Add timing and insights for standard/full detail
  if (detail === 'standard' || detail === 'full') {
    result.createdAt = snapshot.createdAt.toISOString();
    result.updatedAt = snapshot.updatedAt.toISOString();
    result.durationMs = snapshot.durationMs;
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
