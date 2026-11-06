#!/usr/bin/env bash
# Retrieve every metadata type (one by one) from the Production org into force-app.
# Re-runnable: regenerate manifest/full.xml first with:
#   sf project generate manifest --from-org Production --name full --output-dir manifest
# Usage:
#   scripts/retrieve-all.sh                 # retrieve every type found in manifest/full.xml
#   scripts/retrieve-all.sh types-subset.txt # retrieve only the types listed (one per line)
set -u
cd "$(dirname "$0")/.."

ORG="Production"
API_VERSION="68.0"
TMP_DIR="manifest/_tmp"
LOG_DIR="logs"
mkdir -p "$TMP_DIR" "$LOG_DIR"

# Security/visibility types are retrieved together in a separate combined pass
# (see scripts/retrieve-security.sh) so they are skipped here.
SKIP_TYPES="Profile PermissionSet PermissionSetGroup MutingPermissionSet"

if [ "${1:-}" != "" ] && [ -f "$1" ]; then
  TYPE_LIST_FILE="$1"
else
  TYPE_LIST_FILE="$TMP_DIR/all-types.txt"
  grep -o '<name>[^<]*</name>' manifest/full.xml | sed 's/<name>//;s/<\/name>//' | sort -u > "$TYPE_LIST_FILE"
fi

touch "$LOG_DIR/retrieve.log" "$LOG_DIR/failed.txt"

retrieve_type() {
  local type="$1"
  local pkg="$TMP_DIR/pkg-$type.xml"
  local out="$TMP_DIR/out.json"
  cat > "$pkg" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>*</members>
        <name>$type</name>
    </types>
    <version>$API_VERSION</version>
</Package>
EOF
  # Note: this sf CLI build exits 1 whenever it prints its "update available"
  # nag, regardless of actual command success, so exit code is NOT reliable.
  # Use --json and check the top-level numeric "status" field instead (0 = ok).
  sf project retrieve start --manifest "$pkg" --target-org "$ORG" --wait 30 --json > "$out" 2>/dev/null
  if grep -qm1 '"status": 0' "$out"; then
    echo "OK   $type" | tee -a "$LOG_DIR/retrieve.log"
  else
    echo "FAIL $type" | tee -a "$LOG_DIR/failed.txt" "$LOG_DIR/retrieve.log"
    grep -o '"message": *"[^"]*"' "$out" | head -3 >> "$LOG_DIR/retrieve.log"
  fi
}

while IFS= read -r type; do
  [ -z "$type" ] && continue
  case " $SKIP_TYPES " in
    *" $type "*) continue ;;
  esac
  retrieve_type "$type"
done < "$TYPE_LIST_FILE"

echo "Done. Failures logged in $LOG_DIR/failed.txt (if any)."
