import { jules, JulesError, ChangeSetArtifact } from '@google/jules-sdk';

/**
 * GitPatch Improve Example
 *
 * Demonstrates how to:
 * - Query recent sessions to find one with code changes (ChangeSet artifacts)
 * - Retrieve the GitPatch data from that session
 * - Use the GitPatch data in a new repoless session to analyze for improvements
 */
async function runGitPatchImproveSession() {
  try {
    console.log('Finding a recent session with a GitPatch...');

    // We query the local cache for activities that have a changeSet artifact.
    // This gives us activities containing code modifications.
    const activitiesWithChanges = await jules.select({
      from: 'activities',
      where: { artifactCount: { gt: 0 } },
      order: 'desc',
      limit: 10,
    });

    let gitPatchData: string | null = null;
    let sourceSessionId: string | null = null;

    // Find the first activity with a changeSet artifact
    for (const activity of activitiesWithChanges) {
      if (activity.artifacts) {
        for (const artifact of activity.artifacts) {
          if (artifact.type === 'changeSet') {
            const changeSet = artifact as ChangeSetArtifact;
            if (changeSet.gitPatch?.unidiffPatch) {
              gitPatchData = changeSet.gitPatch.unidiffPatch;
              sourceSessionId = activity.session?.id || 'unknown';
              break;
            }
          }
        }
      }
      if (gitPatchData) break;
    }

    if (!gitPatchData) {
      console.log('No recent GitPatch data found in local cache. Please run another session that generates code changes first.');
      return;
    }

    console.log(`Found GitPatch data from session ${sourceSessionId}.`);
    console.log(`Starting analysis session...`);

    // Create a new repoless session to analyze the GitPatch data.
    const session = await jules.session({
      prompt: `You are an expert code reviewer. Analyze the following GitPatch data.
      Identify any potential bugs, areas for optimization, or coding standard violations.
      Write your analysis to a file named 'analysis.md'.

      ## GitPatch Data
      \`\`\`diff
      ${gitPatchData}
      \`\`\`
      `,
    });

    console.log(`Session created: ${session.id}`);

    // Wait for the session to complete
    console.log('Waiting for the agent to complete the analysis...');
    const outcome = await session.result();

    console.log(`Session finished with state: ${outcome.state}`);

    // Retrieve the analysis file
    const files = outcome.generatedFiles();
    const analysisFile = files.get('analysis.md');

    if (analysisFile) {
      console.log('\n--- Analysis Report ---');
      console.log(analysisFile.content);
      console.log('-----------------------\n');
    } else {
      console.log('Analysis file was not generated.');
    }

  } catch (error) {
    if (error instanceof JulesError) {
      console.error(`SDK error: ${error.message}`);
    } else {
      console.error('Unknown error:', error);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runGitPatchImproveSession();
}
