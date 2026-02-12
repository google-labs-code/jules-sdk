export interface IssueAnalysis {
  repo: string;
  analyzed_at: string;
  root_causes: RootCause[];
  tasks: Task[];
  unaddressable: UnaddressableIssue[];
  file_ownership: Record<string, string>;
}

export interface RootCause {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  issues: number[];
  files: string[];
  description: string;
  solution_summary: string;
}

export interface Task {
  id: string;
  title: string;
  root_cause: string;
  issues: number[];
  files: string[];
  new_files: string[];
  risk: "low" | "medium" | "high";
  prompt: string;
}

export interface UnaddressableIssue {
  issue: number;
  reason: string;
  suggested_owner: string;
}

export interface AnalyzeIssuesPromptOptions {
  issuesMarkdown: string;
}
