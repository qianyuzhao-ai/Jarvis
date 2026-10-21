#!/usr/bin/env bash

retry_apple_network() {
  local attempt output status
  for attempt in 1 2 3; do
    if output="$("$@" 2>&1)"; then
      printf '%s\n' "$output"
      return 0
    else
      status=$?
    fi
    printf '%s\n' "$output" >&2
    if grep -Eiq '(^|[[:space:]])(rejected|revoked)([[:space:]]|$)|invalid signature|not signed' <<< "$output" ||
      ! grep -Eq '(NSURLErrorDomain|kCFErrorDomainCFNetwork) Code=-(1001|1003|1004|1005|1006|1009)([^0-9]|$)' <<< "$output" ||
      [[ "$attempt" -eq 3 ]]; then
      return "$status"
    fi
    printf 'Apple network validation failed (attempt %s/3); retrying in %ss\n' "$attempt" "$((attempt * 5))" >&2
    sleep "$((attempt * 5))"
  done
}
