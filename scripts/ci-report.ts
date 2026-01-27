// scripts/ci-report.ts
import { jules } from '@google/jules-sdk';

/**
 * Replicates the logic to find the human user from the PR body.
 */
function findHumanUser(body: string): string | null {
  const regex = /@([a-zA-Z0-9-]+)/g;
  let match;
  while ((match = regex.exec(body)) !== null) {
    const username = match[1];
    if (username !== 'google-labs-jules' && !username.endsWith('[bot]')) {
      return username;
    }
  }
  return null;
}

/**
 * Fetches a GitHub user's ID from their username.
 */
async function getGitHubUserId(username: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/users/${username}`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id: number };
    return String(data.id);
  } catch {
    return null;
  }
}

async function report() {
  try {
    const branchName = process.env.BRANCH_NAME;
    if (!branchName) {
      console.error('❌ Missing BRANCH_NAME environment variable.');
      process.exit(1);
    }

    const sessionId = branchName.split('-').pop();
    if (!sessionId || !/^\d+$/.test(sessionId)) return;

    const apiKey = process.env.JULES_API_KEY;
    if (!apiKey) {
      console.error('❌ Missing JULES_API_KEY environment variable.');
      process.exit(1);
    }

    // Context from GitHub Actions
    const prBody = process.env.PR_BODY || '';
    const prUserLogin = process.env.PR_USER_LOGIN || '';
    const prUserId = process.env.PR_USER_ID || '';
    const errorType = process.env.ERROR_TYPE || 'Unknown Failure';
    const filesChangedRaw = process.env.FILES_CHANGED || '';
    const errorLogB64 = process.env.ERROR_LOG_B64;

    const log = errorLogB64
      ? Buffer.from(errorLogB64, 'base64').toString('utf-8')
      : 'No details provided.';

    // 1. Generate the Attribution Trailer
    // Must fetch the actual GitHub ID for mentioned users, not use PR creator's ID
    const mentionedUser = findHumanUser(prBody);
    let targetLogin = prUserLogin;
    let targetId = prUserId;

    if (mentionedUser) {
      const fetchedId = await getGitHubUserId(mentionedUser);
      if (fetchedId) {
        targetLogin = mentionedUser;
        targetId = fetchedId;
      }
    }

    const trailer = `Co-authored-by: ${targetLogin} <${targetId}+${targetLogin}@users.noreply.github.com>`;

    // 2. Format Files list
    const filesList = filesChangedRaw
      .split(' ')
      .filter((f) => f.trim().length > 0)
      .map((f) => `- \`${f}\``)
      .join('\n');

    // 3. Build instruction based on error type
    let instruction = `Please fix the issues in branch \`${branchName}\`.`;

    if (errorType === 'Attribution Check') {
      instruction = `🚨 **Missing Attribution Detected**

Run this command to fix attribution:
\`\`\`bash
git commit --amend --no-edit --message="$(git log -1 --pretty=%B)" --message="${trailer}"
\`\`\``;
    }

    const client = jules.with({ apiKey });
    const content = `🚨 **CI Failure: ${errorType}**

**Files Changed:**
${filesList || 'None detected.'}

**Logs:**
\`\`\`text
${log}
\`\`\`

${instruction}`;

    console.log(`🚀 Reporting to Jules Session: ${sessionId}...`);
    await client.session(sessionId).send(content);
    console.log('✅ Success: Report sent.');
  } catch (e: any) {
    console.error('❌ Failed to report:', e);
    process.exit(1);
  }
}

report();
