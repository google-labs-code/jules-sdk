import type { Octokit } from "@octokit/core";

/**
 * Octokit plugin that caches responses using GitHub's ETag mechanism.
 * 304 Not Modified responses don't count against your rate limit.
 */
export function cachePlugin(octokit: Octokit) {
  const cache = new Map<string, { etag: string; data: unknown }>();

  octokit.hook.wrap("request", async (request, options) => {
    const key = `${options.method} ${options.url}`;
    const cached = cache.get(key);

    if (cached) {
      (options as any).headers = {
        ...(options as any).headers,
        "if-none-match": cached.etag,
      };
    }

    try {
      const response = await request(options);
      const etag = response.headers.etag;
      if (etag) {
        cache.set(key, { etag, data: response.data });
      }
      return response;
    } catch (error: any) {
      if (error.status === 304 && cached) {
        return { ...error.response, data: cached.data, status: 200 };
      }
      throw error;
    }
  });
}
