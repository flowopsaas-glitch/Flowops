#!/usr/bin/env bash
#
# Fetch the TRIM Network Statement primary sources and emit the retrieval record
# for section 4 of docs/TRIM-SOURCE-RETRIEVAL-MANIFEST-2026-10-04.md.
#
# RUN THIS ON A MACHINE WITH NETWORK ACCESS. The development sandbox has no
# egress to transnet.net (verified 2026-10-04: SSL_ERROR_SYSCALL), so these
# files cannot be fetched there.
#
# Binaries are written OUTSIDE the repository tree by default and are never
# committed. Only the metadata (hash, size, format, date, period) goes into the
# manifest.
#
# Usage:  ./docs/tools/fetch-trim-sources.sh [output-dir]
#         ./docs/tools/fetch-trim-sources.sh --v4-only [output-dir]
#         ./docs/tools/fetch-trim-sources.sh --help

set -uo pipefail

BASE="https://www.transnet.net/getFile.ashx?id="
FETCH_V3=1
OUT=""

usage() {
  sed -n '3,16p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --v4-only) FETCH_V3=0; shift ;;
    -h|--help) usage ;;
    *) OUT="$1"; shift ;;
  esac
done

OUT="${OUT:-$HOME/trim-sources}"
V4="$OUT/v4"
V3="$OUT/v3"
mkdir -p "$V4" "$V3"

# id|filename|period
V4_ITEMS=(
  "28645|network-statement-v4.pdf|FY26/27-FY27/28"
  "28648|annexure-15-rail-access-agreement.pdf|FY26/27-FY27/28"
  "22928|annexure-17-investment-plan.pdf|FY26/27-FY27/28"
  "21073|annexure-33-network-register.pdf|FY26/27-FY27/28"
  "22633|annexure-33a-point-to-point-running-times.xlsx|FY26/27-FY27/28"
  "21146|annexure-33b-capacity-statement.xlsm|FY26/27-FY27/28"
  "22385|annexure-40-ancillary-services-catalogue.pdf|FY26/27-FY27/28"
  "21716|annexure-41-occurrence-reporting-procedure.pdf|FY26/27-FY27/28"
  "21717|annexure-42-customer-collaboration-policy.pdf|FY26/27-FY27/28"
  "21147|annexure-43-kpis.xlsx|FY26/27-FY27/28"
  "28658|full-publication-notice.pdf|FY26/27-FY27/28"
)

V3_ITEMS=(
  "4010|network-statement-v3.pdf|FY24/25"
  "5238|addendum-section-4-10.pdf|FY24/25"
  "4011|annexure-01-provisional-shut-schedule.pdf|FY24/25"
  "4012|annexure-13-pantograph-specification.pdf|FY24/25"
  "4013|annexure-14-diesel-nozzle-specification.pdf|FY24/25"
  "4015|annexure-23-shunting-rolling-stock-specifications.pdf|FY24/25"
  "4017|annexure-16-faculty-of-rail-team-contact-details.pdf|FY24/25"
  "4036|annexure-18-occurrence-management.pdf|FY24/25"
  "4037|annexure-22-loading-profiles.pdf|FY24/25"
  "4018|annexure-24-interface-agreement.pdf|FY24/25"
  "4019|annexure-25-self-screening-checklist.pdf|FY24/25"
  "4020|annexure-26-environmental-analysis.pdf|FY24/25"
  "4022|annexure-27-risk-analysis-guidelines.pdf|FY24/25"
  "4021|annexure-27a-risk-register-example.pdf|FY24/25"
  "4046|annexure-27b-risk-analysis-and-mitigation-plan.xls|FY24/25"
  "4023|annexure-28-daily-handshake-process.pdf|FY24/25"
  "4049|annexure-29a-network-access-application-form.pdf|FY24/25"
  "4050|annexure-29a-network-access-application-form-alt.pdf|FY24/25"
  "5237|annexure-29b-network-capacity-statement.pdf|FY24/25"
  "4026|annexure-30-credit-application.pdf|FY24/25"
  "4027|annexure-31-non-disclosure-agreement.pdf|FY24/25"
  "4028|annexure-32-ad-hoc-slot-application-process.pdf|FY24/25"
  "4035|annexure-34-volume-confirmation-letter.pdf|FY24/25"
  "4038|annexure-19a-posmor.pdf|FY24/25"
  "4039|annexure-19b-train-working-rules.pdf|FY24/25"
  "4040|annexure-19c-general-appendix-6.pdf|FY24/25"
  "4041|annexure-20a-cancel-or-reschedule-process.pdf|FY24/25"
  "4042|annexure-20b-cancellation-reasons.pdf|FY24/25"
  "4043|annexure-21-clearinghouse-process-narrative.pdf|FY24/25"
  "4044|annexure-35-dispute-resolution-process.pdf|FY24/25"
  "4045|annexure-36-emergency-response-plan.pdf|FY24/25"
)

