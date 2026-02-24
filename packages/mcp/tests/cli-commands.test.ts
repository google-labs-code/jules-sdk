import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import { doctorAction } from '../src/commands/doctor.js';
import { resolveApiKey } from '../src/config.js';
import { jules } from '@google/jules-sdk';

// Mocks
vi.mock('fs');
vi.mock('os');
vi.mock('path');
vi.mock('dns/promises', () => ({
  default: {
    lookup: vi.fn(),
  },
}));
vi.mock('@inquirer/prompts');
vi.mock('../src/config.js');
vi.mock('@google/jules-sdk', () => ({
  jules: {
    with: vi.fn(),
  },
}));

describe('CLI Commands', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;
  let processStdoutWriteSpy: any;

  beforeEach(() => {
    vi.resetAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as any);
    processStdoutWriteSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    // Default mocks
    (os.homedir as any).mockReturnValue('/mock/home');
    (path.join as any).mockImplementation((...args: string[]) =>
      args.join('/'),
    );
    (path.dirname as any).mockImplementation((p: string) =>
      p.substring(0, p.lastIndexOf('/')),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('doctorAction', () => {
    it('should exit 0 if all checks pass', async () => {
      // Mock checks passing
      (resolveApiKey as any).mockResolvedValue('valid-key');
      const mockClient = {
        sessions: vi.fn().mockResolvedValue([]), // mock thenable cursor
      };
      (jules.with as any).mockReturnValue(mockClient);

      await doctorAction();

      expect(processExitSpy).not.toHaveBeenCalled(); // Implicit success
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('All checks passed'),
      );
    });

    it('should exit 1 if checks fail', async () => {
      // Mock failure (missing API key)
      (resolveApiKey as any).mockResolvedValue(undefined);

      await doctorAction();

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Doctor found issues'),
      );
    });

    it('should check connectivity', async () => {
      const dns = await import('dns/promises');
      (dns.default.lookup as any).mockResolvedValue({ address: '1.1.1.1' });
      (resolveApiKey as any).mockResolvedValue('valid-key');
      const mockClient = { sessions: vi.fn().mockResolvedValue([]) };
      (jules.with as any).mockReturnValue(mockClient);

      await doctorAction();

      expect(dns.default.lookup).toHaveBeenCalled();
    });
  });
});
