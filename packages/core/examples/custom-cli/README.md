# Custom CLI Tools Example

This example demonstrates how to use the Jules SDK to create a custom command-line interface (CLI) tool. The tool integrates with the user's **local file system** while treating repoless Jules sessions as **powerful, autonomous serverless compute containers**.

It uses `citty` for command structure, `niftty` for terminal rendering, and the native Node.js `fs` module to orchestrate moving data between your local machine and the cloud.

Crucially, this CLI is optimized for **Agent DX**. It follows best practices for building CLIs that are robust against agent hallucinations by:
- Employing auto-discovery for scaling commands.
- Defining a "Typed Service Contract" using Zod (`spec.ts` + `handler.ts`) for input hardening and API predictability.
- Exposing a raw `--json` flag so agents can map directly to schemas.
- Exposing an `--output json` flag so agents can parse outputs deterministically.

## Requirements

- Node.js >= 18 or Bun
- A Jules API Key (`JULES_API_KEY` environment variable)

## Setup

1. Make sure you have installed the SDK dependencies in the project root by running `bun install`.
2. Build the SDK in `packages/core` by running `npm run build` inside the `packages/core` directory.

3. Export your Jules API key:

```bash
export JULES_API_KEY="your-api-key-here"
```

## Running the Example: Cloud Compute Tasks

The primary utility included in this example is the `run` command. Instead of just talking to an LLM, this tool treats the Jules session as a sandbox where an autonomous agent can **write and execute Python or Node.js scripts**.

You can pass a local file to the cloud container, instruct the compute instance to run complex analysis, scrape websites, or convert data formats, and it will write the final processed file back to your local machine.

### Bold Use Cases
- **Data Analysis**: `run --input "sales.csv" --instruction "Use Python pandas to aggregate sales by month and calculate the moving average." --output-file "report.json"`
- **Web Scraping**: `run --instruction "Write a Node.js puppeteer script to scrape the headlines from news.ycombinator.com and output them as JSON." --output-file "hn.json"`
- **Format Conversion**: `run --input "old_config.xml" --instruction "Write a python script to parse this XML and convert it to a modern YAML structure." --output-file "new_config.yaml"`

### Human DX

You can run the CLI tool passing standard flags.

```bash
bun run index.ts run \
  --input="./raw_data.csv" \
  --instruction="Use python pandas to clean the missing values and output as JSON." \
  --output-file="./cleaned_data.json"
```

View the help text:

```bash
bun run index.ts --help
bun run index.ts run --help
```

### Agent DX

Agents are prone to hallucination when creating strings but are very good at forming JSON matching strict schemas. For best results, expose `--json` flags.

```bash
bun run index.ts run --json='{"instruction": "Scrape the current temperature in Paris using a python script", "outputFile": "./temp.json"}' --output="json"
```

## Architecture

This project splits its logic to avoid monolithic file structures and merge conflicts:
- **`index.ts`**: The auto-discovery entry point that dynamically mounts available sub-commands.
- **`commands/*/spec.ts`**: The Zod schema defining the strict Typed Service Contract for a tool.
- **`commands/*/handler.ts`**: The pure business logic that consumes the contract, maps local data into the cloud, extracts results, and never crashes directly.
- **`commands/*/index.ts`**: The `citty` command definition that parses flags and outputs data back to the environment.
