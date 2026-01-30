import type { JulesClient, ChangeSetArtifact } from '@google/jules-sdk';
import type {
  ShowDiffResult,
  ShowDiffOptions,
  FileChangeDetail,
  CodeChangesSummary,
} from './types.js';

/**
 * Extract a specific file's diff from a unidiff patch.
 */
function extractFileDiff(unidiffPatch: string, filePath: string): string {
  if (!unidiffPatch) {
    return '';
  }
  // Add a leading newline to handle the first entry correctly
  const patches = ('\n' + unidiffPatch).split('\ndiff --git ');
  const targetHeader = `a/${filePath} `;
  const patch = patches.find((p) => p.startsWith(targetHeader));

  return patch ? `diff --git ${patch}`.trim() : '';
}

/**
 * Show the actual code diff for files from a Jules session.
 *
 * Uses session.snapshot() to leverage the core SDK's aggregation logic.
 * If activityId is provided, gets the diff from that specific activity instead.
 *
 * @param client - The Jules client instance
 * @param sessionId - The session ID to get diff from
 * @param options - Options including optional file filter and activityId
 * @returns Diff result with unidiff patch and file details
 */
export async function showDiff(
  client: JulesClient,
  sessionId: string,
  options: ShowDiffOptions = {},
): Promise<ShowDiffResult> {
  if (!sessionId) {
    throw new Error('sessionId is required');
  }

  const { file, activityId } = options;

  // Use snapshot() to leverage core SDK aggregation
  const session = client.session(sessionId);
  await session.activities.hydrate();
  const snapshot = await session.snapshot();

  let changeSet: ChangeSetArtifact | undefined;

  // If activityId is provided, find the changeSet from that specific activity
  if (activityId) {
    const activity = snapshot.activities.find(a => a.id === activityId);
    if (!activity) {
      return {
        sessionId: snapshot.id,
        activityId,
        file,
        unidiffPatch: '',
        files: [],
        summary: {
          totalFiles: 0,
          created: 0,
          modified: 0,
          deleted: 0,
        },
      };
    }

    // Find changeSet artifact in this activity
    const changeSetArtifact = activity.artifacts.find(a => a.type === 'changeSet');
    if (changeSetArtifact) {
      changeSet = changeSetArtifact as ChangeSetArtifact;
    }
  } else {
    // Get the changeSet from the snapshot (session outcome)
    changeSet = snapshot.changeSet() as ChangeSetArtifact | undefined;
  }

  if (!changeSet) {
    return {
      sessionId: snapshot.id,
      activityId,
      file,
      unidiffPatch: '',
      files: [],
      summary: {
        totalFiles: 0,
        created: 0,
        modified: 0,
        deleted: 0,
      },
    };
  }

  let unidiffPatch = changeSet.gitPatch.unidiffPatch || '';
  const parsed = changeSet.parsed();

  let files: FileChangeDetail[] = parsed.files.map((f) => ({
    path: f.path,
    changeType: f.changeType,
    additions: f.additions,
    deletions: f.deletions,
  }));

  let summary: CodeChangesSummary = parsed.summary;

  // Filter to specific file if requested
  if (file) {
    unidiffPatch = extractFileDiff(unidiffPatch, file);
    files = files.filter((f) => f.path === file);
    summary = {
      totalFiles: files.length,
      created: files.filter((f) => f.changeType === 'created').length,
      modified: files.filter((f) => f.changeType === 'modified').length,
      deleted: files.filter((f) => f.changeType === 'deleted').length,
    };
  }

  return {
    sessionId: snapshot.id,
    activityId,
    file,
    unidiffPatch,
    files,
    summary,
  };
}
