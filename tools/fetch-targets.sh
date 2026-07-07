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
# 04 모나리자: 응집 시 원작 크로스페이드 리빌용 고해상 필요 (입자 샘플링은 count 캡으로 무관).
# 허용 버킷은 960px/517KB·1280px/980KB 두 개뿐 — 1280은 600KB 초과 → 960px 채택
# (width=800~960 요청 모두 960px 버킷으로 스냅, 목표 800~1280px·600KB 이하 충족).
fetch 04-mona-lisa.jpg       960 "Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg"
# 화면 표시용 (등불 리빌·프레스코·판화 배경 — 고해상 필요)
fetch 06-night-watch.jpg     1024 "The_Night_Watch_-_HD.jpg"
fetch 09-creation-of-adam.jpg 1024 "Michelangelo_-_Creation_of_Adam_(cropped).jpg"
# 인왕제색도 contain-fit 배경 (1024 요청 → 1280px 허용 버킷 채택, 수묵 먹빛 대비 보존)
fetch 13-inwang-after-rain.jpg 1024 "Inwangjesaekdo.jpg"
# 씨름 contain-fit 배경 (원작 1747×2079 세로형 · 800 요청 → 960px 허용 버킷 채택:
# 1024/1280 버킷은 ~717KB로 600KB 상한 초과, 960px/445KB가 목표폭·용량 균형)
fetch 14-ssireum.jpg 800 "Danwon-Ssireum.jpg"
# 월하정인 contain-fit 배경 (원작 3216×2550 가로형 · 1024 요청 → 1280px 허용 버킷 채택:
# 960/1280 두 버킷만 존재, 1280px/407KB가 목표폭 1024에 가장 근접하며 600KB 이내)
fetch 15-lovers-moonlight.jpg 1024 "Hyewon-Wolha.jeongin-3.jpg"
# 몽유도원도 두루마리 가로 카메라 배경 (원작 8773×3185 초가로형 두루마리 · 1600 요청 →
# 1920px 허용 버킷 채택: 버킷은 1280/1920/3840만 존재, 3840px는 ~2.2MB로 600KB 초과 →
# 그 아래 1920px/545KB가 목표폭 ~1600 이상이면서 600KB 이내)
fetch 16-dream-journey.jpg 1920 "Mongyudowondo.jpg"

echo "완료: $(ls assets/targets/*.jpg | wc -l)/10"
