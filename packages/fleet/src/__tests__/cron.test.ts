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
import { buildCron, mergeInterval, dispatchOffset } from '../init/templates/cron.js';

describe('buildCron', () => {
  it('throws for intervals < 5 minutes', () => {
    expect(() => buildCron(3)).toThrow('at least 5 minutes');
  });

  // Sub-hourly
  it('generates every 30 min cron', () => {
    expect(buildCron(30)).toBe('*/30 * * * *');
  });

  it('generates every 30 min with offset', () => {
    expect(buildCron(30, 15)).toBe('15-59/30 * * * *');
  });

  it('generates every 15 min cron', () => {
    expect(buildCron(15)).toBe('*/15 * * * *');
  });

  it('generates every 5 min cron', () => {
    expect(buildCron(5)).toBe('*/5 * * * *');
  });

  // Hourly
  it('generates every hour cron', () => {
    expect(buildCron(60)).toBe('0 */1 * * *');
  });

  it('generates every 2 hours', () => {
    expect(buildCron(120)).toBe('0 */2 * * *');
  });

  it('generates every 6 hours', () => {
    expect(buildCron(360)).toBe('0 */6 * * *');
  });

  it('generates every 6 hours with 1h offset', () => {
    expect(buildCron(360, 60)).toBe('0 1-23/6 * * *');
  });

  it('generates every 12 hours', () => {
    expect(buildCron(720)).toBe('0 */12 * * *');
  });

  it('generates every 12 hours with 1h offset', () => {
    expect(buildCron(720, 60)).toBe('0 1-23/12 * * *');
  });

  // Daily
  it('generates daily at 5am UTC', () => {
    expect(buildCron(1440)).toBe('0 5 * * *');
  });

  it('generates daily at 6am UTC (1h offset)', () => {
    expect(buildCron(1440, 60)).toBe('0 6 * * *');
  });

  it('wraps daily offset past 24', () => {
    // 5 + 20 = 25, which wraps to 1
    expect(buildCron(1440, 20 * 60)).toBe('0 1 * * *');
  });
});

describe('mergeInterval', () => {
  it('returns half the main interval', () => {
    expect(mergeInterval(360)).toBe(180);
  });

  it('returns minimum of 15 minutes', () => {
    expect(mergeInterval(20)).toBe(15);
  });

  it('returns 15 for 30-minute interval', () => {
    expect(mergeInterval(30)).toBe(15);
  });
});

describe('dispatchOffset', () => {
  it('returns half the interval', () => {
    expect(dispatchOffset(360)).toBe(180);
  });

  it('returns 15 for 30-minute interval', () => {
    expect(dispatchOffset(30)).toBe(15);
  });
});
