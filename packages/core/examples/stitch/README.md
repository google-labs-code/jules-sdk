# Stitch → Jules Design-to-Code

End-to-end pipeline: generates a UI design with [Stitch](https://stitch.withgoogle.com/), exports it as HTML, and sends it to Jules for conversion into a React component with Tailwind v4.

## Quick Start

```bash
npm install
export JULES_API_KEY="your-api-key"
export STITCH_API_KEY="your-stitch-key"
bun run index.ts
```

## Design Generation with Stitch SDK

Creates a Stitch project and generates a screen from a text prompt:

```typescript
const project = await stitch.createProject('Jules Integration Example');
const screen = await project.generate(
  'A hero section with a dark theme, a large title, and a call-to-action button.',
);
const html = await screen.getHtml();
```

`getHtml()` returns the full HTML document with Tailwind CDN classes.

## Sending Design HTML to Jules

The HTML is embedded in a prompt along with a React Best Practices agent skill URL and conversion requirements (TypeScript, Tailwind v4, accessibility). The session is created with `autoPr: true` to open a PR on completion:

```typescript
const session = await jules.session({
  prompt: `Convert the following Stitch design into a React component using Tailwind v4...`,
  source,
  autoPr: true,
});
```

Progress is streamed with `for await...of session.stream()`, logging plan steps, progress, and agent messages.

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JULES_API_KEY` | Yes | — | Jules API key |
| `STITCH_API_KEY` | Yes | — | Stitch API key |
| `GITHUB_REPO` | No | Auto-detected | Target repo |
| `BASE_BRANCH` | No | `main` | Base branch |
