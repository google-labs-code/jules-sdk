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

import { writeFile, readFile, rm } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { setTimeout } from 'node:timers/promises';
import * as crypto from 'node:crypto';
import { Platform, PlatformResponse } from './types.js';

/**
 * Node.js implementation of the Platform interface.
 */
export class NodePlatform implements Platform {
  /**
   * Saves a file to the local filesystem using `node:fs/promises`.
   *
   * **Side Effects:**
   * - Writes a file to disk.
   * - Overwrites the file if it already exists.
   */
  async saveFile(
    filepath: string,
    data: string,
    encoding: 'base64',
    activityId?: string, // unused in Node.js, standard filesystem doesn't support this metadata easily
  ): Promise<void> {
    const buffer = Buffer.from(data, encoding);
    await writeFile(filepath, buffer);
  }

  async sleep(ms: number): Promise<void> {
    await setTimeout(ms);
  }

  createDataUrl(data: string, mimeType: string): string {
    return `data:${mimeType};base64,${data}`;
  }

  async fetch(input: string, init?: any): Promise<PlatformResponse> {
    const res = await global.fetch(input, init);
    return {
      ok: res.ok,
      status: res.status,
      json: () => res.json(),
      text: () => res.text(),
    };
  }

  crypto = {
    randomUUID: () => crypto.randomUUID(),

    async sign(text: string, secret: string): Promise<string> {
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(text);
      return hmac.digest('base64url');
    },

    async verify(
      text: string,
      signature: string,
      secret: string,
    ): Promise<boolean> {
      const expected = await this.sign(text, secret);
      // Use timingSafeEqual to prevent timing attacks
      const a = Buffer.from(expected);
      const b = Buffer.from(signature);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    },
  };

  encoding = {
    base64Encode: (text: string): string => {
      return Buffer.from(text).toString('base64url');
    },

    base64Decode: (text: string): string => {
      return Buffer.from(text, 'base64url').toString('utf-8');
    },
  };

  getEnv(key: string): string | undefined {
    return process.env[key];
  }

  async readFile(path: string): Promise<string> {
    return readFile(path, 'utf-8');
  }

  async writeFile(path: string, content: string): Promise<void> {
    await writeFile(path, content, 'utf-8');
  }

  async deleteFile(path: string): Promise<void> {
    await rm(path, { force: true });
  }
}
