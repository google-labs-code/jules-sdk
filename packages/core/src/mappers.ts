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
  RestSessionResource,
  SessionResource,
<<<<<<< fix-api-protocol-alignment-structural-unions-3476972031133059438
  RestSessionResource,
  RestSessionOutput,
  RestSource,
  SessionOutput,
  Source,
=======
>>>>>>> main
  SessionState,
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
    const media = restArtifact.media;
    // Map mimeType to format
    if (media.mimeType && !media.format) {
      media.format = media.mimeType;
    }
    return new MediaArtifact(media, platform, activityId);
  }
  if ('bashOutput' in restArtifact) {
    const bash = restArtifact.bashOutput;
    // Map output to stdout (and ensure stderr is present)
    if (bash.output !== undefined && bash.stdout === undefined) {
      bash.stdout = bash.output;
      bash.stderr = '';
    }
    return new BashArtifact(bash);
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

export function mapRestStateToSdkState(state: string): SessionState {
  switch (state) {
    case 'STATE_UNSPECIFIED':
      return 'unspecified';
    case 'QUEUED':
      return 'queued';
    case 'PLANNING':
      return 'planning';
    case 'AWAITING_PLAN_APPROVAL':
      return 'awaitingPlanApproval';
    case 'AWAITING_USER_FEEDBACK':
      return 'awaitingUserFeedback';
    case 'IN_PROGRESS':
      return 'inProgress';
    case 'PAUSED':
      return 'paused';
    case 'FAILED':
      return 'failed';
    case 'COMPLETED':
      return 'completed';
    default:
      return 'unspecified';
  }
}

export function mapRestSourceToSdkSource(rest: RestSource): Source {
  if (rest.githubRepo) {
    return {
      type: 'githubRepo',
      name: rest.name,
      id: rest.id,
      githubRepo: rest.githubRepo,
    };
  }
  throw new Error(`Unknown source type: ${JSON.stringify(rest)}`);
}

export function mapRestOutputToSdkOutput(
  rest: RestSessionOutput,
): SessionOutput {
  if (rest.pullRequest) {
    return {
      type: 'pullRequest',
      pullRequest: rest.pullRequest,
    };
  }
  if (rest.changeSet) {
    return {
      type: 'changeSet',
      changeSet: rest.changeSet,
    };
  }
  throw new Error(`Unknown output type: ${JSON.stringify(rest)}`);
}

export function mapRestSessionToSdkSession(
  rest: RestSessionResource,
  platform?: any,
): SessionResource {
  const session: SessionResource = {
    ...rest,
    state: mapRestStateToSdkState(rest.state),
    outputs: (rest.outputs || []).map(mapRestOutputToSdkOutput),
    source: rest.source ? mapRestSourceToSdkSource(rest.source) : undefined,
    generatedFiles: rest.generatedFiles,
    activities: undefined,
    outcome: undefined as any,
  };

  if (rest.activities && platform) {
    session.activities = rest.activities.map((a) =>
      mapRestActivityToSdkActivity(a, platform),
    );
  }

  try {
    session.outcome = mapSessionResourceToOutcome(session);
  } catch (error) {
    if (error instanceof AutomatedSessionFailedError) {
      session.outcome = {
        sessionId: session.id,
        title: session.title,
        state: 'failed',
        outputs: session.outputs,
        generatedFiles: () => createGeneratedFiles([]),
        changeSet: () => undefined,
      };
    } else {
      throw error;
    }
  }

  return session;
}

/**
 * Maps a raw session resource from the API to the SDK's SessionResource type.
 * Normalizes state enum values from SCREAMING_SNAKE_CASE to camelCase.
 *
 * @param session The raw session object from the REST API.
 * @returns A normalized SessionResource object.
 * @internal
 */
export function mapRestSessionToSdkSession(
  session: RestSessionResource,
): SessionResource {
  const stateMapping: Record<string, SessionState> = {
    UNSPECIFIED: 'unspecified',
    QUEUED: 'queued',
    PLANNING: 'planning',
    AWAITING_PLAN_APPROVAL: 'awaitingPlanApproval',
    AWAITING_USER_FEEDBACK: 'awaitingUserFeedback',
    IN_PROGRESS: 'inProgress',
    PAUSED: 'paused',
    FAILED: 'failed',
    COMPLETED: 'completed',
  };

  const rawState = session.state as string;
  let state = rawState as SessionState;

  if (rawState && rawState in stateMapping) {
    state = stateMapping[rawState];
  } else if (rawState && rawState === rawState.toUpperCase()) {
    // Fallback for unknown SCREAMING_SNAKE_CASE states
    state = rawState.toLowerCase() as SessionState;
  }

  return {
    ...session,
    state,
    // Initialize required SDK-only fields that are missing from raw API response
    outcome: {} as any, // This will be populated later by mapSessionResourceToOutcome if needed, or ignored for partial updates
    generatedFiles: undefined,
  };
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
  const outputs = session.outputs ?? [];
  const prOutput = outputs.find((o) => 'pullRequest' in o);
  const pullRequest = prOutput
    ? (prOutput as { pullRequest: PullRequest }).pullRequest
    : undefined;

  // Find the changeSet output for generatedFiles()
  const changeSetOutput = outputs.find((o) => 'changeSet' in o);
  const changeSet = changeSetOutput
    ? (changeSetOutput as { changeSet: ChangeSet }).changeSet
    : undefined;

  return {
    sessionId: session.id,
    title: session.title,
    state: 'completed', // We only call this mapper on a completed session.
    pullRequest,
    outputs,
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
