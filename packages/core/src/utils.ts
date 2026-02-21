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
 * The internal engine for jules.all()
 *
 * @param items - Data to process
 * @param mapper - Async function (item) => result
 * @param options - Configuration options
 */
export async function pMap<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  options: {
    concurrency?: number;
    stopOnError?: boolean;
    delayMs?: number;
  } = {},
): Promise<R[]> {
  const concurrency = options.concurrency ?? 3;
  const stopOnError = options.stopOnError ?? true;
  const delayMs = options.delayMs ?? 0;

  const results = new Array<R>(items.length);
  const errors = new Array<Error | unknown>();
  let nextIndex = 0;

  const workers = new Array(concurrency).fill(0).map(async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) {
        break;
      }
      const item = items[index];

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      try {
        results[index] = await mapper(item, index);
      } catch (err) {
        if (stopOnError) {
          throw err;
        }
        errors.push(err);
      }
    }
  });

  await Promise.all(workers);

  if (!stopOnError && errors.length > 0) {
    throw new AggregateError(
      errors,
      'Multiple errors occurred during jules.all()',
    );
  }

  return results;
}

/**
 * Sanitizes a URL by removing sensitive information like query parameters and fragments.
 * This is useful for error messages and logging to avoid leaking credentials.
 */
export function sanitizeUrl(url: string | URL): string {
  const urlString = url.toString();
  try {
    const parsedUrl = new URL(urlString);

    const sensitiveKeys = ['key', 'token', 'apiKey', 'access_token'];
    for (const key of sensitiveKeys) {
      parsedUrl.searchParams.delete(key);
    }

    parsedUrl.hash = '';

    let result = parsedUrl.toString();
    // URL.toString() might add a trailing slash if there was none and no path.
    // We want to preserve the original URL's "slashedness" for consistency.
    if (
      result.endsWith('/') &&
      !urlString.split('?')[0].split('#')[0].endsWith('/')
    ) {
      result = result.slice(0, -1);
    }
    return result;
  } catch {
    return urlString;
  }
}
