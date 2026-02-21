import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';

// Hoist mock values
const mocks = vi.hoisted(() => ({
  homedir: '/mock/home',
  join: (...args: string[]) => args.join('/'),
}));

vi.mock('fs', () => ({
  default: {
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    },
  },
}));
vi.mock('os', () => ({
  default: {
    homedir: vi.fn(() => mocks.homedir),
  },
  homedir: vi.fn(() => mocks.homedir),
}));
vi.mock('path', () => ({
  default: {
    join: vi.fn((...args: any[]) => mocks.join(...args)),
  },
  join: vi.fn((...args: any[]) => mocks.join(...args)),
}));

// Import after mocks are defined
import { loadConfig, saveConfig, resolveApiKey } from '../src/config.js';

describe('MCP Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('loadConfig', () => {
    it('should return empty object if config file does not exist', async () => {
      const error = new Error('File not found');
      (error as any).code = 'ENOENT';
      (fs.promises.readFile as any).mockRejectedValue(error);
      const config = await loadConfig();
      expect(config).toEqual({});
    });

    it('should return parsed config if file exists', async () => {
      (fs.promises.readFile as any).mockResolvedValue(
        JSON.stringify({ apiKey: 'test-key' }),
      );
      const config = await loadConfig();
      expect(config).toEqual({ apiKey: 'test-key' });
    });

    it('should return empty object on parse error', async () => {
      (fs.promises.readFile as any).mockResolvedValue('invalid-json');
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const config = await loadConfig();
      expect(config).toEqual({});
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('saveConfig', () => {
    it('should create directory if it does not exist', async () => {
      (fs.promises.mkdir as any).mockResolvedValue(undefined);
      (fs.promises.writeFile as any).mockResolvedValue(undefined);
      await saveConfig({ apiKey: 'new-key' });
      expect(fs.promises.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('.jules'),
        { recursive: true },
      );
    });

    it('should write config to file', async () => {
      (fs.promises.mkdir as any).mockResolvedValue(undefined);
      (fs.promises.writeFile as any).mockResolvedValue(undefined);
      await saveConfig({ apiKey: 'new-key' });
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('config.json'),
        JSON.stringify({ apiKey: 'new-key' }, null, 2),
        { mode: 0o600 },
      );
    });
  });

  describe('resolveApiKey', () => {
    it('should prioritize environment variable', async () => {
      vi.stubEnv('JULES_API_KEY', 'env-key');
      (fs.promises.readFile as any).mockResolvedValue(
        JSON.stringify({ apiKey: 'file-key' }),
      );

      const key = await resolveApiKey();
      expect(key).toBe('env-key');
    });

    it('should fallback to config file if env var is missing', async () => {
      vi.stubEnv('JULES_API_KEY', '');
      (fs.promises.readFile as any).mockResolvedValue(
        JSON.stringify({ apiKey: 'file-key' }),
      );

      const key = await resolveApiKey();
      expect(key).toBe('file-key');
    });

    it('should return undefined if neither is set', async () => {
      vi.stubEnv('JULES_API_KEY', '');
      const error = new Error('File not found');
      (error as any).code = 'ENOENT';
      (fs.promises.readFile as any).mockRejectedValue(error);

      const key = await resolveApiKey();
      expect(key).toBeUndefined();
    });
  });
});
