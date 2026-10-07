#!/usr/bin/env bash
set -euo pipefail
tags=("sha-${GITHUB_SHA}")
version="0.1.0-edge.${GITHUB_RUN_NUMBER}"
if [[ "$GITHUB_REF" == refs/heads/main ]]; then
  tags+=(edge)
elif [[ "$GITHUB_REF_NAME" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$ ]]; then
  version="${GITHUB_REF_NAME#v}"
  tags+=("$version")
else
  echo "Release tags must use vMAJOR.MINOR.PATCH[-PRERELEASE]"
  exit 1
fi
registry="ghcr.io/${GITHUB_REPOSITORY_OWNER,,}"
trap 'docker logout ghcr.io; helm registry logout ghcr.io' EXIT
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io --username "$GITHUB_ACTOR" --password-stdin
printf '%s' "$GHCR_TOKEN" | helm registry login ghcr.io --username "$GITHUB_ACTOR" --password-stdin
for component in core ui; do
  for tag in "${tags[@]}"; do
    image="$registry/collaborative-$component:$tag"
    docker tag "asmblyr-collaborative-$component:ci" "$image"
    docker push "$image"
    echo "Published: \`$image\`" >> "$GITHUB_STEP_SUMMARY"
  done
done
mkdir -p /tmp/collaborative-chart
helm package deploy/helm/collaborative --version "$version" --app-version "sha-$GITHUB_SHA" --destination /tmp/collaborative-chart
helm push "/tmp/collaborative-chart/collaborative-$version.tgz" "oci://$registry/charts"
echo "Chart: \`oci://$registry/charts/collaborative --version $version\`" >> "$GITHUB_STEP_SUMMARY"
