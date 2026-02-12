import { jules } from '@google/jules-sdk'
import { analyzeIssuesPrompt } from './prompts/analyze-issues.js'
import { getIssuesAsMarkdown } from './github/markdown.js'

const issuesMarkdown = await getIssuesAsMarkdown()
const prompt = analyzeIssuesPrompt({ issuesMarkdown })

const session = await jules.session({
  prompt,
  source: {
    github: "google-labs-code/jules-sdk",
    baseBranch: "video/test-for-video"
  },
  autoPr: true
})

console.log(session.id)
