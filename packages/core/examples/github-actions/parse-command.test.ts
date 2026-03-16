import { describe, test, expect } from 'bun:test';
import { parseCommand } from './index.js';

describe('parseCommand', () => {
  // --- Positive cases ---

  test('extracts message from /jules command', () => {
    expect(parseCommand('/jules fix the login bug')).toBe('fix the login bug');
  });

  test('returns empty string for bare /jules', () => {
    expect(parseCommand('/jules')).toBe('');
  });

  test('extracts command on second line', () => {
    const body = 'Hey team, can someone take a look?\n\n/jules refactor the auth module';
    expect(parseCommand(body)).toBe('refactor the auth module');
  });

  test('trims extra whitespace from message', () => {
    expect(parseCommand('/jules   add unit tests  ')).toBe('add unit tests');
  });

  test('handles multiline comment body', () => {
    const body = `
Some context about the issue.

/jules implement the feature described above

Thanks!
    `;
    expect(parseCommand(body)).toBe('implement the feature described above');
  });

  // --- False positive protection ---

  test('ignores /jules inside fenced code block (backticks)', () => {
    const body = `Here's an example:

\`\`\`bash
/jules deploy to production
\`\`\`
    `;
    expect(parseCommand(body)).toBeNull();
  });

  test('ignores /jules inside fenced code block (tildes)', () => {
    const body = `Example:

~~~
/jules deploy to production
~~~
    `;
    expect(parseCommand(body)).toBeNull();
  });

  test('ignores /jules inside blockquote', () => {
    const body = `Someone said:

> /jules fix everything
    `;
    expect(parseCommand(body)).toBeNull();
  });

  test('ignores /jules inside inline code', () => {
    const body = 'Use the command `/jules fix the bug` to trigger it.';
    expect(parseCommand(body)).toBeNull();
  });

  test('ignores /jules in a heading', () => {
    const body = '## /jules command usage';
    expect(parseCommand(body)).toBeNull();
  });

  test('ignores /jules in a list item', () => {
    const body = '- /jules fix bugs\n- /jules add tests';
    expect(parseCommand(body)).toBeNull();
  });

  test('ignores /jules embedded in a sentence', () => {
    const body = 'You can use /jules to trigger the bot.';
    expect(parseCommand(body)).toBeNull();
  });

  // --- No command present ---

  test('returns null when no /jules command exists', () => {
    expect(parseCommand('Great work on the PR!')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(parseCommand('')).toBeNull();
  });

  test('returns null for similar but wrong commands', () => {
    expect(parseCommand('/julia fix the bug')).toBeNull();
    expect(parseCommand('/julesy do something')).toBeNull();
  });

  // --- Edge cases ---

  test('handles /jules with only whitespace after', () => {
    expect(parseCommand('/jules   ')).toBe('');
  });

  test('first /jules command wins when multiple paragraphs have commands', () => {
    const body = `/jules first task

/jules second task`;
    expect(parseCommand(body)).toBe('first task');
  });

  test('handles complex markdown document', () => {
    const body = `# Issue: Login is broken

## Steps to reproduce
1. Go to login page
2. Enter credentials
3. Click submit

\`\`\`
/jules this should be ignored
\`\`\`

> /jules this should also be ignored

/jules fix the login form validation on submit

## Expected behavior
The form should validate inputs before submission.
    `;
    expect(parseCommand(body)).toBe('fix the login form validation on submit');
  });
});
