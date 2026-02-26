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

import { describe, it, expect } from 'vitest';
import { parseGitRemoteUrl } from '../shared/auth/git.js';

describe('parseGitRemoteUrl', () => {
  it('parses HTTPS URL', () => {
    const result = parseGitRemoteUrl(
      'https://github.com/google-labs-code/jules-sdk.git',
    );
    expect(result).toEqual({
      owner: 'google-labs-code',
      repo: 'jules-sdk',
      fullName: 'google-labs-code/jules-sdk',
    });
  });

  it('parses HTTPS URL without .git suffix', () => {
    const result = parseGitRemoteUrl(
      'https://github.com/google-labs-code/jules-sdk',
    );
    expect(result).toEqual({
      owner: 'google-labs-code',
      repo: 'jules-sdk',
      fullName: 'google-labs-code/jules-sdk',
    });
  });

  it('parses SSH URL', () => {
    const result = parseGitRemoteUrl(
      'git@github.com:google-labs-code/jules-sdk.git',
    );
    expect(result).toEqual({
      owner: 'google-labs-code',
      repo: 'jules-sdk',
      fullName: 'google-labs-code/jules-sdk',
    });
  });

  it('parses SSH URL without .git suffix', () => {
    const result = parseGitRemoteUrl(
      'git@github.com:google-labs-code/jules-sdk',
    );
    expect(result).toEqual({
      owner: 'google-labs-code',
      repo: 'jules-sdk',
      fullName: 'google-labs-code/jules-sdk',
    });
  });

  it('throws on unrecognized URL', () => {
    expect(() =>
      parseGitRemoteUrl('svn://example.com/repo'),
    ).toThrow('Unable to parse git remote URL');
  });
});
