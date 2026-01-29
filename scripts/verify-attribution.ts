import { execSync } from 'node:child_process';
import * as fs from 'node:fs';

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  type: 'User' | 'Organization' | 'Bot';
}

/**
 * Extracts all potential @username mentions from the PR body.
 * Filters out known bot patterns, npm scopes, and duplicates.
 * Does NOT validate against GitHub API yet.
 */
function findUserCandidates(body: string): string[] {
  // Match @username but capture what comes after to check for npm scopes
  const regex = /@([a-zA-Z0-9-]+)(\/)?/g;
  const candidates: string[] = [];
  const seen = new Set<string>();
  let match;

  while ((match = regex.exec(body)) !== null) {
    const username = match[1].toLowerCase();
    const isNpmScope = match[2] === '/'; // If followed by /, it's an npm scope like @google/jules

    // Skip npm scopes, known bots, and duplicates
    if (
      isNpmScope ||
      username === 'google-labs-jules' ||
      username.endsWith('[bot]') ||
      seen.has(username)
    ) {
      continue;
    }
    seen.add(username);
    candidates.push(match[1]); // Preserve original case
  }
  return candidates;
}

async function getGitHubUser(
  username: string,
  token: string,
): Promise<GitHubUser> {
  const res = await fetch(`https://api.github.com/users/${username}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to fetch user ${username}: ${res.status} ${res.statusText}`,
    );
  }

  return res.json() as Promise<GitHubUser>;
}

/**
 * Validates candidates against the GitHub API and returns the first actual User.
 * Skips Organizations, Bots, and non-existent usernames.
 */
async function findValidHumanUser(
  candidates: string[],
  token: string,
): Promise<GitHubUser | null> {
  for (const candidate of candidates) {
    try {
      const user = await getGitHubUser(candidate, token);
      if (user.type === 'User') {
        return user;
      }
      console.log(`  ⏭️  Skipping @${candidate} (type: ${user.type})`);
    } catch {
      console.log(`  ⏭️  Skipping @${candidate} (not found or API error)`);
    }
  }
  return null;
}

async function main() {
  const prBody = process.env.PR_BODY || '';
  const token = process.env.GITHUB_TOKEN;

  // We need to check all commits in the PR range
  // The BASE_REF and HEAD_REF are usually available in PR context,
  // but we can rely on git log origin/base..HEAD if checked out properly.
  // In GitHub Actions 'checkout@v4' with fetch-depth: 0, we can use origin/target...HEAD
  const baseRef = process.env.GITHUB_BASE_REF || 'main';
  const headSha = process.env.GITHUB_HEAD_SHA || 'HEAD';

  const prUserLogin = process.env.PR_USER_LOGIN || '';
  const prUserId = process.env.PR_USER_ID || '';

  if (prUserLogin !== 'google-labs-jules' && !prUserLogin.endsWith('[bot]')) {
    console.log('Skipping attribution check for human PR.');
    process.exit(0);
  }

  if (!token) {
    console.error('❌ GITHUB_TOKEN is required.');
    process.exit(1);
  }

  console.log('🔍 Analyzing PR body for attribution...');

  // Extract all @username candidates from PR body
  const candidates = findUserCandidates(prBody);
  console.log(
    `  Found ${candidates.length} candidate(s): ${candidates.map((c) => `@${c}`).join(', ') || '(none)'}`,
  );

  // Validate each candidate against GitHub API to find first actual User
  const validUser = await findValidHumanUser(candidates, token);

  let targetUserId = '';
  let targetUserLogin = '';
  let targetUserName = '';

  if (validUser) {
    console.log(`✅ Found valid human user: @${validUser.login}`);
    targetUserId = String(validUser.id);
    targetUserLogin = validUser.login;
    targetUserName = validUser.name || validUser.login;
  } else {
    // Fallback to PR creator (for bot PRs without valid mentions)
    console.log(
      `ℹ️ No valid human user found in mentions. Using PR creator: ${prUserLogin}`,
    );
    targetUserLogin = prUserLogin;
    targetUserId = prUserId;
    try {
      const user = await getGitHubUser(prUserLogin, token);
      targetUserName = user.name || user.login;
    } catch {
      targetUserName = prUserLogin;
    }
  }

  if (!targetUserLogin || !targetUserId) {
    console.error('❌ Could not determine user for attribution.');
    process.exit(1);
  }

  // The email is the definitive identifier - name can vary (display name vs login)
  const expectedEmail = `${targetUserId}+${targetUserLogin}@users.noreply.github.com`;
  // Use display name for the suggested trailer (e.g., "David East" not "davideast")
  const trailer = `Co-authored-by: ${targetUserName} <${expectedEmail}>`;
  console.log(`🎯 Expected Email: "${expectedEmail}"`);
  console.log(`🎯 Suggested Trailer: "${trailer}"`);

  console.log(`🔍 Checking commits in range origin/${baseRef}...${headSha}`);

  let logs = '';
  try {
    // Get all commit messages in the PR range
    logs = execSync(
      `git log origin/${baseRef}...${headSha} --pretty=%B`,
    ).toString();
  } catch (e) {
    console.warn('⚠️ Could not fetch commit range. Checking HEAD only.');
    logs = execSync('git show -s --format=%B HEAD').toString();
  }

  // Check for the email pattern - the name before it can vary
  // Valid: "Co-authored-by: David East <id+login@...>" or "Co-authored-by: davideast <id+login@...>"
  if (logs.includes(expectedEmail) && logs.includes('Co-authored-by:')) {
    console.log('✅ Attribution present in at least one commit.');
    process.exit(0);
  } else {
    console.error('❌ Missing attribution. Expected trailer:', trailer);

    // Write to GITHUB_OUTPUT if available
    const githubOutput = process.env.GITHUB_OUTPUT;
    if (githubOutput) {
      const message = `Missing attribution. Please append this to your commit message: ${trailer}`;
      const b64Log = Buffer.from(message).toString('base64');
      fs.appendFileSync(githubOutput, `log=${b64Log}\n`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
