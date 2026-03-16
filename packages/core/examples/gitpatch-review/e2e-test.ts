import { execa } from 'execa';
import { z } from 'zod';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReviewSuccess } from './src/spec.js';

/**
 * End-to-End Test for the GitPatch Review CLI
 *
 * This script invokes the CLI as a separate process to verify that:
 * 1. The CLI can authenticate with the Jules API (using JULES_API_KEY).
 * 2. It successfully starts and streams two consecutive sessions.
 * 3. When the `--json` flag is provided, the final `stdout` is exclusively
 *    a valid JSON payload matching the `ReviewSuccess` schema.
 * 4. Progress logs are successfully piped to `stderr` and don't corrupt the JSON.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runE2E() {
  const apiKey = process.env.JULES_API_KEY;

  if (!apiKey) {
    console.error('❌ E2E Test Failed: JULES_API_KEY environment variable is missing.');
    process.exit(1);
  }

  console.log('🚀 Starting GitPatch Review CLI E2E Test...\n');

  try {
    // We use execa to easily spawn the CLI, capture stdout/stderr separately,
    // and provide a timeout. The target repo here is arbitrary but must be valid.
    const subprocess = execa('bun', [
      'run',
      'index.ts',
      '-r',
      'davideast/dataprompt',
      '-b',
      'main',
      '-p',
      'Write a Python function that adds two numbers, but name it very badly, use no types, and mess up the indentation.',
      '--json',
    ], {
      env: { JULES_API_KEY: apiKey },
      timeout: 900000, // 15 minute timeout for two LLM sessions
      cwd: __dirname // Ensure we run relative to this e2e script
    });

    // Pipe stderr to our current console so we can watch the progress logs live
    if (subprocess.stderr) {
      subprocess.stderr.pipe(process.stderr);
    }

    const { stdout, exitCode } = await subprocess;

    console.log('\n\n✅ CLI process exited with code:', exitCode);

    if (exitCode !== 0) {
      console.error('❌ E2E Test Failed: CLI exited with a non-zero status code.');
      process.exit(1);
    }

    console.log('--- Raw CLI JSON Output (stdout) ---');
    console.log(stdout);
    console.log('------------------------------------\n');

    // Parse and validate the stdout output against our expected Zod schema
    const parsedJson = JSON.parse(stdout);
    const validationResult = ReviewSuccess.safeParse({ success: true, data: parsedJson });

    if (!validationResult.success) {
      console.error('❌ E2E Test Failed: The JSON output did not match the expected schema.');
      console.error(validationResult.error.format());
      process.exit(1);
    }

    const { data } = validationResult.data;

    console.log('✅ Validation Passed: Output is valid JSON.');
    console.log(`- Code Gen Session ID: ${data.codeGenSessionId}`);
    console.log(`- Review Session ID: ${data.reviewSessionId}`);

    if (data.gitPatchStr && data.gitPatchStr.length > 0) {
      console.log(`- Git Patch Extracted: YES (${data.gitPatchStr.split('\\n').length} lines)`);
    } else {
      console.error('❌ E2E Test Failed: No Git Patch string was found in the output.');
      process.exit(1);
    }

    if (data.reviewMessage && data.reviewMessage.length > 0) {
      console.log(`- Review Message Generated: YES`);
    } else {
      console.error('❌ E2E Test Failed: No Review Message was found in the output.');
      process.exit(1);
    }

    console.log('\n🎉 E2E Test Completed Successfully!');

  } catch (error: any) {
    console.error('\n❌ E2E Test Failed with an exception:');
    if (error.shortMessage) {
      console.error(error.shortMessage); // execa formatting
    }
    console.error(error.message);
    process.exit(1);
  }
}

runE2E();
