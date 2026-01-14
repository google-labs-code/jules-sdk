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

/**
 * A unified response interface that works across Node, Browser, and GAS.
 */
export interface PlatformResponse {
  ok: boolean;
  status: number;
  json<T = any>(): Promise<T>;
  text(): Promise<string>;
}

/**
 * Abstract interface for platform-specific functionality.
 * Allows the SDK to run in both Node.js, browser, and Google Apps Script environments.
 */
export interface Platform {
  /**
   * Saves a file to the platform's filesystem.
   */
  saveFile(
    filepath: string,
    data: string,
    encoding: 'base64',
    activityId?: string,
  ): Promise<void>;

  /**
   * Pauses execution for the specified duration.
   */
  sleep(ms: number): Promise<void>;

  /**
   * Creates a data URL for the given data.
   */
  createDataUrl(data: string, mimeType: string): string;

  /**
   * Unified network fetch.
   */
  fetch(input: string, init?: any): Promise<PlatformResponse>;

  /**
   * Unified crypto operations.
   */
  crypto: {
    /**
     * Generates a standard UUID v4.
     */
    randomUUID(): string;

    /**
     * Signs a string using HMAC-SHA256 and returns a Base64Url encoded string.
     * Used for minting Capability Tokens.
     */
    sign(text: string, secret: string): Promise<string>;

    /**
     * Verifies a signature.
     */
    verify(text: string, signature: string, secret: string): Promise<boolean>;
  };

  /**
   * Unified encoding/decoding operations.
   */
  encoding: {
    /**
     * Encodes a string to Base64URL format.
     * (URL-safe: '-' instead of '+', '_' instead of '/', no padding)
     */
    base64Encode(text: string): string;

    /**
     * Decodes a Base64URL encoded string.
     */
    base64Decode(text: string): string;
  };

  /**
   * Retrieves an environment variable or configuration value.
   *
   * @param key The name of the environment variable (e.g., "JULES_API_KEY").
   * @returns The value of the environment variable, or `undefined` if not set.
   */
  getEnv(key: string): string | undefined;

  // These are optional because they are only used for checkpointing,
  // which is a Node-specific feature.
  readFile?(path: string): Promise<string>;
  writeFile?(path: string, content: string): Promise<void>;
  deleteFile?(path: string): Promise<void>;
}
