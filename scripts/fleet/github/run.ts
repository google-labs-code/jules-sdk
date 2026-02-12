
import { getIssuesAsMarkdown } from "./markdown.js";

async function main() {
  try {
    const markdown = await getIssuesAsMarkdown();
    console.log(markdown);
  } catch (error) {
    console.error("Error fetching issues:", error);
    process.exit(1);
  }
}

main();
