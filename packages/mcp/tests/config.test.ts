import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';

// Hoist mock values
const mocks = vi.hoisted(() => ({
  homedir: '/mock/home',
  join: (...args: string[]) => args.join('/'),
}));

vi.mock('fs');
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
    it('should return empty object if config file does not exist', () => {
      (fs.existsSync as any).mockReturnValue(false);
      const config = loadConfig();
      expect(config).toEqual({});
    });

    it('should return parsed config if file exists', () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(
        JSON.stringify({ apiKey: 'test-key' }),
      );
      const config = loadConfig();
      expect(config).toEqual({ apiKey: 'test-key' });
    });

    it('should return empty object on parse error', () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue('invalid-json');
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const config = loadConfig();
      expect(config).toEqual({});
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('saveConfig', () => {
    it('should create directory if it does not exist', () => {
      (fs.existsSync as any).mockReturnValue(false);
      saveConfig({ apiKey: 'new-key' });
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.jules'),
        { recursive: true },
      );
    });

    it('should write config to file', () => {
      saveConfig({ apiKey: 'new-key' });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('config.json'),
        JSON.stringify({ apiKey: 'new-key' }, null, 2),
        { mode: 0o600 },
      );
    });
  });

  describe('resolveApiKey', () => {
    it('should prioritize environment variable', () => {
      vi.stubEnv('JULES_API_KEY', 'env-key');
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(
        JSON.stringify({ apiKey: 'file-key' }),
      );

      const key = resolveApiKey();
      expect(key).toBe('env-key');
    });

    it('should fallback to config file if env var is missing', () => {
      vi.stubEnv('JULES_API_KEY', '');
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(
        JSON.stringify({ apiKey: 'file-key' }),
      );

      const key = resolveApiKey();
      expect(key).toBe('file-key');
    });

    it('should return undefined if neither is set', () => {
      vi.stubEnv('JULES_API_KEY', '');
      (fs.existsSync as any).mockReturnValue(false);

      const key = resolveApiKey();
      expect(key).toBeUndefined();
    });
  });
});
