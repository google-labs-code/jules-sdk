// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type { Octokit } from 'octokit';
import type { FleetEmitter } from '../../shared/events.js';

/**
 * Upload a secret to GitHub Actions using NaCl sealed-box encryption.
 *
 * Uses the repo public key endpoint + libsodium-wrappers.
 */
export async function uploadSecret(
  octokit: Octokit,
  owner: string,
  repo: string,
  secretName: string,
  secretValue: string,
  emit: FleetEmitter,
): Promise<{ success: boolean; error?: string }> {
  emit({ type: 'init:secret:uploading', name: secretName });

  try {
    // 1. Get the repo public key for encryption
    const { data: publicKey } = await octokit.rest.actions.getRepoPublicKey({
      owner,
      repo,
    });

    // 2. Encrypt the secret using libsodium
    const sodium = await import('libsodium-wrappers');
    await sodium.default.ready;

    const binKey = sodium.default.from_base64(
      publicKey.key,
      sodium.default.base64_variants.ORIGINAL,
    );
    const binSecret = sodium.default.from_string(secretValue);
    const encrypted = sodium.default.crypto_box_seal(binSecret, binKey);
    const encryptedBase64 = sodium.default.to_base64(
      encrypted,
      sodium.default.base64_variants.ORIGINAL,
    );

    // 3. Upload the encrypted secret
    await octokit.rest.actions.createOrUpdateRepoSecret({
      owner,
      repo,
      secret_name: secretName,
      encrypted_value: encryptedBase64,
      key_id: publicKey.key_id,
    });

    emit({ type: 'init:secret:uploaded', name: secretName });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit({
      type: 'init:secret:skipped',
      name: secretName,
      reason: message,
    });
    return { success: false, error: message };
  }
}
