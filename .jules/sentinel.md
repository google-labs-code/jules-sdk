## 2026-08-18 - Input Validation on Fleet Dispatch Handler Entrypoint
**Vulnerability:** The Fleet `DispatchHandler` accepted repository owner/repo, base branch, and goals directory path inputs directly from callers or CLI flags without validation. Unsanitized inputs containing control characters, path traversals (`..`), or Git reference escapes (`refs/`) could lead to unsafe filesystem access during goal file scanning or Git reference escape during session dispatch.
**Learning:** Outer orchestration boundaries and CLI handler classes (like `DispatchHandler`) must defensively validate all input arguments using standard validation functions (`validateRepository`, `validateBranchName`, `validateFilePath`) before invoking filesystem operations or external session dispatchers.
**Prevention:** Always invoke input validators (`validateRepository`, `validateBranchName`, `validateFilePath`) at the start of execution handlers in orchestration packages before reading goal directories or dispatching remote worker sessions.

## 2026-08-15 - Branch/Parent Validation on Reconciliation Staging
**Vulnerability:** The stage resolution handler (`stageResolutionHandler`) in `@google/jules-merge` accepted parent branch, commit, or PR identifier strings in the `parents` array without validating them against branch naming rules. If an attacker supplied parent strings containing spaces, control characters, consecutive dots, or `refs/` prefixes, it could allow git reference escape, format bypass, or script/command injection during downstream git commit/ref creation.
**Learning:** Any array input representing Git branch or reference identifiers must be validated at the entrypoint before being stored in state or passed to downstream Git operations.
**Prevention:** Iteratively invoke standard branch validators (`validateBranchName`) on all elements of array parameter inputs (such as `parents`) before performing staging or manifest persistence operations.

## 2026-08-11 - Defense-in-depth Query Validation at MCP select Boundary
**Vulnerability:** The MCP `select` function passed incoming JQL queries directly to the SDK selection engine without validating the query's schema, structure, or parameters at the outermost protocol/package boundary. While the SDK itself validates queries, bypassing outer validation can expose the system to unexpected query engine behavior or unhandled schema exceptions if downstream validation is changed, mocked, or bypassed.
**Learning:** A secure architecture enforces multiple layers of protection (defense-in-depth). Input sanitization and validation must occur at every package, CLI, and protocol boundary to prevent assumptions about downstream state and block malicious inputs as early as possible.
**Prevention:** Always invoke standard SDK schema and query validators (`validateQuery`) directly at the entrypoint of all outer API, protocol, and tool functions before running database or caching queries.

## 2026-08-02 - Base Branch Name Validation on Reconciliation Scanning
**Vulnerability:** The reconciliation scan handler in `@google/jules-merge` accepted a base branch name argument from user input (`input.base`) without any security or format validation, even though validators exist in the shared module. If an attacker supplied an escape string (such as starting with `refs/` or containing consecutive dots), it could lead to git reference escape or script injection down the call stack during Git actions or shell execution.
**Learning:** Downstream functions often rely on assumptions that upstream inputs have been sanitized. In modular architectures or monorepos, security validation of all user-supplied branch and ref parameters must be strictly and consistently enforced at the outermost orchestration and entrypoint handler layers.
**Prevention:** Import and actively invoke robust input validators (`validateBranchName`) on user-supplied branch parameters at all boundary entrypoints and handler functions before executing downstream Git operations or API requests.

## 2026-08-01 - Input Validation of Pagination Page Tokens at SDK and MCP Boundaries
**Vulnerability:** Pagination page tokens passed from external clients or users through the MCP `list_sessions` tool and into the SDK's `SessionCursor` were accepted and used without any format or security validation. This opened potential risks for path/directory traversal, control character injection, or command injection if the tokens were later logged, cached on disk, or passed to downstream scripts/databases.
**Learning:** Even parameters perceived as internal sequence markers or pagination cursors (like `pageToken`) can originate from untrusted external environments and must be treated as unsafe inputs, requiring strict input sanitisation before being processed.
**Prevention:** Implement a dedicated, robust page token validator (`validatePageToken`) to reject any tokens containing control characters, path traversals (`.`, `..`), or path separators, and enforce it at both the MCP functional boundaries and the core SDK session pagination classes.

