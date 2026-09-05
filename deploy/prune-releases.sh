#!/usr/bin/env bash
# Retain only the active source release and image after a successful deployment.
# Run without --apply to review the exact cleanup without deleting anything.
set -Eeuo pipefail

RELEASE_ROOT=${1:?Release directory required}
REPOSITORY=${2:?Image repository required}
ACTIVE_SHA=${3:?Active commit required}
MODE=${4:---dry-run}

[[ "$ACTIVE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid active commit.' >&2; exit 1; }
[[ "$MODE" == '--apply' || "$MODE" == '--dry-run' ]] || { echo 'Invalid cleanup mode.' >&2; exit 1; }
[[ -d "$RELEASE_ROOT/$ACTIVE_SHA" ]] || { echo 'Active release is missing.' >&2; exit 1; }

# Read Docker before deleting sources: a failed inventory must leave everything intact.
IMAGES=$(docker image ls "$REPOSITORY" --format '{{.Tag}}')

for directory in "$RELEASE_ROOT"/*; do
  [[ -d "$directory" && ! -L "$directory" ]] || continue
  sha=${directory##*/}
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || continue
  [[ "$sha" != "$ACTIVE_SHA" ]] || continue
  echo "Remove source release: $RELEASE_ROOT/$sha"
  if [[ "$MODE" == '--apply' ]]; then rm -rf -- "$RELEASE_ROOT/$sha"; fi
done

while IFS= read -r tag; do
  [[ "$tag" =~ ^[0-9a-f]{40}$ ]] || continue
  [[ "$tag" != "$ACTIVE_SHA" ]] || continue
  echo "Remove image tag: $REPOSITORY:$tag"
  if [[ "$MODE" == '--apply' ]]; then
    # Never force removal: another container may still own an old image.
    docker image rm "$REPOSITORY:$tag" || echo "Image is still in use: $REPOSITORY:$tag" >&2
  fi
done <<< "$IMAGES"
