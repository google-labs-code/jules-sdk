/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { Buffer } from 'buffer';
import type {
  RestMediaArtifact,
  RestBashOutputArtifact,
  RestChangeSetArtifact,
} from '../src/types.js';

import { mockPlatform } from './mocks/platform.js';

describe('Artifacts', () => {
  // These modules will be dynamically imported to handle environment mocking
  let MediaArtifact: any;
  let BashArtifact: any;
  let ChangeSetArtifact: any;
  let mapRestArtifactToSdkArtifact: any;
  let fs_promises: any;

  describe('in a Node.js environment', () => {
    beforeEach(async () => {
      // Ensure we are in a simulated Node environment
      if (typeof global.process === 'undefined') {
        // @ts-ignore
        global.process = { versions: { node: '20.0.0' } };
      }
      vi.resetModules(); // Isolate module imports for this describe block
      const artifacts = await import('../src/artifacts.js');
      const mappers = await import('../src/mappers.js');
      fs_promises = await import('fs/promises');

      MediaArtifact = artifacts.MediaArtifact;
      BashArtifact = artifacts.BashArtifact;
      ChangeSetArtifact = artifacts.ChangeSetArtifact;
      mapRestArtifactToSdkArtifact = mappers.mapRestArtifactToSdkArtifact;

      vi.clearAllMocks(); // Clear mock history before each test
    });

    describe('MediaArtifact', () => {
      it('should correctly decode base64 and call platform.saveFile', async () => {
        const base64Data = 'SGVsbG8sIFdvcmxkIQ=='; // "Hello, World!"
        const artifact = new MediaArtifact(
          {
            data: base64Data,
            format: 'text/plain',
          },
          mockPlatform,
        );
        const filepath = '/path/to/file.txt';

        await artifact.save(filepath);

        expect(mockPlatform.saveFile).toHaveBeenCalledOnce();
        expect(mockPlatform.saveFile).toHaveBeenCalledWith(
          filepath,
          base64Data,
          'base64',
          undefined,
        );
      });

      it('should pass activityId to platform.saveFile if present', async () => {
        const base64Data = 'SGVsbG8sIFdvcmxkIQ==';
        const activityId = 'act-123';
        const artifact = new MediaArtifact(
          {
            data: base64Data,
            format: 'text/plain',
          },
          mockPlatform,
          activityId,
        );
        const filepath = '/path/to/file.txt';

        await artifact.save(filepath);

        expect(mockPlatform.saveFile).toHaveBeenCalledWith(
          filepath,
          base64Data,
          'base64',
          activityId,
        );
      });

      it('should call platform.createDataUrl when toUrl is called', () => {
        const base64Data = 'SGVsbG8sIFdvcmxkIQ==';
        const mimeType = 'text/plain';
        const artifact = new MediaArtifact(
          {
            data: base64Data,
            format: mimeType,
          },
          mockPlatform,
        );

        const mockUrl = 'data:text/plain;base64,SGVsbG8sIFdvcmxkIQ==';
        (mockPlatform.createDataUrl as Mock).mockReturnValue(mockUrl);

        const url = artifact.toUrl();

        expect(mockPlatform.createDataUrl).toHaveBeenCalledOnce();
        expect(mockPlatform.createDataUrl).toHaveBeenCalledWith(
          base64Data,
          mimeType,
        );
        expect(url).toBe(mockUrl);
      });
    });

    describe('BashArtifact', () => {
      it('should format toString() correctly with stdout', () => {
        const artifact = new BashArtifact({
          command: 'ls -l',
          stdout: 'total 0',
          stderr: '',
          exitCode: 0,
        });
        const expected = `$ ls -l\ntotal 0\n[exit code: 0]`;
        expect(artifact.toString()).toBe(expected);
      });

      it('should format toString() correctly with stderr', () => {
        const artifact = new BashArtifact({
          command: 'grep foo nonexistent.txt',
          stdout: '',
          stderr: 'File not found',
          exitCode: 2,
        });
        const expected = `$ grep foo nonexistent.txt\nFile not found\n[exit code: 2]`;
        expect(artifact.toString()).toBe(expected);
      });

      it('should format toString() correctly with no output and a null exit code', () => {
        const artifact = new BashArtifact({
          command: 'sleep 10',
          stdout: '',
          stderr: '',
          exitCode: null,
        });
        const expected = `$ sleep 10\n[exit code: N/A]`;
        expect(artifact.toString()).toBe(expected);
      });
    });

    describe('parseUnidiff edge cases', () => {
      let parseUnidiff: any;

      beforeEach(async () => {
        // This is a private function, so we need to access it this way.
        const artifactsModule = await import('../src/artifacts.js');
        parseUnidiff = artifactsModule.parseUnidiff;
      });

      it('should return an empty array for undefined input', () => {
        // @ts-ignore
        expect(parseUnidiff(undefined)).toEqual([]);
      });

      it('should return an empty array for null input', () => {
        // @ts-ignore
        expect(parseUnidiff(null)).toEqual([]);
      });

      it('should return an empty array for an empty string', () => {
        expect(parseUnidiff('')).toEqual([]);
      });
    });

    describe('ChangeSetArtifact', () => {
      it('should return an empty result if the unidiffPatch is undefined', () => {
        const artifact = new ChangeSetArtifact('agent', {
          // @ts-ignore
          unidiffPatch: undefined,
        });
        const parsed = artifact.parsed();
        expect(parsed.files).toEqual([]);
        expect(parsed.summary).toEqual({
          totalFiles: 0,
          created: 0,
          modified: 0,
          deleted: 0,
        });
      });
      it('should parse a simple file modification', () => {
        const patch = `diff --git a/src/index.ts b/src/index.ts
index abc123..def456 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 import { foo } from './foo';
+import { bar } from './bar';

 export function main() {`;
        const artifact = new ChangeSetArtifact('agent', {
          unidiffPatch: patch,
        });
        const parsed = artifact.parsed();

        expect(parsed.files).toHaveLength(1);
        expect(parsed.files[0]).toEqual({
          path: 'src/index.ts',
          changeType: 'modified',
          additions: 1,
          deletions: 0,
        });
        expect(parsed.summary).toEqual({
          totalFiles: 1,
          created: 0,
          modified: 1,
          deleted: 0,
        });
      });

      it('should parse a file creation', () => {
        const patch = `diff --git a/src/new-file.ts b/src/new-file.ts
new file mode 100644
index 0000000..abc123
--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,5 @@
+export function newFunction() {
+  return 'hello';
+}
+
+export const value = 42;`;
        const artifact = new ChangeSetArtifact('agent', {
          unidiffPatch: patch,
        });
        const parsed = artifact.parsed();

        expect(parsed.files).toHaveLength(1);
        expect(parsed.files[0]).toEqual({
          path: 'src/new-file.ts',
          changeType: 'created',
          additions: 5,
          deletions: 0,
        });
        expect(parsed.summary.created).toBe(1);
      });

      it('should parse a file deletion', () => {
        const patch = `diff --git a/src/old-file.ts b/src/old-file.ts
deleted file mode 100644
index abc123..0000000
--- a/src/old-file.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export function oldFunction() {
-  return 'goodbye';
-}`;
        const artifact = new ChangeSetArtifact('agent', {
          unidiffPatch: patch,
        });
        const parsed = artifact.parsed();

        expect(parsed.files).toHaveLength(1);
        expect(parsed.files[0]).toEqual({
          path: 'src/old-file.ts',
          changeType: 'deleted',
          additions: 0,
          deletions: 3,
        });
        expect(parsed.summary.deleted).toBe(1);
      });

      it('should parse multiple files with mixed changes', () => {
        const patch = `diff --git a/src/a.ts b/src/a.ts
index abc..def 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
 export { a };
diff --git a/src/b.ts b/src/b.ts
new file mode 100644
--- /dev/null
+++ b/src/b.ts
@@ -0,0 +1 @@
+export const b = 'new';
diff --git a/src/c.ts b/src/c.ts
deleted file mode 100644
--- a/src/c.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-const c = 3;
-export { c };`;
        const artifact = new ChangeSetArtifact('agent', {
          unidiffPatch: patch,
        });
        const parsed = artifact.parsed();

        expect(parsed.files).toHaveLength(3);
        expect(parsed.summary).toEqual({
          totalFiles: 3,
          created: 1,
          modified: 1,
          deleted: 1,
        });
      });

      it('should handle empty patch', () => {
        const artifact = new ChangeSetArtifact('agent', { unidiffPatch: '' });
        const parsed = artifact.parsed();

        expect(parsed.files).toHaveLength(0);
        expect(parsed.summary).toEqual({
          totalFiles: 0,
          created: 0,
          modified: 0,
          deleted: 0,
        });
      });

      it('should expose source and gitPatch properties', () => {
        const patch = 'diff --git a/test.ts b/test.ts';
        const artifact = new ChangeSetArtifact('user', { unidiffPatch: patch });

        expect(artifact.type).toBe('changeSet');
        expect(artifact.source).toBe('user');
        expect(artifact.gitPatch).toEqual({ unidiffPatch: patch });
      });
    });

    describe('Mapper Integration', () => {
      it('should map REST media artifact to a MediaArtifact instance', () => {
        const restArtifact: RestMediaArtifact = {
          media: { data: 'data', format: 'image/png' },
        };
        const sdkArtifact = mapRestArtifactToSdkArtifact(
          restArtifact,
          mockPlatform,
        );
        expect(sdkArtifact).toBeInstanceOf(MediaArtifact);
        expect(sdkArtifact.type).toBe('media');
        expect(typeof sdkArtifact.save).toBe('function');
      });

      it('should map REST bash artifact to a BashArtifact instance', () => {
        const restArtifact: RestBashOutputArtifact = {
          bashOutput: {
            command: 'echo "hi"',
            stdout: 'hi',
            stderr: '',
            exitCode: 0,
          },
        };
        const sdkArtifact = mapRestArtifactToSdkArtifact(restArtifact);
        expect(sdkArtifact).toBeInstanceOf(BashArtifact);
        expect(sdkArtifact.type).toBe('bashOutput');
        expect(typeof sdkArtifact.toString).toBe('function');
      });

      it('should map REST changeset artifact to a ChangeSetArtifact instance', () => {
        const restArtifact: RestChangeSetArtifact = {
          changeSet: {
            source: 'agent',
            gitPatch: {
              unidiffPatch: 'diff --git a/test.ts b/test.ts',
              baseCommitId: 'abc123',
              suggestedCommitMessage: 'test commit',
            },
          },
        };
        const sdkArtifact = mapRestArtifactToSdkArtifact(
          restArtifact,
          mockPlatform,
        );
        expect(sdkArtifact).toBeInstanceOf(ChangeSetArtifact);
        expect(sdkArtifact.type).toBe('changeSet');
        expect(typeof sdkArtifact.parsed).toBe('function');
      });
    });
  });

  describe('in a non-Node.js environment', () => {
    beforeEach(() => {
      vi.resetModules();
    });

    afterEach(() => {
      vi.resetModules();
    });

    it('should cause MediaArtifact.save() to throw an error', async () => {
      // Dynamically import the class AFTER mocking the environment
      const { MediaArtifact: BrowserMediaArtifact } =
        await import('../src/artifacts.js');
      const artifact = new BrowserMediaArtifact(
        {
          data: 'SGVsbG8sIFdvcmxkIQ==',
          format: 'text/plain',
        },
        mockPlatform,
      );

      (mockPlatform.saveFile as Mock).mockImplementation(async () => {
        throw new Error('Saving files is not supported in the browser.');
      });

      await expect(artifact.save('/any/path.txt')).rejects.toThrow(
        'Saving files is not supported in the browser.',
      );
    });
  });

  describe('parseUnidiffWithContent', () => {
    let parseUnidiffWithContent: any;
    let createGeneratedFiles: any;

    beforeEach(async () => {
      vi.resetModules();
      const artifactsModule = await import('../src/artifacts.js');
      parseUnidiffWithContent = artifactsModule.parseUnidiffWithContent;
      createGeneratedFiles = artifactsModule.createGeneratedFiles;
    });

    it('should return an empty array for undefined input', () => {
      expect(parseUnidiffWithContent(undefined)).toEqual([]);
    });

    it('should return an empty array for null input', () => {
      expect(parseUnidiffWithContent(null)).toEqual([]);
    });

    it('should return an empty array for an empty string', () => {
      expect(parseUnidiffWithContent('')).toEqual([]);
    });

    it('should extract content from a created file', () => {
      const patch = `diff --git a/answer.md b/answer.md
new file mode 100644
index 0000000..abc123
--- /dev/null
+++ b/answer.md
@@ -0,0 +1,3 @@
+# Answer
+
+The answer is 42.`;

      const files = parseUnidiffWithContent(patch);

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('answer.md');
      expect(files[0].changeType).toBe('created');
      expect(files[0].content).toBe('# Answer\n\nThe answer is 42.');
      expect(files[0].additions).toBe(3);
      expect(files[0].deletions).toBe(0);
    });

    it('should extract content from a modified file (added lines only)', () => {
      const patch = `diff --git a/src/index.ts b/src/index.ts
index abc123..def456 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,5 @@
 import { foo } from './foo';
+import { bar } from './bar';
+import { baz } from './baz';
 
 export function main() {`;

      const files = parseUnidiffWithContent(patch);

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('src/index.ts');
      expect(files[0].changeType).toBe('modified');
      // For modified files, content only contains added lines
      expect(files[0].content).toBe(
        "import { bar } from './bar';\nimport { baz } from './baz';",
      );
      expect(files[0].additions).toBe(2);
      expect(files[0].deletions).toBe(0);
    });

    it('should return empty content for a deleted file', () => {
      const patch = `diff --git a/src/old-file.ts b/src/old-file.ts
deleted file mode 100644
index abc123..0000000
--- a/src/old-file.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export function oldFunction() {
-  return 'goodbye';
-}`;

      const files = parseUnidiffWithContent(patch);

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('src/old-file.ts');
      expect(files[0].changeType).toBe('deleted');
      expect(files[0].content).toBe('');
      expect(files[0].additions).toBe(0);
      expect(files[0].deletions).toBe(3);
    });

    it('should parse multiple files with content', () => {
      const patch = `diff --git a/README.md b/README.md
new file mode 100644
--- /dev/null
+++ b/README.md
@@ -0,0 +1,2 @@
+# Project
+Description here.
diff --git a/src/main.ts b/src/main.ts
new file mode 100644
--- /dev/null
+++ b/src/main.ts
@@ -0,0 +1 @@
+console.log('Hello');`;

      const files = parseUnidiffWithContent(patch);

      expect(files).toHaveLength(2);
      expect(files[0].path).toBe('README.md');
      expect(files[0].content).toBe('# Project\nDescription here.');
      expect(files[1].path).toBe('src/main.ts');
      expect(files[1].content).toBe("console.log('Hello');");
    });
  });

  describe('createGeneratedFiles', () => {
    let createGeneratedFiles: any;

    beforeEach(async () => {
      vi.resetModules();
      const artifactsModule = await import('../src/artifacts.js');
      createGeneratedFiles = artifactsModule.createGeneratedFiles;
    });

    it('should return all files with .all()', () => {
      const files = [
        {
          path: 'a.ts',
          changeType: 'created' as const,
          content: 'a',
          additions: 1,
          deletions: 0,
        },
        {
          path: 'b.ts',
          changeType: 'modified' as const,
          content: 'b',
          additions: 1,
          deletions: 1,
        },
      ];
      const generated = createGeneratedFiles(files);

      expect(generated.all()).toHaveLength(2);
      expect(generated.all()).toEqual(files);
    });

    it('should find a file by path with .get()', () => {
      const files = [
        {
          path: 'answer.md',
          changeType: 'created' as const,
          content: 'The answer is 42.',
          additions: 1,
          deletions: 0,
        },
        {
          path: 'other.md',
          changeType: 'created' as const,
          content: 'Other content',
          additions: 1,
          deletions: 0,
        },
      ];
      const generated = createGeneratedFiles(files);

      const answer = generated.get('answer.md');
      expect(answer).toBeDefined();
      expect(answer?.content).toBe('The answer is 42.');
    });

    it('should return undefined for non-existent path with .get()', () => {
      const files = [
        {
          path: 'a.ts',
          changeType: 'created' as const,
          content: 'a',
          additions: 1,
          deletions: 0,
        },
      ];
      const generated = createGeneratedFiles(files);

      expect(generated.get('nonexistent.ts')).toBeUndefined();
    });

    it('should filter files by changeType with .filter()', () => {
      const files = [
        {
          path: 'new.ts',
          changeType: 'created' as const,
          content: 'new',
          additions: 1,
          deletions: 0,
        },
        {
          path: 'mod.ts',
          changeType: 'modified' as const,
          content: 'mod',
          additions: 1,
          deletions: 1,
        },
        {
          path: 'del.ts',
          changeType: 'deleted' as const,
          content: '',
          additions: 0,
          deletions: 1,
        },
        {
          path: 'new2.ts',
          changeType: 'created' as const,
          content: 'new2',
          additions: 1,
          deletions: 0,
        },
      ];
      const generated = createGeneratedFiles(files);

      const created = generated.filter('created');
      expect(created).toHaveLength(2);
      expect(created.map((f: any) => f.path)).toEqual(['new.ts', 'new2.ts']);

      const modified = generated.filter('modified');
      expect(modified).toHaveLength(1);
      expect(modified[0].path).toBe('mod.ts');

      const deleted = generated.filter('deleted');
      expect(deleted).toHaveLength(1);
      expect(deleted[0].path).toBe('del.ts');
    });

    it('should return empty array when filtering with no matches', () => {
      const files = [
        {
          path: 'a.ts',
          changeType: 'created' as const,
          content: 'a',
          additions: 1,
          deletions: 0,
        },
      ];
      const generated = createGeneratedFiles(files);

      expect(generated.filter('deleted')).toEqual([]);
    });
  });
});
