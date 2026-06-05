#!/bin/bash
set -e

# Sign Binaries Script
# Signs Windows (Authenticode) and macOS (CDSigner) binaries
# Requires: aws cli, awscurl, jq, and signing account credentials

REGION="us-east-1"
CDSIGNER_REGION="us-west-2"
SIGNING_TIMEOUT=300

# Infrastructure
UNSIGNED_BUCKET="cckiro-signing-unsigned"
SIGNED_BUCKET="cckiro-signing-signed"
ARTIFACTS_BUCKET="cckiro-signing-artifacts"
S3_ACCESS_ROLE="arn:aws:iam::382967313053:role/cckiro-signing-s3-access"
CDSIGNER_API="https://api.signer.builder-tools.aws.dev"

echo ""
echo "🔐 Binary Signing"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check tools
for cmd in aws awscurl jq; do
    if ! command -v $cmd &>/dev/null; then
        echo "❌ '$cmd' not found. Install it first."
        exit 1
    fi
done

# Check binaries
for bin in releases/cckiro.exe releases/cckiro-mac-intel releases/cckiro-mac-arm; do
    if [ ! -f "$bin" ]; then
        echo "❌ Not found: $bin — run build first."
        exit 1
    fi
done

# Get credentials
echo "Enter credentials,"
echo "then press Enter on an empty line when done:"
echo ""
CREDS=""
while IFS= read -r line; do
    [[ -z "$line" ]] && break
    CREDS+="$line"$'\n'
done
eval "$CREDS"

# Verify
ACCOUNT=$(aws sts get-caller-identity --region $REGION --query 'Account' --output text 2>/dev/null)
if [ "$ACCOUNT" != "382967313053" ]; then
    echo "❌ Wrong account: $ACCOUNT (expected 382967313053)"
    exit 1
fi
echo "✅ Authenticated to account $ACCOUNT"
echo ""

WIN_RESULT="skipped"
MAC_INTEL_RESULT="skipped"
MAC_ARM_RESULT="skipped"

# ─────────────────────────────────────────
# WINDOWS (Authenticode via Wallaby)
# ─────────────────────────────────────────
echo "🪟  Signing Windows binary..."

S3_KEY="cckiro_windows/AuthenticodeSigner-SHA256-RSA/cckiro.exe"
echo "   Uploading to s3://$UNSIGNED_BUCKET/$S3_KEY..."
aws s3 cp releases/cckiro.exe "s3://$UNSIGNED_BUCKET/$S3_KEY" \
    --acl bucket-owner-full-control --region $REGION 2>/dev/null

echo "   Waiting for signing job..."
ELAPSED=0
JOB_ID=""
while [ $ELAPSED -lt $SIGNING_TIMEOUT ]; do
    JOB_ID=$(aws s3api get-object-tagging --bucket "$UNSIGNED_BUCKET" --key "$S3_KEY" \
        --region $REGION --query 'TagSet[?Key==`signer-job-id`].Value' --output text 2>/dev/null || echo "")
    if [ -n "$JOB_ID" ] && [ "$JOB_ID" != "None" ] && [ "$JOB_ID" != "" ]; then
        echo "   Job ID: $JOB_ID"
        break
    fi
    sleep 5
    ELAPSED=$((ELAPSED + 5))
    echo "   Waiting... (${ELAPSED}s)"
done

if [ -z "$JOB_ID" ] || [ "$JOB_ID" = "None" ]; then
    echo "   ❌ Timeout waiting for signing job"
    WIN_RESULT="failed"
else
    while [ $ELAPSED -lt $SIGNING_TIMEOUT ]; do
        STATUS=$(aws signer describe-signing-job --job-id "$JOB_ID" \
            --region $REGION --query 'status' --output text 2>/dev/null || echo "unknown")
        if [ "$STATUS" = "Succeeded" ]; then
            SIGNED_KEY="cckiro_windows/AuthenticodeSigner-SHA256-RSA/cckiro.exe-${JOB_ID}"
            echo "   Downloading signed binary..."
            aws s3 cp "s3://$SIGNED_BUCKET/$SIGNED_KEY" releases/cckiro.exe --region $REGION 2>/dev/null
            echo "   ✅ Windows signed"
            WIN_RESULT="success"
            break
        elif [ "$STATUS" = "Failed" ]; then
            echo "   ❌ Signing failed"
            WIN_RESULT="failed"
            break
        fi
        sleep 5
        ELAPSED=$((ELAPSED + 5))
        echo "   Status: $STATUS (${ELAPSED}s)"
    done
    [ "$WIN_RESULT" = "skipped" ] && echo "   ❌ Timeout" && WIN_RESULT="failed"
fi
echo ""

