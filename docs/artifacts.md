# Artifacts

Activities often contain "artifacts," which are the tangible outputs of the agent's work. These include code changes, shell command outputs, and images (e.g., screenshots).

## Artifact Types

Any activity can contain one or more artifacts in its `.artifacts` array.

```typescript
for (const artifact of activity.artifacts) {
  if (artifact.type === 'changeSet') {
    // Handle code changes
  } else if (artifact.type === 'bashOutput') {
    // Handle shell output
  } else if (artifact.type === 'media') {
    // Handle images
  }
}
```

## ChangeSet Artifacts

Represents a set of code changes (a diff). The SDK provides a `.parsed()` method to make it easier to inspect these changes.

```typescript
if (artifact.type === 'changeSet') {
  const parsed = artifact.parsed();

  console.log(`Changed ${parsed.summary.totalFiles} files:`);

  for (const file of parsed.files) {
    console.log(
      `${file.changeType}: ${file.path} ` +
      `(+${file.additions}/-${file.deletions})`
    );
  }
}
```

### ParsedFile Structure

```typescript
interface ParsedFile {
  path: string;       // e.g., "src/index.ts"
  changeType: 'created' | 'modified' | 'deleted';
  additions: number;  // Lines added
  deletions: number;  // Lines removed
}
```

## Bash Artifacts

Represents the output of a shell command. Use `.toString()` to get a terminal-like representation.

```typescript
if (artifact.type === 'bashOutput') {
  console.log(artifact.toString());

  // Or access raw properties
  console.log('Command:', artifact.command);
  console.log('Stdout:', artifact.stdout);
  console.log('Stderr:', artifact.stderr);

  if (artifact.exitCode !== 0) {
    console.error(`Command failed with code ${artifact.exitCode}`);
  }
}
```

## Media Artifacts

Represents binary media, such as a screenshot taken by the agent.

### Viewing in Browser

Use `.toUrl()` to generate a Data URI that can be used in an `<img>` tag.

```typescript
if (artifact.type === 'media') {
  const url = artifact.toUrl();
  // <img src={url} />
}
```

### Saving to Disk (Node.js)

Use `.save()` to write the file to the local filesystem.

```typescript
if (artifact.type === 'media') {
  await artifact.save(`./screenshots/${activity.id}.png`);
}
```

## Generated Files

When a session completes successfully, you can access the final state of any modified or created files directly from the `SessionOutcome`. This is often more convenient than parsing individual artifacts.

```typescript
const result = await session.result();
const files = result.generatedFiles();

// 1. Get a specific file
const readme = files.get('README.md');
if (readme) {
  console.log(readme.content);
}

// 2. Iterate all generated files
for (const file of files.all()) {
  console.log(`File: ${file.path}`);
}

// 3. Filter by change type
const newFiles = files.filter('created');
```
