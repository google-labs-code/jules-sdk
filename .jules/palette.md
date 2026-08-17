# Palette's Journal - CLI UX & Accessibility

This journal records critical, reusable UX and accessibility insights specific to this codebase.

## 2026-03-01 - Interactive TTY Styling for Node CLI Orchestration
**Learning:** Users of rich CLI tools (such as orchestrators) need clear visual hierarchies to quickly scan long logs. Plain-text logs without colored status indicators (like checkmarks or warning symbols) increase cognitive load. Adding green, red, yellow, and dim ANSI escapes in interactive TTY environments significantly improves readability, while maintaining clean unstyled text in CI logs preserves log grepability and compatibility.
**Action:** Next time when rendering CLI/TUI outputs, always introduce conditional ANSI styles that detect TTY/non-CI environments to color-code success checkmarks (green), errors/failures (red), warnings (yellow), and secondary metadata/fractions (dim).

## 2026-03-05 - Backtick Command Highlighting in CLI Suggestions and Errors
**Learning:** Highlighting inline code and command names (wrapped in backticks) in terminal suggestions drastically reduces the user's cognitive friction when dealing with errors. It makes actionable instructions (such as "Use `jules-fleet configure` to update settings") immediately stand out visually in interactive terminals without adding noise in plain CI/log environments.
**Action:** Implement conditional regex-based ANSI formatting on terminal error suggestions to highlight backticked segments in yellow or bold colors when process/stdout is interactive, falling back to clean plain-text when run in CI.

## 2026-03-08 - Informative CLI Resource Creation Feedback
**Learning:** Long-running CLI orchestration tasks that create remote resources (like Git repositories) require continuous visual feedback (spinners for in-flight tasks, and clear success/warning/error states on completion). Leaving key domain events silent increases user anxiety and cognitive load. Providing clickable, descriptive OSC 8 terminal hyperlinks (like "View Repository") dramatically improves user discoverability and workflow efficiency directly inside TTY environments.
**Action:** Always ensure all domain-specific lifecycle events (especially resource creation and fallback states) are fully handled in rendering paths, using clear visual states (spinners, warning icons, and descriptive links instead of raw URLs).

## 2026-03-12 - Clickable Wizard Hyperlinks and Standardized Failure Indicators
**Learning:** In interactive CLI applications (such as setup wizards), raw URLs lead to cluttered terminal screens, wrapping issues, and increased cognitive load. Using descriptive, semantic labels for terminal hyperlinks via OSC 8 makes clickable links look clean and highly discoverable. Additionally, standardizing colored failure status indicators (such as a red '✗') across all subcommand error paths provides unified visual scanning and consistency with existing checkmarks ('✓') and warning symbols ('⊘').
**Action:** Always use semantic labels for `ansiLink` instead of passing raw URLs as labels in CLI prompts, and consistently prepend red '✗' to failure status outputs in terminal render blocks.

## 2026-03-15 - Standardizing CLI Spinner Completion States with Status Symbols
**Learning:** In terminal UIs, replacing a running spinner with plain-text completion logs lacks immediate, scannable feedback. Appending standardized, color-coded completion status symbols (such as a green '✓' for success, red '✗' for errors/failures, and yellow '⊘' for timeout/skipped states) directly to the stopSpinner message creates a visually cohesive and satisfying experience that is instantly decodable.
**Action:** Always append standard, colored status indicators (such as `ansiGreen('✓')`, `ansiRed('✗')`, and `ansiYellow('⊘')`) to `ctx.stopSpinner` logs for completed terminal tasks.

## 2026-03-16 - Unified Backtick Highlighting in CLI Setup Prompts and Status Outputs
**Learning:** In interactive CLI applications and wizard setups, user-specific variables (such as repository names, auth identities, and secret keys) printed in plain text lack distinct visual separation from instructions. Formatting these variables inside backticks and passing the strings through the `ansiHighlight` utility creates a highly professional, cohesive theme that naturally directs the user's attention to key parameters and command suggestions.
**Action:** Ensure that user-supplied inputs, paths, or keys in both interactive prompts and domain-specific status event logs (such as skipped/failed reasons) are formatted with backticks and highlighted using `ansiHighlight`.

## 2026-03-17 - Interactive Password Validation in CLI Setup Wizards
**Learning:** In interactive setup wizards, missing input validation on password or token prompts allows users to accidentally submit empty or whitespace-only values (e.g., by hitting Enter too quickly). This leads to silent configuration issues or obscure downstream auth errors. Implementing robust inline validation for sensitive password prompts ensures immediate interactive feedback and prevents invalid setups.
**Action:** Always add inline `validate` check functions to both required and optional password/token prompts in CLI wizard flows to confirm they are non-empty and non-whitespace.

## 2026-03-18 - Graceful Parsing and Guidance in CLI Interactive Prompts
**Learning:** Forcing users to enter exact strings (like `owner/repo` repository slugs) in interactive wizards often leads to validation errors and friction when they copy-paste full Git clone URLs (e.g., HTTPS/SSH links or with `.git` suffixes). Designing prompts to automatically and gracefully parse/clean input URL formats into standard identifiers, complemented by clear placeholder examples, provides an extremely smooth, error-free keyboard navigation and setup experience.
**Action:** Always clean and normalize complex identifiers or path inputs directly from the user's interactive clipboard/paste actions inside wizard text prompts before passing them to validators, and provide helpful, standardized `placeholder` example structures.

## 2026-08-11 - Descriptive Option Hints in Interactive CLI Wizards
**Learning:** Selecting from multiple options in interactive CLI setup prompts (like choosing between GitHub PAT or App authentication) can be ambiguous or daunting for users who do not know the exact trade-offs of each option. Adding descriptive `hint` properties to selection options provides key contextual guidance that helps users make informed choices, while refactoring duplicate select blocks to reuse helper prompt functions ensures consistency across all Wizard flows.
**Action:** Always provide descriptive and highly informative `hint` messages for selection list options in interactive wizard prompts, and reuse core prompt functions to keep setup CLI interfaces unified and modular.

## 2026-08-12 - Backtick Highlighting for Dynamic Repository Names in Creation Logs
**Learning:** Rendering raw repository slugs (such as `owner/repo`) in dynamic CLI creation event logs without formatting causes them to blend in with adjacent static log text. Formatting repository names in backticks and applying `ansiHighlight` creates visual separation and visual consistency across all CLI subcommands and setup steps.
**Action:** Always format repository slugs and dynamic resource identifiers in backticks and wrap them with `ansiHighlight` across all CLI event renderers.
