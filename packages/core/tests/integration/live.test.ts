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

import { jules as defaultJules } from '../../src/index.js';
import { describe, it, expect } from 'vitest';

const API_KEY = process.env.JULES_API_KEY;
const KNOWN_SESSION_ID = process.env.KNOWN_SESSION_ID;

describe.skipIf(!API_KEY || !KNOWN_SESSION_ID)('Live API Tests', () => {
  const jules = defaultJules.with({ apiKey: API_KEY });

  it('should rehydrate a session and fetch its info', async () => {
    const session = jules.session(KNOWN_SESSION_ID!);
    const info = await session.info();

    expect(info).toBeDefined();
    expect(info.id).toBe(KNOWN_SESSION_ID);
    expect(info.name).toBe(`sessions/${KNOWN_SESSION_ID}`);
  }, 30000);

  it('should stream activities from a rehydrated session', async () => {
    const session = jules.session(KNOWN_SESSION_ID!);
    let firstActivity;
    for await (const activity of session.stream()) {
      firstActivity = activity;
      break;
    }

    expect(firstActivity).toBeDefined();
  }, 30000);

  it('should create a new session with baseBranch', async () => {
    const session = await jules.session({
      prompt: 'Say hello world in a markdown file. Do nothing else.',
      source: { github: 'davideast/dataprompt', baseBranch: 'main' },
    });

    const info = await session.info();
    expect(info).toBeDefined();
    expect(info.id).toBeDefined();
    expect(info.sourceContext?.githubRepoContext?.startingBranch).toBe('main');

    console.log('Created session:', info.id);
  }, 60000);
});
