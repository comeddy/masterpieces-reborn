#!/usr/bin/env bash
# Wikimedia Commons 퍼블릭 도메인 원작을 로컬 번들용으로 내려받는다.
# Special:FilePath의 width 파라미터로 서버측 리사이즈 — 로컬 이미지 도구 불필요.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p assets/targets
UA="MasterpiecesReborn/1.0 (art exhibition; educational; contact: comeddy@gmail.com)"

fetch() { # fetch <출력파일> <너비> <Commons 파일명>
  local out="assets/targets/$1" width="$2" name="$3"
  echo "→ $1 (w=$width)"
  curl -sSL --retry 5 --retry-delay 5 --retry-all-errors -A "$UA" \
    "https://commons.wikimedia.org/wiki/Special:FilePath/${name}?width=${width}" -o "$out"
  # JPEG 매직바이트 검증 — 실패 시 즉시 중단
  [ "$(head -c 3 "$out" | od -An -tx1 | tr -d ' \n')" = "ffd8ff" ] || { echo "  ✗ $1: JPEG 아님"; rm -f "$out"; exit 1; }
  echo "  ✓ $(wc -c < "$out") bytes"
  sleep 2  # Wikimedia 속도 제한 예방
}

# Ⅰ관 입자 샘플링용 (256px면 충분 — 입자 목표 좌표만 추출)
fetch 01-great-wave.jpg      256 "The_Great_Wave_off_Kanagawa.jpg"
fetch 02-birth-of-venus.jpg  256 "Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg"
fetch 03-pearl-earring.jpg   256 "1665_Girl_with_a_Pearl_Earring.jpg"
fetch 04-mona-lisa.jpg       256 "Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg"
# 화면 표시용 (등불 리빌·프레스코·판화 배경 — 고해상 필요)
fetch 06-night-watch.jpg     1024 "The_Night_Watch_-_HD.jpg"
fetch 09-creation-of-adam.jpg 1024 "Michelangelo_-_Creation_of_Adam_(cropped).jpg"

echo "완료: $(ls assets/targets/*.jpg | wc -l)/6"
