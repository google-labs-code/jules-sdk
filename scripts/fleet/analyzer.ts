// scripts/fleet/analyzer.ts
import { readFileSync } from 'fs';
import { parseArgs } from 'util';
import { jules } from '@google/jules-sdk';
import { CachedOctokit } from './github/issues.js';
import { getGitRepoInfo } from './github/git.js';

// Parse CLI arguments: bun run analyzer.ts --milestone 1 --goal goals/api-drift.md
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    milestone: { type: 'string' },
    goal: { type: 'string' },
  },
});

if (!values.milestone || !values.goal) {
  console.error(
    'Usage: bun run analyzer.ts --milestone <ID> --goal <PATH_TO_MD>',
  );
  process.exit(1);
}

const MILESTONE_ID = values.milestone;
const GOAL_FILE_PATH = values.goal;

/** Local helper to compress issue context */
function formatAnalyzerContext(issue: any): string {
  const state = issue.state_reason
    ? `${issue.state} (${issue.state_reason})`
    : issue.state;
  const body = issue.body
    ? issue.body.length > 250
      ? issue.body.substring(0, 250) + '...'
      : issue.body
    : 'No description.';

  return `- #${issue.number}: ${issue.title}\n  State: ${state} | Updated: ${issue.updated_at}\n  Context: ${body.replace(/\n/g, ' ')}\n`;
}

async function runAnalyzer() {
  const repoInfo = await getGitRepoInfo();
  const octokit = new CachedOctokit({ auth: process.env.GITHUB_TOKEN });

  console.log(
    `📡 Fetching historical context for Milestone ${MILESTONE_ID}...`,
  );

  // 1. Fetch Open Issues
  const { data: openIssues } = await octokit.rest.issues.listForRepo({
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    state: 'open',
    milestone: MILESTONE_ID,
    per_page: 50,
  });

  // 2. Fetch Recently Closed Issues (Last 14 Days)
  const date = new Date();
  date.setDate(date.getDate() - 14);
  const { data: closedIssues } = await octokit.rest.issues.listForRepo({
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    state: 'closed',
    milestone: MILESTONE_ID,
    since: date.toISOString(),
    per_page: 50,
  });

  const openContext =
    openIssues
      .filter((i) => !i.pull_request)
      .map(formatAnalyzerContext)
      .join('\n') || 'None.';
  const closedContext =
    closedIssues
      .filter((i) => !i.pull_request)
      .map(formatAnalyzerContext)
      .join('\n') || 'None.';

  // 3. Read the Goal-Specific Instructions
  const goalInstructions = readFileSync(GOAL_FILE_PATH, 'utf-8');

  // 4. Construct the Generic Prompt
  const prompt = `
${goalInstructions}

---

## Historical Context (The Memory)
You must read this history to deduplicate your insights. Do NOT propose drift or fixes that are already covered by an Open issue or rejected in a recently Closed issue.

**Open Issues (In Progress / Backlog):**
${openContext}

**Recently Closed Issues (Last 14 Days):**
${closedContext}

---

## Dispatching Insights (Strict Output Format)
If you discover actionable insights based on your goal, use the \`gh\` CLI in your environment to create an issue for the engineering fleet.

**Required CLI format:**
\`\`\`bash
gh issue create \\
  --title "[Analyzer Insight] <Describe the insight>" \\
  --milestone "${MILESTONE_ID}" \\
  --label "status: pending-dispatch" \\
  --body-file <path_to_markdown_file>
\`\`\`

**Required Markdown Body Format:**
The file you pass to \`--body-file\` MUST end with this hidden orchestration payload so the execution fleet can pick it up:

\`\`\`markdown
### Analysis
[Your cognitive reasoning and proposed architectural fix]

### Target Impact
- Files to modify: [List files]

\`\`\`
`;

  console.log(`🔍 Dispatching Analyzer session for ${GOAL_FILE_PATH}...`);

  const session = await jules.session({
    prompt,
    source: {
      github: repoInfo.fullName,
      baseBranch: process.env.FLEET_BASE_BRANCH,
    },
    autoPr: false, // Analyzer only creates issues
  });

  console.log(`✅ Analyzer session started: ${session.id}`);
}

runAnalyzer().catch(console.error);
