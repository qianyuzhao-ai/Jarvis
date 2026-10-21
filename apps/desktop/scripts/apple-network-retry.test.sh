#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/apple-network-retry.sh"

fixture="$(mktemp -d "${TMPDIR:-/tmp}/jarvis-apple-retry-test.XXXXXX")"
counter="$fixture/calls"
delays="$fixture/delays"

sleep() { printf '%s\n' "$1" >> "$delays"; }

mock_validate() {
  local calls
  calls="$(cat "$counter")"
  calls=$((calls + 1))
  printf '%s' "$calls" > "$counter"
  case "$scenario" in
    success) return 0 ;;
    recovered) [[ "$calls" -gt 1 ]] && return 0 ;;
    invalid) printf 'The validate action failed! Error 68. Ticket is invalid\n'; return 68 ;;
    rejected) printf 'app: rejected\nError Domain=NSURLErrorDomain Code=-1005\n'; return 1 ;;
    unsigned) printf 'invalid signature\n'; return 1 ;;
    unknown) printf 'Unexpected validation error\n'; return 2 ;;
  esac
  printf 'Error Domain=NSURLErrorDomain Code=-1005 "The network connection was lost."\nThe validate action failed! Error 68.\n'
  return 68
}

check_case() {
  local scenario="$1" expected_status="$2" expected_calls="$3" expected_delays="$4" status=0
  printf '0' > "$counter"
  : > "$delays"
  retry_apple_network mock_validate > "$fixture/output" 2>&1 || status=$?
  [[ "$status" -eq "$expected_status" ]]
  [[ "$(cat "$counter")" -eq "$expected_calls" ]]
  [[ "$(tr '\n' ',' < "$delays")" == "$expected_delays" ]]
  printf 'PASS: %s (exit %s, %s calls)\n' "$scenario" "$status" "$expected_calls"
}

check_case success 0 1 ''
check_case recovered 0 2 '5,'
check_case exhausted 68 3 '5,10,'
check_case invalid 68 1 ''
check_case rejected 1 1 ''
check_case unsigned 1 1 ''
check_case unknown 2 1 ''
