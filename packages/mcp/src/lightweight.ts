import type {
  Activity,
  Artifact,
  LightweightActivity,
  MediaArtifact,
  StrippedMediaArtifact,
  LightweightArtifact,
} from '@google/jules-sdk';
import { toSummary } from '@google/jules-sdk';

export { toSummary };

/**
 * Converts an activity to a lightweight format.
 * @param activity The activity to convert.
 * @param options Options for the conversion.
 * @returns A lightweight representation of the activity.
 */
export function toLightweight(
  activity: Activity,
  options?: { includeArtifacts?: boolean },
): LightweightActivity {
  const summary = toSummary(activity);
  const artifactCount = activity.artifacts?.length ?? 0;

  // Include artifacts by default (opt-out with includeArtifacts: false)
  const shouldIncludeArtifacts = options?.includeArtifacts !== false;
  let artifacts: LightweightArtifact[] | null = null;

  if (shouldIncludeArtifacts && activity.artifacts) {
    artifacts = activity.artifacts.map((artifact: Artifact) => {
      if (artifact.type === 'media') {
        const mediaArtifact = artifact as MediaArtifact;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { data, ...rest } = mediaArtifact;
        const strippedArtifact: StrippedMediaArtifact = {
          ...rest,
          dataStripped: true,
          hasData: true,
        };
        return strippedArtifact;
      }
      return artifact;
    });
  }

  // Extract full message for activities that have one (not truncated like summary)
  let message: string | undefined;
  if ('message' in activity && typeof activity.message === 'string') {
    message = activity.message;
  }

  return { ...summary, message, artifacts, artifactCount };
}
