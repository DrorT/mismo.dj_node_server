#!/bin/bash
# Ensure correct Node.js version is active
# This script should be sourced before any npm commands

set -e

REQUIRED_VERSION="24.10.0"
CURRENT_VERSION=$(node --version 2>/dev/null | sed 's/v//' || echo "none")

if [[ "$CURRENT_VERSION" != "$REQUIRED_VERSION" ]]; then
    echo "⚠️  Current Node.js version: v${CURRENT_VERSION}"
    echo "✓  Required Node.js version: v${REQUIRED_VERSION}"
    echo ""
    echo "Switching to Node.js ${REQUIRED_VERSION} using fnm..."

    # Check if fnm is available
    if ! command -v fnm &> /dev/null; then
        echo "❌ Error: fnm is not installed or not in PATH"
        exit 1
    fi

    # Use fnm to switch version
    eval "$(fnm env --use-on-cd)"
    fnm use ${REQUIRED_VERSION} || {
        echo "❌ Error: Failed to switch to Node.js ${REQUIRED_VERSION}"
        echo "   Make sure it's installed: fnm install ${REQUIRED_VERSION}"
        exit 1
    }

    echo "✅ Switched to Node.js $(node --version)"
else
    echo "✅ Using correct Node.js version: v${CURRENT_VERSION}"
fi

# Rebuild native modules if needed
if [[ "$1" == "--rebuild" ]]; then
    echo ""
    echo "Rebuilding native modules..."
    npm rebuild better-sqlite3
    echo "✅ Native modules rebuilt"
fi
