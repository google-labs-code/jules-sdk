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

import { jules, JulesError } from '@google/jules-sdk';

try {
  console.log('🚀 Starting a new session...');

  const session = await jules.session('11176958331510368078');

  console.log(`✅ Session created with ID: ${session.id}`);
  console.log('\n... Streaming activities ...');

  for await (const activity of session.stream()) {
    switch (activity.type) {
      case 'progressUpdated': {
        // Title may be missing for artifact-only updates (bash outputs, etc)
        const label =
          activity.title ||
          activity.description ||
          (activity.artifacts?.length
            ? `[${activity.artifacts.length} artifact(s)]`
            : 'Working...');
        console.log(`[AGENT] ${label}`);
        break;
      }
      case 'agentMessaged':
        console.log(`[AGENT] ${activity.message}`); // ✅ message is string
        break;
      case 'planGenerated':
        console.log(`[PLAN] ${activity.plan.steps.length} steps.`); // ✅ plan is required
        break;
      case 'sessionFailed':
        console.error(`[FAIL] ${activity.reason}`); // ✅ reason is string
        break;
    }
  }

  const outcome = await session.result();
  console.log('\n✅ Session finished:', outcome.state);
  if (outcome.pullRequest) console.log(`🔗 PR: ${outcome.pullRequest.url}`);
} catch (error) {
  if (error instanceof JulesError) {
    console.error(`❌ SDK error: ${error.message}`);
  } else {
    console.error('❌ Unexpected error:', error);
  }
}
