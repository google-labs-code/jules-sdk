import fs from 'fs';
import path from 'path';
import os from 'os';

export interface Config {
  apiKey?: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.jules');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export async function loadConfig(): Promise<Config> {
  try {
    const content = await fs.promises.readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.warn('Failed to load config file:', error);
    }
  }
  return {};
}

export async function saveConfig(config: Config): Promise<void> {
  try {
    await fs.promises.mkdir(CONFIG_DIR, { recursive: true });
    await fs.promises.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), {
      mode: 0o600, // Read/write only for the owner
    });
  } catch (error) {
    console.error('Failed to save config file:', error);
    throw error;
  }
}

export async function resolveApiKey(): Promise<string | undefined> {
  if (process.env.JULES_API_KEY) {
    return process.env.JULES_API_KEY;
  }
  const config = await loadConfig();
  return config.apiKey;
}
