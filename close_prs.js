import { App } from 'octokit';
import fs from 'fs';

const appId = process.env.FLEET_APP_ID;
const installationId = process.env.FLEET_APP_INSTALLATION_ID;
const privateKeyBase64 = process.env.FLEET_APP_PRIVATE_KEY_BASE64;
const privateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');

const app = new App({
  appId,
  privateKey,
});

async function closePRs() {
  const octokit = await app.getInstallationOctokit(installationId);
  const prs = [134, 135, 136, 138, 139, 140];
  const owner = 'google-labs-code';
  const repo = 'jules-sdk';

  for (const pr of prs) {
    try {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pr,
        body: 'Superseded by batched PR #166.',
      });

      await octokit.rest.pulls.update({
        owner,
        repo,
        pull_number: pr,
        state: 'closed',
      });
      console.log(`Closed PR #${pr}`);
    } catch (e) {
      console.error(`Failed to close PR #${pr}`, e);
    }
  }
}

closePRs();
