# Agent Context Guidelines

This file is explicitly for AI/LLM Agents acting as operators or integrators against this CLI.

## Overview

You are invoking the `ai-sdk-example` CLI. This CLI adheres to Agent DX best practices to ensure predictability and defense-in-depth logic. You are interacting with the entrypoints, primarily the `start` command.

## Invariants

1. **Output formatting:** Always specify `--output json` when executing the CLI to guarantee machine-readable output rather than human-readable text. Do not rely on stdout text parsing.
2. **Mutations:** Jules sessions represent large, complex mutating cloud tasks. If you are verifying parameters, assessing feasibility, or unsure about an input string, ALWAYS run `--dry-run` first to test the system boundary.
3. **Adversarial inputs:** Be aware that the `JulesCodingTaskSpec` strict schema parsing handles your inputs. Path traversals (`../`), query strings (`?`), fragments (`#`), control chars, or pre-URL encoded characters will be strictly rejected. Ensure the inputs are clean before calling the tool.
