#!/usr/bin/env bash
# Check for orphaned model TOML files whose extends.from references
# point to providers or base models that no longer exist.
#
# When a provider directory is deleted, any model file in another provider
# that uses [extends] from = "<deleted-provider>/<model>" becomes orphaned
# and will cause generate() to throw an error.
#
# Usage: ./scripts/check-orphan-models.sh [--delete]
#   --delete  Automatically delete orphaned files without prompting

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROVIDERS_DIR="$PROJECT_DIR/providers"

AUTO_DELETE=false
if [[ "${1:-}" == "--delete" ]]; then
  AUTO_DELETE=true
fi

orphan_files=()
orphan_reasons=()

# Find all model TOML files containing extends.from references
# grep -rn on an absolute path returns absolute paths:
#   /abs/path/file:lineno:...from = "provider/model"...
echo "Scanning providers directory for extends.from references..."

while IFS= read -r line; do
  # Extract file path (before first colon — already absolute)
  file_abs="${line%%:*}"
  # Derive relative path for display
  file_rel="${file_abs#$PROJECT_DIR/}"

  # Extract the from value (inside quotes after "from = ")
  ref=$(echo "$line" | grep -oP 'from\s*=\s*"[^"]*"' | head -1 | sed 's/from\s*=\s*"//;s/"$//')

  if [[ -z "$ref" ]]; then
    continue
  fi

  # Split ref into provider_id and model_id
  provider_id="${ref%%/*}"
  model_id="${ref#*/}"

  provider_dir="$PROVIDERS_DIR/$provider_id"

  # Case 1: Provider directory doesn't exist at all
  if [[ ! -d "$provider_dir" ]]; then
    orphan_files+=("$file_abs")
    orphan_reasons+=("Provider '$provider_id' does not exist (extends.from = \"$ref\")")
    echo "ORPHAN: $file_rel"
    echo "  Reason: Provider '$provider_id' does not exist (extends.from = \"$ref\")"
    continue
  fi

  # Case 2: Provider exists but the referenced base model file doesn't
  model_file="$provider_dir/models/$model_id.toml"
  if [[ ! -f "$model_file" ]]; then
    orphan_files+=("$file_abs")
    orphan_reasons+=("Base model '$ref' not found (missing $model_file)")
    echo "ORPHAN: $file_rel"
    echo "  Reason: Base model '$ref' not found (missing $provider_dir/models/$model_id.toml)"
    continue
  fi

done < <(grep -rn 'from = "' "$PROVIDERS_DIR" --include='*.toml')

# Summary
echo ""
echo "=========================================="
echo "  Orphaned Model Check Summary"
echo "=========================================="

total=${#orphan_files[@]}
if [[ $total -eq 0 ]]; then
  echo "✅ No orphaned models found. All extends.from references are valid."
  exit 0
fi

echo "❌ Found $total orphaned model file(s):"
echo ""
for i in "${!orphan_files[@]}"; do
  rel_path="${orphan_files[$i]#$PROJECT_DIR/}"
  echo "  [$((i+1))] $rel_path"
  echo "        ${orphan_reasons[$i]}"
done
echo ""

# Prompt for deletion
if [[ "$AUTO_DELETE" == true ]]; then
  echo "Auto-delete mode (--delete): removing orphaned files..."
  for f in "${orphan_files[@]}"; do
    rm "$f"
    echo "  Deleted: ${f#$PROJECT_DIR/}"
  done
  # Clean up empty directories left behind
  echo ""
  echo "Cleaning up empty directories..."
  find "$PROVIDERS_DIR" -type d -empty -not -path "$PROVIDERS_DIR" -delete 2>/dev/null || true
  echo ""
  echo "✅ Done. Deleted $total orphaned model file(s)."
  exit 0
fi

echo "Do you want to delete these orphaned model files?"
read -rp "Delete all $total orphaned files? [y/N] " confirm

if [[ "$confirm" =~ ^[yY]$ ]]; then
  for f in "${orphan_files[@]}"; do
    rm "$f"
    echo "  Deleted: ${f#$PROJECT_DIR/}"
  done
  # Clean up empty directories
  echo ""
  echo "Cleaning up empty directories..."
  find "$PROVIDERS_DIR" -type d -empty -not -path "$PROVIDERS_DIR" -delete 2>/dev/null || true
  echo ""
  echo "✅ Done. Deleted $total orphaned model file(s)."
else
  echo ""
  echo "No files deleted. To delete later, run:"
  echo "  ./scripts/check-orphan-models.sh --delete"
  exit 1
fi