## 2026-07-30 - Repository and Branch Name Validation at Fleet CLI Wizard Boundary
**Vulnerability:** The Fleet CLI initialization wizard (both headless and interactive modes) accepted unvalidated repository names and branch names from CLI arguments, environment variables, git remotes, or prompts. This allowed potential directory traversal, control character injection, or git reference escape attempts when downloading and writing workflow/config files.
**Learning:** Security validation must not only exist at downstream SDK layers but also be actively integrated at the outermost CLI command and setup wizard layers to sanitise all user/environment-supplied parameters before proceeding.
**Prevention:** Import and apply central robust validators (`validateRepository` and `validateBranchName`) directly at CLI entrypoint handlers and wizard modules, converting validation exceptions into cleanly formatted CLI failures.

## 2026-07-29 - Robust Activity ID Validation at MCP Entrypoints
**Vulnerability:** While session IDs and file paths were validated, the `activityId` parameter provided by external clients through the MCP tool was accepted and used down the call stack (e.g. to filter activities) without any sanitization or validation, opening potential injection and path traversal vectors.
**Learning:** In a monorepo offering multiple protocol layers (like MCP tools), all identifiers supplied by untrusted external agents must be rigorously verified to be flat (no path separators, control characters, or traversal components) before being processed.
**Prevention:** Implement a reusable, unified validation function (`validateActivityId`) for activity identifiers and strictly apply it to all outer API/tool entrypoints receiving activity references.

## 2026-07-28 - Unified File Path Validation and Integration in MCP showDiff
**Vulnerability:** While repository and branch name validations existed, user-supplied relative file path arguments (like the `file` option in the MCP `show_code_diff` tool) were passed to file extraction and diff filtering logic without checks. This opened a potential vector for control character injection, absolute path escapes, and directory traversal (`..`) attempts.
**Learning:** File paths supplied by untrusted external users/clients (such as through MCP tool execution) represent a major vulnerability surface and must be strictly validated at the outer protocol boundary before being processed.
**Prevention:** Implement a central, robust file path validator (`validateFilePath`) to enforce relative paths, reject control characters, absolute paths, and path traversal (`..`), and integrate it consistently across all outer API and tool boundaries.

## 2026-07-27 - Input Validation at MCP Protocol Boundaries to Prevent Injection and Traversal
**Vulnerability:** Although core SDK functions had repository and branch validation, the @google/jules-mcp functions did not validate their incoming string parameters directly. In a monorepo, distinct packages can expose tools to external LLM execution environments (like MCP), representing a primary untrusted boundary that needs defensive sanitization.
**Learning:** Security validation must occur at every package or protocol boundary (like MCP, CLI, or API) to prevent downstream security leaks or unvalidated inputs in case downstream SDK methods are modified, bypassed, or directly called in unforeseen contexts.
**Prevention:** Always identify and validate untrusted input structures (such as `repo`, `branch`, and `sessionId`) at the absolute outermost boundary of protocol and tool handlers before passing them to internal client or filesystem logic.

## 2026-07-24 - Integration of Repository Name Validation in Reconciliation Handlers
**Vulnerability:** Although a robust repository validator (`validateRepository`) was defined in `packages/merge/src/shared/validators.ts`, it was never actually invoked inside the reconciliation entry point handlers (`scanHandler`, `getContentsHandler`, `mergeHandler`, and `pushHandler` via `validatePushInput`). This left the package exposed to format-bypass, control character, and path-traversal attacks through untrusted repository input strings.
**Learning:** Having security utilities in the codebase is only the first step; they must be actively and consistently integrated at all untrusted boundaries/handlers to provide real security benefits.
**Prevention:** Audit all handlers and API boundaries to ensure every untrusted input field is parsed and validated using established validators before proceeding with business logic.

