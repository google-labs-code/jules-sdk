# Jules MCP Server

MCP tools to orchestrate complex, long-running coding tasks to an ephemeral cloud environment integrated with a GitHub repo.

## Connect an AI assistant to Jules

```json
{
  "mcpServers": {
    "jules": {
      "command": "npx",
      "args": ["@google/jules-mcp"],
      "env": {
        "JULES_API_KEY": "<api-key>"
      }
    }
  }
}
```

## Available Tools

### Create and manage sessions

```
create_session     Create a new Jules session
list_sessions      List recent Jules sessions
get_session_state  Get session status (busy/stable/failed)
send_reply         Send a message or approve a plan
```

### Review code changes

```
get_code_review_context  Get session summary with file changes
show_code_diff           Get the full unidiff patch
```

### Query and analyze

```
query_cache        Query local cache of sessions and activities
```

## Installation

```bash
npm i @google/jules-mcp
export JULES_API_KEY=<api-key>
```

## Run the server

```bash
npx @google/jules-mcp
```

## Tool Reference

- **Session Management:**
  - `create_session`: Create a new Jules session with a prompt and optional GitHub source.
  - `list_sessions`: List recent sessions with optional pagination.
  - `get_session_state`: Get the current status of a session (busy/stable/failed).
  - `send_reply`: Send a message to a session or approve a pending plan.

- **Code Review:**
  - `get_code_review_context`: Get a summary of session changes with file list and metadata.
  - `show_code_diff`: Get the full unidiff patch for a session's code changes.

- **Query:**
  - `query_cache`: Query the local cache of sessions and activities using JQL.

## License

Apache-2.0

> **Note:** This is not an officially supported Google product. This project is not eligible for the [Google Open Source Software Vulnerability Rewards Program](https://bughunters.google.com/open-source-security).
