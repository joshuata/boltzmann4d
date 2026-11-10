#!/bin/sh
# Prints a hash of the Java program inputs given as paths inside vendor/boltzmann3d
# (committed content plus any uncommitted changes). The java:* mise tasks store it next to
# their outputs and only rerun the Java app when it differs, so a fresh clone or CI run
# doesn't rerun Java unless the Java program actually changed.
set -eu
cd "$(dirname "$0")/../vendor/boltzmann3d"
{
  git ls-files -s -- "$@"
  git diff HEAD -- "$@"
  git ls-files --others --exclude-standard -- "$@" | xargs -r git hash-object --
} | git hash-object --stdin
