import { jules } from "@google/jules-sdk";

const session = jules.session('16738000940211177969')

for await (const activity of session.stream()) {
  console.log(activity.type)
  console.log(activity.name)
  if (activity.type === 'planGenerated') {
    console.log(activity.plan.steps.length)
    activity.plan.steps.forEach(s => {
      console.log(s.title)
      console.log(s.description)
    })
  }
  if (activity.type === 'progressUpdated') {
    const artifact = activity.artifacts.at(0)!;
    if (artifact.type === 'changeSet') {
      const parsedGitpatch = artifact.parsed();
      console.log('Commit Message:', artifact.gitPatch.suggestedCommitMessage)
      console.log(parsedGitpatch.summary)
      parsedGitpatch.files.forEach(file => {
        console.log('path:', file.path)
      })
      console.log(artifact.gitPatch.unidiffPatch)
    }
  }
}