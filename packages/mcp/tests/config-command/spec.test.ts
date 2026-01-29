import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import yaml from 'js-yaml';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { configAction } from '../../src/commands/config.js';
import * as config from '../../src/config.js';
import * as inquirer from '@inquirer/prompts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SPEC_FILE = path.resolve(
  __dirname,
  '../../spec/config-command/cases.yaml',
);

// Mock dependencies that cause side effects
vi.mock('../../src/config.js', () => ({
  saveConfig: vi.fn(),
  loadConfig: vi.fn(),
}));

vi.mock('@inquirer/prompts', () => ({
  password: vi.fn(),
}));

// Test Case Interface from YAML
interface ConfigTestCase {
  id: string;
  description: string;
  status: 'pending' | 'implemented';
  priority: string;
  when: 'config --key' | 'config';
  given: {
    args: string[];
  };
  then: {
    configFile?: {
      apiKey: string;
    };
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    behavior?: string;
  };
}

// Helper to parse strings like "contains '...'" from the spec
const getContainsValue = (str: string | undefined): string => {
  if (!str) return '';
  const match = str.match(/contains "(.*)"/);
  return match ? match[1] : '';
};

describe('MCP Config Command Spec', async () => {
  const specContent = await fs.readFile(SPEC_FILE, 'utf-8');
  // Filter for tests that are ready to be run
  const testCases = (yaml.load(specContent) as ConfigTestCase[]).filter(
    (c) => c.status === 'implemented',
  );

  let mockConsoleLog: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;
  let mockProcessExit: any;

  beforeEach(() => {
    // Spy on console and process.exit to capture output and prevent test termination
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockProcessExit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as any);
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original implementations
    vi.restoreAllMocks();
  });

  for (const tc of testCases) {
    it(`${tc.id}: ${tc.description}`, async () => {
      // Manually construct the options object that commander would pass to the action
      const options: { key?: string } = {};
      const keyIndex = tc.given.args.indexOf('--key');
      if (keyIndex !== -1 && tc.given.args.length > keyIndex + 1) {
        options.key = tc.given.args[keyIndex + 1];
      }

      // If the test case expects interactive behavior, mock the prompt's return value
      if (tc.then.behavior?.includes('prompts for API key interactively')) {
        vi.mocked(inquirer.password).mockResolvedValue('interactive-api-key');
      }

      // Execute the command action with the constructed options
      await configAction(options);

      // Assertions based on the 'then' block of the spec
      if (tc.then.configFile) {
        expect(config.saveConfig).toHaveBeenCalledWith({
          apiKey: tc.then.configFile.apiKey,
        });
      }

      if (tc.then.behavior?.includes('prompts for API key interactively')) {
        expect(inquirer.password).toHaveBeenCalled();
        expect(config.saveConfig).toHaveBeenCalledWith({
          apiKey: 'interactive-api-key',
        });
      }

      if (tc.then.stdout) {
        const expectedOutput = getContainsValue(tc.then.stdout);
        const allLogCalls = mockConsoleLog.mock.calls.flat().join('\\n');
        expect(allLogCalls).toContain(expectedOutput);
      }

      if (tc.then.stderr) {
        const expectedOutput = getContainsValue(tc.then.stderr);
        const allErrorCalls = mockConsoleError.mock.calls.flat().join('\\n');
        expect(allErrorCalls).toContain(expectedOutput);
      }

      if (tc.then.exitCode !== undefined) {
        expect(mockProcessExit).toHaveBeenCalledWith(tc.then.exitCode);
      }
    });
  }
});
