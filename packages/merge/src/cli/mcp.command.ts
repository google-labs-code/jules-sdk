// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { defineCommand } from 'citty';

export default defineCommand({
  meta: {
    name: 'mcp',
    description: 'Start the Jules Merge MCP server on stdio',
  },
  args: {},
  async run() {
    const { createMergeServer } = await import('../mcp/server.js');
    const { StdioServerTransport } = await import(
      '@modelcontextprotocol/sdk/server/stdio.js'
    );
    const server = createMergeServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Jules Merge MCP server running on stdio');
  },
});
