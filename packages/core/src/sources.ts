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

// src/sources.ts
import { ApiClient } from './api.js';
import { JulesApiError } from './errors.js';
import {
  Source,
  SourceManager,
  GitHubRepo,
  ListSourcesOptions,
} from './types.js';

// Internal type representing the raw source from the REST API
interface RestGitHubRepo {
  owner: string;
  repo: string;
  isPrivate: boolean;
  defaultBranch?: { displayName: string };
  branches?: { displayName: string }[];
}

type RawSource = {
  name: string;
  id: string;
  githubRepo?: RestGitHubRepo;
};

// Internal type for the paginated list response
type ListSourcesResponse = {
  sources: RawSource[];
  nextPageToken?: string;
};

/**
 * Maps a raw API source object to the SDK's discriminated union Source type.
 * @internal
 */
function mapRawSourceToSdkSource(rawSource: RawSource): Source {
  if (rawSource.githubRepo) {
    const { defaultBranch, branches, ...rest } = rawSource.githubRepo;

    return {
      name: rawSource.name,
      id: rawSource.id,
      type: 'githubRepo',
      githubRepo: {
        ...rest,
        defaultBranch: defaultBranch?.displayName,
        branches: branches?.map((b) => b.displayName),
      },
    };
  }
  // This is a safeguard; based on current API, we only have githubRepo.
  // If other source types were added, we'd need to handle them here.
  throw new Error(`Unknown source type for source: ${rawSource.name}`);
}

/**
 * Implements the logic for the SourceManager.
 * @internal
 */
class SourceManagerImpl {
  private apiClient: ApiClient;

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient;
  }

  /**
   * Lists all connected sources.
   *
   * **Logic:**
   * - Automatically handles API pagination by following `nextPageToken`.
   * - Yields sources one by one as they are retrieved.
   */
  async *list(options: ListSourcesOptions = {}): AsyncIterable<Source> {
    let pageToken: string | undefined = undefined;

    while (true) {
      const params: Record<string, string> = {
        pageSize: (options.pageSize || 100).toString(),
      };
      if (options.filter) {
        params.filter = options.filter;
      }
      if (pageToken) {
        params.pageToken = pageToken;
      }

      const response = await this.apiClient.request<ListSourcesResponse>(
        'sources',
        { query: params },
      );

      if (response && response.sources) {
        for (const rawSource of response.sources) {
          yield mapRawSourceToSdkSource(rawSource);
        }
      }

      pageToken = response?.nextPageToken;
      if (!pageToken) {
        break;
      }
    }
  }

  /**
   * Retrieves a specific source by its external identifier.
   *
   * **Data Transformation:**
   * - Constructs a resource name (e.g., `sources/github/owner/repo`) from the input filter.
   *
   * @param filter Filter criteria (currently supports GitHub repo name).
   * @returns The matching Source object, or `undefined` if not found (404).
   * @throws {Error} If the filter format is invalid.
   */
  async get(filter: { github: string }): Promise<Source | undefined> {
    const { github } = filter;
    if (!github || !github.includes('/')) {
      throw new Error("Invalid GitHub filter. Expected format: 'owner/repo'.");
    }

    const resourceName = `sources/github/${github}`;

    try {
      const rawSource = await this.apiClient.request<RawSource>(resourceName);
      if (!rawSource) {
        return undefined;
      }
      return mapRawSourceToSdkSource(rawSource);
    } catch (error) {
      if (error instanceof JulesApiError && error.status === 404) {
        return undefined; // Gracefully return undefined for 404s
      }
      throw error; // Re-throw other errors
    }
  }
}

/**
 * Creates a SourceManager instance.
 * The SourceManager is a callable object (an async iterator) with a `get` method attached.
 * @internal
 */
export function createSourceManager(apiClient: ApiClient): SourceManager {
  const manager = new SourceManagerImpl(apiClient);

  const callable = manager.list.bind(manager);

  // Attach the 'get' method to the callable function object
  const sourceManager = callable as SourceManager;
  sourceManager.get = manager.get.bind(manager);

  return sourceManager;
}
