#!/bin/bash
set -e

# Main Build Pipeline
# Orchestrates the complete release process

echo "🚀 Config Control for Kiro Release Pipeline"
echo "=========================="
echo ""

# Get version
VERSION=$(cat build/VERSION)
echo "📌 Version: ${VERSION}"
echo ""

# Confirm with user
read -p "Build release v${VERSION}? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Build cancelled"
    exit 1
fi
echo ""

# Step 1: Security Checks
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 1: Security Checks"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if bash build/security-checks.sh; then
    echo ""
else
    echo ""
    echo "❌ Security checks failed. Fix issues before building."
    exit 1
fi

# Step 2: Build Binaries
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 2: Build Binaries"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if bash build/build-binaries.sh; then
    echo ""
else
    echo ""
    echo "❌ Build failed"
    exit 1
fi

# Success
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Release v${VERSION} Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📦 Release artifacts in: releases/"
echo ""
echo "Next steps:"
echo "  1. Review files in releases/"
echo "  2. git push"
echo ""

exit 0
