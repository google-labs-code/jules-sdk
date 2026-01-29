import type { JulesTool } from './utils.js';
export { type JulesTool, defineTool, toMcpResponse } from './utils.js';

// Runtime self-discovery of all *.tool.ts files
const toolModules = import.meta.glob<{ default: JulesTool }>('./*.tool.ts', {
  eager: true,
});

export const tools: JulesTool[] = Object.values(toolModules)
  .map((mod) => mod.default)
  .filter((tool): tool is JulesTool => Boolean(tool))
  .filter((tool) => !tool.private);