RETRIEVED="$(date -u +%Y-%m-%d)"
ROWS=""
FAILED=""

fetch_one() {
  local dir="$1" id="$2" name="$3" period="$4"
  local path="$dir/$name"
  local code
  # -w prints the code even when curl fails, and `|| echo` would append a second
  # one ("000000"). Capture the exit status separately and derive the code from it.
  code=$(curl -sSL --max-time 180 -o "$path" -w "%{http_code}" "${BASE}${id}" 2>/dev/null)
  [ $? -eq 0 ] || code="000"

  if [ "$code" != "200" ]; then
    rm -f "$path"
    FAILED="$FAILED\n  FAIL  http=$code  id=$id  $name"
    return 1
  fi

  local size magic format hash
  size=$(wc -c < "$path" | tr -d ' ')
  magic=$(head -c 4 "$path" | od -An -tx1 | tr -d ' \n')

  case "$magic" in
    25504446*) format="PDF" ;;
    504b0304|504b0506|504b0708) format="XLSX/XLSM" ;;
    d0cf11e0) format="XLS (legacy)" ;;
    *) format="unknown ($magic)" ;;
  esac

  # Annexure 43 is labelled XLSX on one page and PDF on the other; the binary
  # decides, and the mismatch is recorded rather than assumed either way.
  if [ "$name" = "annexure-43-kpis.xlsx" ] && [ "$format" = "PDF" ]; then
    mv "$path" "${path%.xlsx}.pdf"
    path="${path%.xlsx}.pdf"
    name="${name%.xlsx}.pdf"
  fi

  hash=$(sha256sum "$path" | cut -d' ' -f1)
  ROWS="$ROWS\n| $name | \`$hash\` | $size | $format | $RETRIEVED | $period |"
  printf '  ok    %-52s %8s bytes  %s\n' "$name" "$size" "$format"
}

echo "== Version 4 — governing set (FY2026/27 + FY2027/28) =="
for item in "${V4_ITEMS[@]}"; do
  IFS='|' read -r id name period <<< "$item"
  fetch_one "$V4" "$id" "$name" "$period"
done

if [ "$FETCH_V3" = "1" ]; then
  echo
  echo "== Version 3 — gap-filling set (FY2024/25, period caveat) =="
  for item in "${V3_ITEMS[@]}"; do
    IFS='|' read -r id name period <<< "$item"
    fetch_one "$V3" "$id" "$name" "$period"
  done
fi

echo
echo "== Retrieval record — paste into manifest section 4 =="
printf "| File | SHA-256 | Size | Format | Retrieved | Period |\n"
printf "| --- | --- | --- | --- | --- | --- |\n"
printf "$ROWS\n"
echo

if [ -n "$FAILED" ]; then
  echo "== Failures =="
  printf "$FAILED\n"
fi

echo "Files written to: $OUT"
echo "These are NOT in the repository tree and must not be committed."