## 2026-07-23 - Robustness of Merge Reconcile Validators on Falsy Inputs
**Vulnerability:** The reconciliation `validateBranchName` and `validateFilePath` helpers in the `@google/jules-merge` package did not check for falsy/empty values before invoking string operations. This could lead to unhandled runtime type exceptions, crashing the execution context, or allowing unexpected bypasses if downstream functions default empty values in unforeseen ways.
**Learning:** Enforcing non-empty values at the validation boundary ensures absolute system robustness, preventing potential Denial of Service (DoS) and input validation bypasses during conflict resolution execution.
**Prevention:** Always validate all path/identifier parameters to ensure they are non-empty strings before proceeding with sub-string matching or other string manipulations.

## 2026-07-18 - Input Validation of Repository and Branch Names on SDK/MCP Entrypoints
**Vulnerability:** The Core SDK and MCP entrypoints allowed arbitrary strings to be used for repository references and Git branch names during session creation and resource fetches, presenting opportunities for path traversal, script injection, and reference escape down the call chain.
**Learning:** Validating input format at the highest level of the SDK ensures consistent security boundaries across all integration endpoints (including CLI, direct client usage, and MCP tools) before operations resolve URLs or format API payloads.
**Prevention:** Integrate robust `validateRepository` and `validateBranchName` checks on all entrypoints receiving user-supplied source contexts.

## 2026-07-17 - Repository Validation Pattern to Prevent Injection and Traversal
**Vulnerability:** The reconciliation handlers accepted untrusted `repo` string inputs (such as `owner/repo`) and parsed them directly (e.g., using `.split('/')`) without verification, opening potential vectors for path traversal, control character injection, or API parsing attacks when interacting with downstream filesystems and Octokit.
**Learning:** Repository path structures must be strictly validated before processing or accessing external APIs. An simple/anchored regex match against standard naming formats prevents any injection or path traversal attempts.
**Prevention:** Always validate repository name parameters against standard patterns (like strictly alphanumeric, dots, hyphens, and underscores) and reject control characters, path traversal segments (`..`), or invalid slash counts.

## 2026-07-16 - Path Traversal Vulnerability via Session ID Input
**Vulnerability:** The client session initialization and local cache file storage used user-supplied or untrusted `sessionId` inputs directly to resolve cache directories, which allowed directory traversal and file inclusion when malicious IDs containing path traversal characters like `..`, `/`, or `\\` were provided.
**Learning:** Session IDs must be rigorously validated before performing any disk I/O, as they are implicitly used as subdirectory names in local cache structures. By enforcing flat, alphanumeric string constraints (no directory separators or control characters), path traversal is completely eliminated.
**Prevention:** Always validate all path parameters and identifiers like `sessionId` to ensure they are strictly flat (no `/`, `\\`, control chars, `.`, or `..`) before utilizing them in file system path resolution.

## 2026-07-09 - Path Traversal Vulnerability in ApiClient
**Vulnerability:** The `ApiClient.resolveUrl` method used simple string concatenation to construct URLs, which allowed malicious paths like `../../secret` to escape the intended `baseUrl`.
**Learning:** Using the `URL` constructor with a base URL is not sufficient to prevent path traversal if the path starts with `..`. The resulting URL can still point outside the base path.
**Prevention:** Always validate that the final resolved URL still starts with the expected normalized base URL.

## 2026-07-10 - Path Traversal and Local File Inclusion in stage-resolution
**Vulnerability:** The `stageResolutionHandler` accepted a `fromFile` path parameter to read local files, but did not validate it. Additionally, the existing `validateFilePath` helper only split the path by `/` and checked for `..`, allowing absolute paths like `/etc/passwd` to bypass the relative path check.
**Learning:** Path bouncers must explicitly reject absolute paths (such as paths starting on Windows or having drive letters on Windows) to prevent traversal via absolute references, even when `..` check is active. Any parameter used in local disk I/O (like `fs.readFileSync`) must be rigorously sanitized.
**Prevention:** Always apply path validation functions to all input file paths and restrict path parameters to relative paths by explicitly throwing on absolute prefixes or drive letters.
