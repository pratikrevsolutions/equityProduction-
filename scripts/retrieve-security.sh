#!/usr/bin/env bash
# Combined retrieve of security/visibility metadata. Must be retrieved together
# with the objects/classes/pages/tabs/flows they secure so that FLS and object/
# tab/page access resolve completely in the retrieved Profile/PermissionSet XML.
set -u
cd "$(dirname "$0")/.."

ORG="Production"
API_VERSION="68.0"
PKG="manifest/security-package.xml"
LOG_DIR="logs"
mkdir -p "$LOG_DIR"

SECURITY_TYPES="Profile PermissionSet PermissionSetGroup MutingPermissionSet CustomObject ApexClass ApexPage CustomTab CustomApplication Layout FlexiPage CustomPermission CustomMetadata ExternalDataSource ConnectedApp Flow"

{
  echo '<?xml version="1.0" encoding="UTF-8"?>'
  echo '<Package xmlns="http://soap.sforce.com/2006/04/metadata">'
  for t in $SECURITY_TYPES; do
    grep -q "<name>$t</name>" manifest/full.xml 2>/dev/null || continue
    echo "    <types>"
    echo "        <members>*</members>"
    echo "        <name>$t</name>"
    echo "    </types>"
  done
  echo "    <version>$API_VERSION</version>"
  echo '</Package>'
} > "$PKG"

# Note: this sf CLI build exits 1 whenever it prints its "update available"
# nag, regardless of actual command success, so exit code is NOT reliable.
# Use --json and check the top-level numeric "status" field instead (0 = ok).
OUT="manifest/_tmp/security-out.json"
mkdir -p manifest/_tmp
sf project retrieve start --manifest "$PKG" --target-org "$ORG" --wait 30 --json > "$OUT" 2>/dev/null
if grep -qm1 '"status": 0' "$OUT"; then
  echo "OK   security pass" | tee -a "$LOG_DIR/retrieve.log"
else
  echo "FAIL security pass" | tee -a "$LOG_DIR/failed.txt" "$LOG_DIR/retrieve.log"
  grep -o '"message": *"[^"]*"' "$OUT" | head -3 >> "$LOG_DIR/retrieve.log"
fi
