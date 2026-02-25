import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { fileURLToPath, pathToFileURL } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const CORE_PKG_DIR = path.join(ROOT_DIR, 'packages', 'core');

async function runCommand(
  command: string,
  cwd: string = ROOT_DIR,
): Promise<string> {
  console.log(`$ ${command} [in ${path.relative(ROOT_DIR, cwd) || '.'}]`);
  try {
    const { stdout } = await execAsync(command, {
      cwd,
      maxBuffer: 1024 * 1024 * 10,
    });
    return stdout.trim();
  } catch (error: any) {
    // console.error(`Error executing command: ${command}`);
    if (error.stdout) console.error('--- STDOUT ---\n', error.stdout);
    if (error.stderr) console.error('--- STDERR ---\n', error.stderr);
    throw error;
  }
}

async function main() {
  let tarballPath: string | undefined;
  let tmpDir: string | undefined;

  try {
    // --- Argument Parsing ---
    const args = process.argv.slice(2);
    let version: string | undefined;
    let tool: 'npm' | 'bun' = 'npm';

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--tool') {
        const next = args[i + 1];
        if (next === 'npm' || next === 'bun') {
          tool = next;
          i++;
        } else {
          throw new Error('--tool must be "npm" or "bun"');
        }
      } else if (!arg.startsWith('-')) {
        if (!version) version = arg;
        else
          throw new Error(
            `Multiple version arguments provided: ${version}, ${arg}`,
          );
      }
    }

    const isLocal = !version;
    console.log(`\n📋 Smoke Test Configuration:`);
    console.log(
      `   Mode: ${isLocal ? 'LOCAL (build & pack)' : `REMOTE (install jules-sdk@${version})`}`,
    );
    console.log(`   Tool: ${tool}`);

    if (isLocal) {
      console.log('\n=== 1. Build and Pack (Local) ===');
      await runCommand('npm run build', ROOT_DIR);

      const packOutput = await runCommand('npm pack', CORE_PKG_DIR);
      const lines = packOutput.trim().split('\n');
      const tarballName = lines[lines.length - 1].trim();

      if (!tarballName || !tarballName.endsWith('.tgz')) {
        throw new Error(
          `Could not determine tarball filename from output:\n${packOutput}`,
        );
      }

      tarballPath = path.join(CORE_PKG_DIR, tarballName);
      console.log(`Creating tarball: ${tarballPath}`);

      console.log('\n=== 2. Inspect Tarball Contents ===');
      const tarList = await runCommand(`tar -tf "${tarballPath}"`, ROOT_DIR);
      const files = new Set(tarList.split('\n').map((f) => f.trim()));

      const REQUIRED_FILES = [
        'package/package.json',
        'package/README.md',
        'package/dist/index.mjs',
        'package/dist/index.d.ts',
      ];

      const missing = REQUIRED_FILES.filter((f) => !files.has(f));
      if (missing.length > 0) {
        console.error('Tarball contents:', Array.from(files).sort());
        throw new Error(
          `❌ Tarball is missing critical files:\n   - ${missing.join('\n   - ')}`,
        );
      }
      console.log('✅ Tarball contains all critical files.');
    }

    console.log('\n=== 3. Functional Verification ===');
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jules-sdk-smoke-'));
    console.log(`Created temporary directory: ${tmpDir}`);

    // 3a. Initialize temp project
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify(
        {
          name: 'smoke-test-consumer',
          type: 'module',
        },
        null,
        2,
      ),
    );

    // 3b. Install dependencies
    const installTarget = isLocal ? tarballPath! : `jules-sdk@${version}`;
    console.log(`Installing ${installTarget} using ${tool}...`);

    if (tool === 'npm') {
      await runCommand(
        `npm install "${installTarget}" typescript @types/node`,
        tmpDir,
      );
    } else {
      // Bun needs explicit package name mapping for local tarballs sometimes,
      // and prefers file URLs.
      const bunPackage = isLocal
        ? `jules-sdk@${pathToFileURL(tarballPath!).href}`
        : `jules-sdk@${version}`;
      await runCommand(`bun add ${bunPackage} typescript @types/node`, tmpDir);
    }

    // 3c. Type Check
    console.log('\n--- Running Type Check ---');
    const testTs = `
import { jules } from '@google/jules-sdk';
async function test() {
  // Verify types resolve and we can access methods
  if (typeof jules.run !== 'function') {
      throw new Error('Runtime type mismatch during type check fake run');
  }
}
`;
    await fs.writeFile(path.join(tmpDir, 'test.ts'), testTs);
    await fs.writeFile(
      path.join(tmpDir, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            target: 'ESNext',
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            typeRoots: ['./node_modules/@types'],
          },
        },
        null,
        2,
      ),
    );

    const tscCommand = tool === 'bun' ? 'bun x tsc' : 'npx tsc';
    await runCommand(tscCommand, tmpDir);
    console.log('✅ Type Check Passed');

    // 3d. Runtime Check
    console.log('\n--- Running Runtime Check ---');
    const testJs = `
import { jules } from '@google/jules-sdk';
import assert from 'node:assert';

console.log('Testing runtime import...');
try {
  assert.ok(typeof jules.run === 'function', 'jules.run should be a function');
  assert.ok(typeof jules.session === 'function', 'jules.session should be a function');
  console.log('✅ Runtime import successful');
} catch (e) {
  console.error('Runtime failed:', e);
  process.exit(1);
}
`;
    await fs.writeFile(path.join(tmpDir, 'test.js'), testJs);
    const runRuntimeCommand =
      tool === 'bun' ? 'bun run test.js' : 'node test.js';
    await runCommand(runRuntimeCommand, tmpDir);

    console.log('\n✨ Smoke Test Passed Successfully! ✨');
  } catch (error) {
    console.error('\n❌ Smoke Test Failed!');
    console.error(error);
    process.exit(1);
  } finally {
    if (tarballPath) await fs.unlink(tarballPath).catch(() => {});
    if (tmpDir)
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

main();
