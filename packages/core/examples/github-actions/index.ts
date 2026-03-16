import * as core from '@actions/core';
import * as github from '@actions/github';
import { jules } from '@google/jules-sdk';
import { marked } from 'marked';
import { logStream } from '../_shared/log-stream.js';

/**
 * GitHub Action: `/jules` Slash Command
 *
 * Responds to `/jules <message>` in issue/PR comments.
 * Routes to an existing session on Jules-created PRs,
 * or creates a new session otherwise.
 */

// --- Domain Types ---

interface JulesCommand {
  message: string;
  owner: string;
  repo: string;
}

interface ReplyTarget {
  sessionId: string;
  sha?: string;
}

// --- Parsing ---

/** Extracts `/jules <message>` from a comment body using a proper markdown parser. */
export function parseCommand(body: string): string | null {
  const tokens = marked.lexer(body);

  for (const token of tokens) {
    // Only inspect paragraph tokens — code, blockquote, heading, etc. are excluded
    if (token.type !== 'paragraph') continue;

    const text = token.text.trim();

    if (text === '/jules') return '';
    if (text.startsWith('/jules ')) {
      return text.slice('/jules '.length).trim();
    }
  }

  return null;
}

/** Extracts a session ID from a Jules branch name (e.g., `jules/fix-bug-1234567`). */
function parseReplyTarget(context: typeof github.context): ReplyTarget | null {
  const branch = context.payload.pull_request?.head?.ref ?? '';
  const parts = branch.split('-');
  const lastPart = parts[parts.length - 1];

  // Jules session IDs are numeric strings of 7+ digits
  if (lastPart && /^\d{7,}$/.test(lastPart)) {
    return {
      sessionId: lastPart,
      sha: context.payload.pull_request?.head?.sha,
    };
  }

  return null;
}

// --- CI Context ---

/** Fetches failed CI check summaries for a commit SHA. */
async function fetchFailedChecks(owner: string, repo: string, sha?: string): Promise<string | null> {
  if (!sha || !process.env.GITHUB_TOKEN) return null;

  try {
    const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
    const { data } = await octokit.rest.checks.listForRef({ owner, repo, ref: sha });

    const failures = data.check_runs
      .filter(run => run.conclusion === 'failure')
      .map(run => `- **${run.name}**: ${run.output?.summary ?? 'Failed'}`);

    return failures.length > 0 ? failures.join('\n') : null;
  } catch {
    return null;
  }
}

// --- Session Handlers ---

/** Sends a message (with optional CI context) to an existing Jules session. */
async function replyToSession(cmd: JulesCommand, target: ReplyTarget): Promise<void> {
  core.info(`Replying to session: ${target.sessionId}`);

  const session = jules.session(target.sessionId);

  const ciContext = await fetchFailedChecks(cmd.owner, cmd.repo, target.sha);
  const fullMessage = ciContext
    ? `${cmd.message}\n\n## Failed CI Checks\n${ciContext}`
    : cmd.message;

  await session.send(fullMessage);
  core.info('Message sent.');
  core.setOutput('session-id', target.sessionId);
}

/** Creates a new Jules session and streams it to completion. */
async function createNewSession(cmd: JulesCommand, baseBranch: string): Promise<void> {
  core.info(`Creating session for ${cmd.owner}/${cmd.repo} on ${baseBranch}`);

  const session = await jules.session({
    prompt: cmd.message,
    source: { github: `${cmd.owner}/${cmd.repo}`, baseBranch },
    autoPr: true,
  });

  core.info(`Session created: ${session.id}`);
  core.setOutput('session-id', session.id);

  session.result().then(outcome => {
    core.info(`State: ${outcome.state}`);
    if (outcome.pullRequest) {
      core.info(`PR: ${outcome.pullRequest.url}`);
      core.setOutput('pr-url', outcome.pullRequest.url);
    }
  });

  await logStream(session, {
    planGenerated: (a) => core.info(`[Plan] ${a.plan.steps.length} steps`),
    progressUpdated: (a) => core.info(`[Progress] ${a.title}`),
    sessionCompleted: () => core.info('[Complete]'),
  });
}

// --- Entry Point ---

function resolveBaseBranch(context: typeof github.context): string {
  if (context.payload.pull_request?.base?.ref) return context.payload.pull_request.base.ref;
  if (context.payload.issue) return 'main';
  return context.ref.replace('refs/heads/', '');
}

async function run() {
  if (!process.env.JULES_API_KEY) {
    return core.setFailed('JULES_API_KEY is missing.');
  }

  const context = github.context;
  const commentBody = context.payload.comment?.body ?? '';

  const message = parseCommand(commentBody);
  if (message === null) {
    return core.info('No /jules command found. Skipping.');
  }

  const cmd: JulesCommand = {
    message,
    owner: context.repo.owner,
    repo: context.repo.repo,
  };

  const replyTarget = parseReplyTarget(context);

  if (replyTarget) {
    await replyToSession(cmd, replyTarget);
  } else {
    await createNewSession(cmd, resolveBaseBranch(context));
  }
}

run().catch(e => core.setFailed(e instanceof Error ? e.message : 'Unknown error'));
