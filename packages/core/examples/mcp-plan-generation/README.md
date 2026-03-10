# Jules MCP Plan Generation Server

This example demonstrates how to build a custom [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server using the Jules SDK. This server acts as a tool provider that coding agents can use to generate highly detailed implementation plans. The generated plans contain reference implementations, build/test commands, and verification checks which can then be used as a prompt to create a new Jules session.

## Prerequisites

- Bun installed globally (`npm install -g bun` or via `curl -fsSL https://bun.sh/install | bash`)
- A Jules API Key (`export JULES_API_KEY=your-api-key`)

## Setup

Navigate to this directory and install dependencies:

```bash
cd packages/core/examples/mcp-plan-generation
bun install
```

## Running the Server

Start the MCP Server locally using standard input/output (stdio):

```bash
bun run start
```

*Note: The server uses stdio for communication, which is the standard transport mechanism for MCP servers interacting with an agent's runtime environment.*

## Building

To build the executable for node, run:

```bash
bun run build
```

## Usage

Once running, the server exposes the `generate_plan` tool. Any MCP client (or agent using the MCP protocol) can call this tool with the following inputs:

- `taskDescription`: The specific goal or bug fix requested by the user.
- `sourceContext` (optional): Any contextual source code details (such as a GitHub repository name, file paths, or snippets).

The server will internally create a repoless Jules session to generate a comprehensive markdown plan. This output plan can then be supplied directly into a subsequent Jules session as the execution prompt.
