#!/bin/bash
# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Setup script for the automate-github-issues skill
set -e

echo "🔧 Setting up automate-github-issues skill..."
echo ""

# Check for Bun
if command -v bun &> /dev/null; then
  echo "✅ Bun found: $(bun --version)"
else
  echo "⚠️  Bun not found. Installing..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  echo "✅ Bun installed: $(bun --version)"
fi

echo ""

# Install dependencies
echo "📦 Installing dependencies..."
bun install
echo "✅ Dependencies installed."

echo ""

# Scaffold .env if it doesn't exist
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$SKILL_DIR/.env"
ENV_EXAMPLE="$SKILL_DIR/assets/.env.example"

if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$ENV_EXAMPLE" ]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    echo "📝 Created .env from template. Edit it with your API keys."
  else
    echo "⚠️  No .env.example found. Create .env manually with JULES_API_KEY and GITHUB_TOKEN."
  fi
else
  echo "✅ .env already exists."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Next steps (manual):"
echo ""
echo "  1. Edit .env with your API keys:"
echo "     JULES_API_KEY=your-key-here"
echo "     GITHUB_TOKEN=your-token-here"
echo ""
echo "  2. Add GitHub Actions workflows:"
echo "     cp assets/fleet-dispatch.yml .github/workflows/"
echo "     cp assets/fleet-merge.yml .github/workflows/"
echo ""
echo "  3. Add secrets to your GitHub repo:"
echo "     Settings → Secrets → Actions → New repository secret"
echo "     - JULES_API_KEY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
