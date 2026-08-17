import { test, expect } from 'vitest';
import { parseUnidiff, parseUnidiffWithContent } from '../../src/artifacts.js';

test('benchmark parseUnidiff', () => {
  // Generate a large diff patch
  const fileCount = 200;
  const linesPerFile = 100;
  let patch = '';

  for (let f = 0; f < fileCount; f++) {
    patch += `diff --git a/src/file_${f}.ts b/src/file_${f}.ts\n`;
    patch += `index abc${f}..def${f} 100644\n`;
    if (f % 3 === 0) {
      // Created
      patch += `--- /dev/null\n`;
      patch += `+++ b/src/file_${f}.ts\n`;
    } else if (f % 3 === 1) {
      // Deleted
      patch += `--- a/src/file_${f}.ts\n`;
      patch += `+++ /dev/null\n`;
    } else {
      // Modified
      patch += `--- a/src/file_${f}.ts\n`;
      patch += `+++ b/src/file_${f}.ts\n`;
    }
    patch += `@@ -1,3 +1,4 @@\n`;
    for (let l = 0; l < linesPerFile; l++) {
      if (l % 2 === 0) {
        patch += `+added line ${l}\n`;
      } else {
        patch += `-deleted line ${l}\n`;
      }
    }
  }

  const start1 = performance.now();
  const res1 = parseUnidiff(patch);
  const end1 = performance.now();
  console.log(
    `parseUnidiff: parsed ${res1.length} files in ${(end1 - start1).toFixed(3)}ms`,
  );

  const start2 = performance.now();
  const res2 = parseUnidiffWithContent(patch);
  const end2 = performance.now();
  console.log(
    `parseUnidiffWithContent: parsed ${res2.length} files in ${(end2 - start2).toFixed(3)}ms`,
  );

  expect(res1.length).toBe(fileCount);
  expect(res2.length).toBe(fileCount);
});
