---
name: fleet-triage
description: Cognitive triage of fleet audit findings. Read issue content, evaluate labeling accuracy, and determine open/close/dispatch/relabel actions for fleet-managed issues. Use when triaging undispatched issues or reviewing audit scan results.
allowed-tools: run_command(gh:*) run_command(fleet:*) view_file write_to_file read_url_content
---

# Fleet Triage

Cognitive triage of fleet-managed issues. The audit scan surfaces findings deterministically; **you** make the judgment calls.

## When to Use

- After running `fleet audit scan` and seeing cognitive findings
- Before running `fleet dispatch` to prevent wasting sessions on non-actionable issues
- When asked to triage, clean up, or review fleet issues

## Core Principle

**Tools are evidence, you are expertise.** The scan tells you what exists. You read the content and decide what to do.

## Process

### Phase 1: Build a Lightweight Index

Pull all open issues as a summary table. **Do NOT read issue bodies yet.**

```bash
gh issue list --repo <owner>/<repo> --state open --limit 50 \
  --json number,title,labels,milestone
```

Classify each issue into buckets by title and labels alone:

| Bucket | Signal | Typical Action |
|--------|--------|----------------|
| **Insight** | Title contains `[Insight]`, `[Fleet Insight]`, or label `fleet-insight` | Likely close — informational only |
| **Assessment** | Title contains `[Assessment]`, or label `fleet-assessment` | Evaluate — may be actionable or stale |
| **Execution** | Title contains `[Fleet Execution]`, label `fleet` without insight/assessment | Likely dispatch — has code work |
| **Ambiguous** | Mixed signals or unlabeled | Needs deep dive (Phase 3) |

Record the index in a triage artifact (see [Triage Artifact](#triage-artifact)).

### Phase 2: Batch Triage from Index

For **Insight** and **Assessment** buckets, you can often decide without reading the body:

- **Duplicate insights** (same title pattern, sequential numbers like "Update 2", "Update 3", "Update 4") → Close older duplicates, keep latest
- **Insights with no milestone** → Likely orphaned, close
- **Assessments with linked PRs** → Check if PR is merged; if so, close

Update the triage artifact with decisions.

### Phase 3: Deep Dive (One at a Time)

For **Ambiguous** or **Execution** issues only:

```bash
gh issue view <N> --repo <owner>/<repo>
```

Read the body. Evaluate:

1. **Is there actionable code work?** Look for "Files to modify:", "Proposed Implementation", specific code paths
2. **Is it stale?** Has the work already been done by another PR? Check linked PRs
3. **Are the labels accurate?** Does an "Execution" issue actually describe an insight?
4. **Should it be dispatched?** Only if there's concrete code work with clear acceptance criteria

Record your decision in the triage artifact before moving to the next issue.

### Phase 4: Apply Decisions

After all decisions are recorded, present the triage artifact to the user for review. Then apply:

```bash
# Close issues
gh issue close <N> --repo <owner>/<repo> --comment "Closing: <reason>"

# Relabel
gh issue edit <N> --repo <owner>/<repo> --remove-label fleet --add-label fleet-insight

# Dispatch (only confirmed actionable issues)
fleet dispatch --owner <owner> --repo <repo>
```

## Triage Artifact

Create a persistent artifact at `triage-<repo>.md`:

```markdown
# Triage: <owner>/<repo>

## Summary
- Total open: N
- Reviewed: N
- Close: N | Keep: N | Dispatch: N | Relabel: N

## Decisions

| # | Title | Labels | Decision | Reason |
|---|-------|--------|----------|--------|
| 194 | [Fleet Insight] Coverage | fleet, fleet-insight | CLOSE | Insight, no code action |
| 141 | [Fleet Execution] Update Enums | fleet, fleet-assessment | DEEP DIVE | Mixed labels, need to read body |
```

## Token Management

- **Never load all 25 issue bodies at once** — each body can be 500-2000 tokens
- Process one deep dive at a time, record decision, then move on
- The triage artifact survives context resets — pick up where you left off
- For batch closes, use `gh issue close` in a single command per issue

## Common Patterns

### Duplicate Detection
Fleet analyzers often create duplicate insights across runs. Look for:
- Sequential "Update N" suffixes (keep only the latest)
- Same title with different numbers
- Same objective described in different words

### Stale Assessment Detection
An assessment may have been addressed by a PR that didn't reference the issue:
- Check if the described code changes already exist in `main`
- Check if a similar PR was merged without `Fixes #N`

### Mislabeled Issues
The analyzer sometimes labels insights as `fleet` (execution-worthy) when they're informational:
- Body says "No source changes" → should be `fleet-insight`, not `fleet`
- Body says "N/A - This is an Insight report" → not dispatchable