# ─────────────────────────────────────────
# macOS (CDSigner)
# ─────────────────────────────────────────
sign_macos() {
    local BINARY=$(realpath "$1")
    local NAME=$2
    local LABEL=$3
    local VERSION=$(cat build/VERSION)

    echo "🍎  Signing $LABEL..."

    local ORIG_DIR=$(pwd)
    local WORK=$(mktemp -d)

    # Create .app bundle
    mkdir -p "$WORK/package/cckiro.app/Contents/MacOS"
    cp "$BINARY" "$WORK/package/cckiro.app/Contents/MacOS/cckiro"
    sed "s/VERSION_PLACEHOLDER/$VERSION/g" build/Info.plist > "$WORK/package/cckiro.app/Contents/Info.plist"

    # Package for CDSigner
    cd "$WORK/package"
    tar -czf ../artifact.gz cckiro.app
    cd "$WORK"
    tar -czf package.tar.gz artifact.gz
    cd "$ORIG_DIR"

    # Upload
    local INPUT_KEY="pre-signed/${NAME}.tar.gz"
    local OUTPUT_KEY="signed/${NAME}.tar.gz"
    echo "   Uploading to s3://$ARTIFACTS_BUCKET/$INPUT_KEY..."
    aws s3 cp "$WORK/package.tar.gz" "s3://$ARTIFACTS_BUCKET/$INPUT_KEY" --region $REGION 2>/dev/null

    # Submit task
    echo "   Submitting CDSigner task..."
    local TASK_ID=$(awscurl --service signer-builder-tools \
        --region $CDSIGNER_REGION \
        -X POST \
        --header "Content-Type: application/json" \
        --data "{
            \"manifest\": {
                \"type\": \"app\",
                \"os\": \"osx\",
                \"name\": \"cckiro.app\",
                \"outputs\": [{\"label\": \"macos\", \"path\": \"cckiro.app\"}],
                \"app\": {
                    \"identifier\": \"com.amazon.aws.kiro.cckiro\",
                    \"signing_requirements\": {
                        \"certificate_type\": \"developerIDAppDistribution\",
                        \"team_id\": \"94KV3E626L\"
                    }
                }
            },
            \"s3ArtifactLocations\": {
                \"bucketAccessRole\": \"$S3_ACCESS_ROLE\",
                \"bucket\": \"$ARTIFACTS_BUCKET\",
                \"inputKey\": \"$INPUT_KEY\",
                \"outputKey\": \"$OUTPUT_KEY\"
            }
        }" \
        "$CDSIGNER_API/v2/sign-tasks" 2>/dev/null | jq -r '.signTaskId // empty')

    if [ -z "$TASK_ID" ]; then
        echo "   ❌ Failed to create signing task"
        rm -rf "$WORK"
        return 1
    fi

    echo "   Task ID: $TASK_ID"

    # Poll
    local ELAPSED=0
    while [ $ELAPSED -lt $SIGNING_TIMEOUT ]; do
        sleep 5
        ELAPSED=$((ELAPSED + 5))
        local STATUS=$(awscurl --service signer-builder-tools \
            --region $CDSIGNER_REGION \
            -X GET --header "Content-Type: application/json" \
            "$CDSIGNER_API/v2/sign-tasks/$TASK_ID" 2>/dev/null | jq -r '.status // "unknown"')

        echo "   Status: $STATUS (${ELAPSED}s)"

        if [ "$STATUS" = "success" ]; then
            echo "   Downloading signed .app..."
            aws s3 cp "s3://$ARTIFACTS_BUCKET/$OUTPUT_KEY" "$WORK/signed.zip" --region $REGION 2>/dev/null
            mkdir -p "$WORK/signed"
            cd "$WORK/signed"
            unzip -o ../signed.zip >/dev/null 2>&1
            if [ -d "cckiro.app" ]; then
                # Store signed .app in releases
                rm -rf "$ORIG_DIR/releases/${NAME}.app"
                mv cckiro.app "$ORIG_DIR/releases/${NAME}.app"
                echo "   ✅ $LABEL signed (.app bundle)"
                cd "$ORIG_DIR"
                rm -rf "$WORK"
                return 0
            fi
            echo "   ❌ Signed .app not found in output"
            cd "$ORIG_DIR"
            rm -rf "$WORK"
            return 1
        elif [ "$STATUS" = "failed" ] || [ "$STATUS" = "error" ]; then
            echo "   ❌ Signing failed"
            rm -rf "$WORK"
            return 1
        fi
    done

    echo "   ❌ Timeout"
    rm -rf "$WORK"
    return 1
}

if sign_macos "releases/cckiro-mac-intel" "cckiro-mac-intel" "macOS Intel"; then
    MAC_INTEL_RESULT="success"
else
    MAC_INTEL_RESULT="failed"
fi
echo ""

if sign_macos "releases/cckiro-mac-arm" "cckiro-mac-arm" "macOS Apple Silicon"; then
    MAC_ARM_RESULT="success"
else
    MAC_ARM_RESULT="failed"
fi
echo ""

# ─────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔐 Signing Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Windows:           $WIN_RESULT"
echo "   macOS Intel:       $MAC_INTEL_RESULT"
echo "   macOS Apple Silicon: $MAC_ARM_RESULT"
echo "   Linux:             skipped (not required)"
echo ""

FAILURES=0
for r in $WIN_RESULT $MAC_INTEL_RESULT $MAC_ARM_RESULT; do
    [ "$r" = "failed" ] && FAILURES=$((FAILURES + 1))
done

if [ $FAILURES -gt 0 ]; then
    echo "⚠️  $FAILURES platform(s) failed. Unsigned binaries will be used for failed platforms."
    read -p "Continue? (y/n) " -n 1 -r
    echo ""
    [[ ! $REPLY =~ ^[Yy]$ ]] && echo "❌ Aborted" && exit 1
else
    echo "✅ All platforms signed!"
fi

exit 0
