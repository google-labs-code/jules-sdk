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
  test_files: string[];
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
  repoFullName: string;
}
