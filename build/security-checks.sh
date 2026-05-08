#!/bin/bash

# Security Checks Script
# Runs all security validations before build

echo "🔒 Running Security Checks..."
echo ""

ask_continue() {
    read -p "⚠️  Continue anyway? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Build cancelled"
        exit 1
    fi
}

# 1. Secret Scanning
echo "1️⃣  Scanning for secrets with git-secrets..."
if command -v git &> /dev/null && git secrets --list &> /dev/null; then
    if git secrets --scan $(git ls-files 2>/dev/null | grep -v -E '\.(asc|exe)$|^releases/') 2>&1; then
        echo "   ✅ No secrets found"
    else
        echo "   ❌ Secrets detected!"
        ask_continue
    fi
else
    echo "   ⚠️  git-secrets not installed or not configured"
    ask_continue
fi
echo ""

# 2. Go Dependency CVE Scan
echo "2️⃣  Scanning Go dependencies for CVEs..."
if command -v nancy &> /dev/null; then
    if go list -json -m all 2>/dev/null | nancy sleuth --quiet; then
        echo "   ✅ No critical Go vulnerabilities found"
    else
        echo "   ⚠️  Go vulnerabilities detected"
        ask_continue
    fi
else
    echo "   ⚠️  nancy not installed, skipping"
    ask_continue
fi
echo ""

# 3. Node Dependency CVE Scan
echo "3️⃣  Scanning Node dependencies for CVEs..."
if [ -d "client" ]; then
    cd client
    if ! npm audit --audit-level=high 2>/dev/null; then
        echo "   ⚠️  Vulnerabilities detected, running npm audit fix..."
        npm audit fix 2>/dev/null
        if npm audit --audit-level=high 2>/dev/null; then
            echo "   ✅ All vulnerabilities fixed"
        else
            echo "   ❌ Some vulnerabilities could not be auto-fixed"
            cd ..
            ask_continue
        fi
    else
        echo "   ✅ No critical Node vulnerabilities found"
    fi
    cd .. 2>/dev/null
else
    echo "   ⚠️  client directory not found, skipping"
    ask_continue
fi
echo ""

echo "✅ Security checks complete!"
exit 0
