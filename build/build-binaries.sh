#!/bin/bash
set -e

# Build Binaries Script
# Builds Config Control for Kiro for all platforms
# Optionally signs Windows and macOS binaries before compression

VERSION=$(cat build/VERSION)
echo "🔨 Building Config Control for Kiro v${VERSION} for all platforms..."
echo ""

# 1. Build Frontend
echo "1️⃣  Building React frontend..."
cd client
npm install --silent
npm run build
cd ..
echo "   ✅ Frontend built"
echo ""

# 2. Embed Frontend in Go
echo "2️⃣  Embedding frontend in Go binary..."
rm -rf web/dist
mkdir -p web/dist
cp -r client/dist/* web/dist/
echo "   ✅ Frontend embedded"
echo ""

# 3. Build Go Binaries
echo "3️⃣  Building Go binaries..."
rm -rf releases/*
mkdir -p releases

echo "   Building cckiro-linux-amd64..."
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags "-s -w -X main.Version=${VERSION}" -o releases/cckiro-linux-amd64 .
chmod +x releases/cckiro-linux-amd64

echo "   Building cckiro-mac-intel..."
CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -ldflags "-s -w -X main.Version=${VERSION}" -o releases/cckiro-mac-intel .
chmod +x releases/cckiro-mac-intel

echo "   Building cckiro-mac-arm..."
CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -ldflags "-s -w -X main.Version=${VERSION}" -o releases/cckiro-mac-arm .
chmod +x releases/cckiro-mac-arm

echo "   Building cckiro-windows-amd64..."
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags "-s -w -X main.Version=${VERSION}" -o releases/cckiro.exe .

echo "   ✅ All binaries built"
echo ""

# 4. Signing prompt
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
read -p "🔐 Sign binaries? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    bash build/sign-binaries.sh
fi
echo ""

# 5. Compress
echo "5️⃣  Compressing release archives..."
cd releases

# Linux
mv cckiro-linux-amd64 cckiro
tar czf cckiro-linux-amd64.tar.gz cckiro
rm cckiro

# Mac Intel — .app bundle if signed, raw binary if not
if [ -d "cckiro-mac-intel.app" ]; then
    mv cckiro-mac-intel.app cckiro.app
    zip -r -q cckiro-mac-intel.zip cckiro.app
    rm -rf cckiro.app
else
    mv cckiro-mac-intel cckiro
    tar czf cckiro-mac-intel.tar.gz cckiro
    rm cckiro
fi

# Mac ARM — .app bundle if signed, raw binary if not
if [ -d "cckiro-mac-arm.app" ]; then
    mv cckiro-mac-arm.app cckiro.app
    zip -r -q cckiro-mac-arm.zip cckiro.app
    rm -rf cckiro.app
else
    mv cckiro-mac-arm cckiro
    tar czf cckiro-mac-arm.tar.gz cckiro
    rm cckiro
fi

# Windows
zip -j -q cckiro-windows-amd64.zip cckiro.exe
rm cckiro.exe

echo "   ✅ Archives created"
echo ""

# 6. Generate checksums
echo "6️⃣  Generating checksums..."
sha256sum *.tar.gz *.zip 2>/dev/null > checksums.txt
cd ..
echo "   ✅ checksums.txt generated"
echo ""

# List release files
echo "📦 Release artifacts:"
ls -lh releases/
echo ""
echo "📋 Checksums:"
cat releases/checksums.txt
echo ""

echo "✅ Build complete!"
exit 0
