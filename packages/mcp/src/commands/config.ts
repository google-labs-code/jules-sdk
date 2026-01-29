import chalk from 'chalk';
import * as inquirer from '@inquirer/prompts';
import { saveConfig } from '../config.js';

interface ConfigOptions {
  key?: string;
}

export async function configAction(options: ConfigOptions) {
  try {
    let apiKey: string;

    if (options.key !== undefined) {
      // Non-interactive mode
      if (!options.key.trim()) {
        console.error(chalk.red('Error: API Key cannot be empty'));
        process.exit(1);
      }
      apiKey = options.key;
    } else {
      // Interactive mode (existing behavior)
      apiKey = await inquirer.password({
        message: 'Enter your Jules API Key:',
        mask: '*',
        validate: (input) =>
          input.trim().length > 0 || 'API Key cannot be empty',
      });
    }

    saveConfig({ apiKey });
    console.log(chalk.green('✓ Configuration saved successfully.'));
  } catch (error) {
    if (error instanceof Error && error.name === 'ExitPromptError') {
      console.log(chalk.yellow('\nConfiguration cancelled.'));
    } else {
      console.error(chalk.red('Failed to save configuration:'), error);
    }
  }
}
