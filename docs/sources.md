# Source Management

Sources define the context for an agent session. Currently, the primary source type is a GitHub repository.

## Listing Sources

You can list all sources connected to your account using `jules.sources()`, which returns an async iterator.

```typescript
for await (const source of jules.sources()) {
  console.log(source.name); // "sources/github/owner/repo"

  if (source.type === 'githubRepo') {
    console.log(`Repo: ${source.githubRepo.owner}/${source.githubRepo.repo}`);
    console.log(`Private: ${source.githubRepo.isPrivate}`);
  }
}
```

## Getting a Source

If you know the identifier of a source, you can retrieve it directly.

```typescript
const source = await jules.sources.get({ github: 'my-org/my-repo' });

if (source) {
  console.log('Source found:', source.id);
} else {
  console.log('Source not found. Make sure the Jules app is installed.');
}
```

## Source Properties

### Common Properties

- `name`: The full resource name (e.g., `sources/github/owner/repo`).
- `id`: The unique identifier (e.g., `github/owner/repo`).
- `type`: The discriminated union type (currently only `'githubRepo'`).

### GitHub Repo Properties

When `type` is `'githubRepo'`:

- `githubRepo.owner`: The organization or user name.
- `githubRepo.repo`: The repository name.
- `githubRepo.isPrivate`: Boolean indicating if the repo is private.

## Using Sources in Sessions

To attach a source to a session, pass the `source` object in the configuration.

```typescript
const session = await jules.session({
  prompt: 'Check for security vulnerabilities.',
  source: {
    github: 'my-org/backend-api', // Maps to source identifier
    baseBranch: 'production'      // Branch to start from
  }
});
```
