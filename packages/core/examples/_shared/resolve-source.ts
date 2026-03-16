import { execSync } from 'node:child_process';

/**
 * Resolves the GitHub source for examples.
 * Priority: GITHUB_REPO env var → git remote → default fallback.
 */
export function resolveSource(fallback = 'davideast/dataprompt') {
  const repo = process.env.GITHUB_REPO || detectGitRemote() || fallback;
  const baseBranch = process.env.BASE_BRANCH || 'main';
  return { github: repo, baseBranch };
}

function detectGitRemote(): string | null {
  try {
    const url = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
    // Parse: git@github.com:owner/repo.git or https://github.com/owner/repo.git
    const match = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
