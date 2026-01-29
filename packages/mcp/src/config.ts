import fs from 'fs';
import path from 'path';
import os from 'os';

export interface Config {
  apiKey?: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.jules');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function loadConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.warn('Failed to load config file:', error);
  }
  return {};
}

export function saveConfig(config: Config) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
      mode: 0o600, // Read/write only for the owner
    });
  } catch (error) {
    console.error('Failed to save config file:', error);
    throw error;
  }
}

export function resolveApiKey(): string | undefined {
  if (process.env.JULES_API_KEY) {
    return process.env.JULES_API_KEY;
  }
  const config = loadConfig();
  return config.apiKey;
}
