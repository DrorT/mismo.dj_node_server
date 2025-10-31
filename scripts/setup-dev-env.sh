#!/bin/bash
# Development Environment Setup Script
# Ensures correct Node.js version and dependencies are properly configured

set -e

echo "🔧 Mismo DJ App Server - Development Environment Setup"
echo "========================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if fnm is installed
if ! command -v fnm &> /dev/null; then
    echo -e "${RED}❌ Error: fnm is not installed${NC}"
    echo "   Install fnm: https://github.com/Schniz/fnm#installation"
    exit 1
fi

# Check current Node version
CURRENT_VERSION=$(node --version 2>/dev/null | sed 's/v//' || echo "none")
REQUIRED_VERSION="24.10.0"

echo "Current Node.js version: v${CURRENT_VERSION}"
echo "Required Node.js version: v${REQUIRED_VERSION}"
echo ""

# Switch to required version if needed
if [[ "$CURRENT_VERSION" != "$REQUIRED_VERSION" ]]; then
    echo -e "${YELLOW}⚠️  Switching to Node.js ${REQUIRED_VERSION}...${NC}"

    # Check if version is installed
    if ! fnm list | grep -q "v${REQUIRED_VERSION}"; then
        echo "Installing Node.js ${REQUIRED_VERSION}..."
        fnm install ${REQUIRED_VERSION}
    fi

    fnm use ${REQUIRED_VERSION}
    echo -e "${GREEN}✅ Switched to Node.js $(node --version)${NC}"
else
    echo -e "${GREEN}✅ Already using correct Node.js version${NC}"
fi

# Set as default if not already
if ! fnm list | grep -q "v${REQUIRED_VERSION} default"; then
    echo ""
    read -p "Set Node.js ${REQUIRED_VERSION} as default? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        fnm default ${REQUIRED_VERSION}
        echo -e "${GREEN}✅ Set Node.js ${REQUIRED_VERSION} as default${NC}"
    fi
fi

echo ""
echo "📦 Checking dependencies..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install
else
    echo -e "${GREEN}✅ Dependencies already installed${NC}"
fi

echo ""
echo "🔨 Rebuilding native modules..."
npm run rebuild-native

echo ""
echo "🧪 Running verification checks..."

# Check Node version matches requirement
if npm run check-node &> /dev/null; then
    echo -e "${GREEN}✅ Node.js version check passed${NC}"
else
    echo -e "${RED}❌ Node.js version check failed${NC}"
    exit 1
fi

# Check if server can start (dry run)
echo ""
echo "📋 Environment Summary:"
echo "  • Node.js: $(node --version)"
echo "  • npm: $(npm --version)"
echo "  • fnm: $(fnm --version)"
echo "  • Project: $(pwd)"
echo ""

echo -e "${GREEN}🎉 Development environment setup complete!${NC}"
echo ""
echo "Quick start commands:"
echo "  npm start          - Start the server"
echo "  npm run dev        - Start with auto-reload"
echo "  npm run check-node - Verify Node.js version"
echo ""
