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

/**
 * Build a cron expression for GitHub Actions schedule triggers.
 *
 * @param intervalMinutes - How often to run (≥ 5, GitHub Actions minimum)
 * @param offsetMinutes   - Offset from the base interval (default 0).
 *                          For hourly+ intervals, this is converted to hours.
 * @returns A valid cron expression string
 *
 * Examples:
 *   buildCron(30)      → "* /30 * * * *"   (every 30 min)
 *   buildCron(30, 15)  → "15-59/30 * * * *" (every 30 min, offset 15)
 *   buildCron(360)     → "0 * /6 * * *"     (every 6 hours)
 *   buildCron(360, 60) → "0 1-23/6 * * *"   (every 6 hours, offset 1h)
 *   buildCron(1440)    → "0 5 * * *"        (daily at 5am UTC)
 *   buildCron(1440, 60)→ "0 6 * * *"        (daily at 6am UTC)
 */
export function buildCron(intervalMinutes: number, offsetMinutes = 0): string {
  if (intervalMinutes < 5) {
    throw new Error(
      `Interval must be at least 5 minutes (GitHub Actions minimum). Got: ${intervalMinutes}`,
    );
  }

  // Sub-hourly: minute-level cron
  if (intervalMinutes < 60) {
    const offsetMin = offsetMinutes % 60;
    if (offsetMin === 0) {
      return `*/${intervalMinutes} * * * *`;
    }
    // e.g. "15-59/30 * * * *" — start at offset, step by interval
    return `${offsetMin}-59/${intervalMinutes} * * * *`;
  }

  const intervalHours = Math.floor(intervalMinutes / 60);
  const offsetHours = Math.floor(offsetMinutes / 60);

  // Daily (24h): fixed hour
  if (intervalHours >= 24) {
    const hour = (5 + offsetHours) % 24; // base at 5am UTC
    return `0 ${hour} * * *`;
  }

  // Hourly+ intervals
  if (offsetHours === 0) {
    return `0 */${intervalHours} * * *`;
  }
  // e.g. "0 1-23/6 * * *" — start at offset hour, step by interval
  return `0 ${offsetHours}-23/${intervalHours} * * *`;
}

/**
 * Compute the merge interval from the main pipeline interval.
 * Merge runs at half the main interval (minimum 15 minutes).
 */
export function mergeInterval(intervalMinutes: number): number {
  return Math.max(15, Math.floor(intervalMinutes / 2));
}

/**
 * Compute the dispatch offset from the main interval.
 * Dispatch runs at half the interval offset from analyze.
 */
export function dispatchOffset(intervalMinutes: number): number {
  return Math.floor(intervalMinutes / 2);
}
