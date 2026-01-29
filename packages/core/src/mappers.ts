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

// src/mappers.ts
import {
  MediaArtifact,
  BashArtifact,
  ChangeSetArtifact,
  createGeneratedFiles,
  parseUnidiffWithContent,
} from './artifacts.js';
import { AutomatedSessionFailedError } from './errors.js';
import {
  Activity,
  Artifact,
  ChangeSet,
  SessionOutcome,
  PullRequest,
  RestArtifact,
  SessionResource,
} from './types.js';

/**
 * Maps a raw REST API Artifact resource to the SDK's `Artifact` type.
 * This now instantiates rich classes for certain artifact types.
 *
 * @param restArtifact The raw artifact object from the REST API.
 * @returns A structured `Artifact` object for the SDK.
 * @internal
 */
export function mapRestArtifactToSdkArtifact(
  restArtifact: RestArtifact,
  platform: any,
  activityId?: string,
): Artifact {
  if ('changeSet' in restArtifact) {
    return new ChangeSetArtifact(
      restArtifact.changeSet.source,
      restArtifact.changeSet.gitPatch,
    );
  }
  if ('media' in restArtifact) {
    return new MediaArtifact(restArtifact.media, platform, activityId);
  }
  if ('bashOutput' in restArtifact) {
    return new BashArtifact(restArtifact.bashOutput);
  }
  // This provides a fallback, though the API should always provide a known type.
  throw new Error(`Unknown artifact type: ${JSON.stringify(restArtifact)}`);
}

/**
 * Maps a raw REST API Activity resource to the SDK's discriminated union `Activity` type.
 *
 * **Data Transformation:**
 * - Flattens nested union fields (e.g., `agentMessaged`) into a top-level `type` property.
 * - Extracts the short ID from the full resource `name`.
 * - Recursively maps all artifacts within the activity.
 *
 * @param restActivity The raw activity object from the REST API.
 * @param platform The platform adapter (needed for artifact mapping).
 * @returns A structured `Activity` object for the SDK.
 * @throws {Error} If the activity type is unknown.
 * @internal
 */
export function mapRestActivityToSdkActivity(
  restActivity: any,
  platform: any,
): Activity {
  const {
    name,
    createTime,
    originator,
    artifacts: rawArtifacts,
  } = restActivity;

  const activityId = name.split('/').pop();

  // First, map the artifacts since they are common to all activities.
  const artifacts: Artifact[] = (rawArtifacts || []).map((artifact: any) =>
    mapRestArtifactToSdkArtifact(artifact, platform, activityId),
  );

  const baseActivity = {
    name,
    id: activityId,
    createTime,
    originator: originator || 'system',
    artifacts,
  };

  if (restActivity.agentMessaged) {
    return {
      ...baseActivity,
      type: 'agentMessaged',
      message: restActivity.agentMessaged.agentMessage,
    };
  }
  if (restActivity.userMessaged) {
    return {
      ...baseActivity,
      type: 'userMessaged',
      message: restActivity.userMessaged.userMessage,
    };
  }
  if (restActivity.planGenerated) {
    return {
      ...baseActivity,
      type: 'planGenerated',
      plan: restActivity.planGenerated.plan,
    };
  }
  if (restActivity.planApproved) {
    return {
      ...baseActivity,
      type: 'planApproved',
      planId: restActivity.planApproved.planId,
    };
  }
  if (restActivity.progressUpdated) {
    return {
      ...baseActivity,
      type: 'progressUpdated',
      title: restActivity.progressUpdated.title,
      description: restActivity.progressUpdated.description,
    };
  }
  if (restActivity.sessionCompleted) {
    return {
      ...baseActivity,
      type: 'sessionCompleted',
    };
  }
  if (restActivity.sessionFailed) {
    return {
      ...baseActivity,
      type: 'sessionFailed',
      reason: restActivity.sessionFailed.reason,
    };
  }

  // Fallback for unknown activity types.
  throw new Error('Unknown activity type');
}

/**
 * Maps the final state of a SessionResource to a user-facing Outcome object.
 * This includes extracting the primary pull request and handling the failed state.
 *
 * @param session The final SessionResource from the API.
 * @returns The corresponding Outcome object.
 * @throws {AutomatedSessionFailedError} If the session state is 'failed'.
 */
export function mapSessionResourceToOutcome(session: SessionResource): SessionOutcome {
  if (session.state === 'failed') {
    // TODO: The reason is not available on the session resource directly.
    // This will be improved when the API provides a failure reason.
    throw new AutomatedSessionFailedError(`Session ${session.id} failed.`);
  }

  // Find the pull request output, if it exists.
  const prOutput = session.outputs.find((o) => 'pullRequest' in o);
  const pullRequest = prOutput
    ? (prOutput as { pullRequest: PullRequest }).pullRequest
    : undefined;

  // Find the changeSet output for generatedFiles()
  const changeSetOutput = session.outputs.find((o) => 'changeSet' in o);
  const changeSet = changeSetOutput
    ? (changeSetOutput as { changeSet: ChangeSet }).changeSet
    : undefined;

  return {
    sessionId: session.id,
    title: session.title,
    state: 'completed', // We only call this mapper on a completed session.
    pullRequest,
    outputs: session.outputs,
    generatedFiles: () => {
      if (!changeSet?.gitPatch?.unidiffPatch) {
        return createGeneratedFiles([]);
      }
      const files = parseUnidiffWithContent(changeSet.gitPatch.unidiffPatch);
      return createGeneratedFiles(files);
    },
    changeSet: () => {
      if (!changeSet?.gitPatch) {
        return undefined;
      }
      return new ChangeSetArtifact('session', changeSet.gitPatch);
    },
  };
}
