# 📷/🎤 전작품 커버리지 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or a Workflow with per-task review. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 05·06·07·16 손짓(플래그·문구), 08·13·14·15 소리(공용 헬퍼 + 작품 코드), 🎤 버튼 중립화.
**Spec:** `docs/superpowers/specs/2026-09-20-cam-sound-coverage-design.md` — 상수·문구·매핑은 스펙 그대로.

## Global Constraints
- worktree `.worktrees/cam-sound`(브랜치 `feature/cam-sound-coverage`). 메인 체크아웃 checkout 금지, bare stash 금지, pkill -f 금지(fuser -k 사용).
- 작품 모듈은 타이머·이벤트 금지, `opts.audio.mic` getter 폴링만. 마이크 비활성 시 기존 동작 100% 유지.
- 한국어 주석·문구. 커밋 트레일러 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- `node --test test/` 통과, 변경 파일 `node --check`.

### Task 1: `js/sound-gesture.js` + `test/sound-gesture.test.mjs` (TDD, 스펙 코드 그대로)
### Task 2: `js/data.js` 8작품 플래그·hint·note(스펙 표) + `test/data.test.mjs` mic 검사 일반화 + `js/main.js`/`index.html` 🎤 문구 중립화·툴팁
### Task 3~6: 08·13·14·15 소리 반응(스펙 매핑) — 서로 다른 파일, 병렬 가능(각자 자기 파일만 수정)
### Task 7: 검증 — 가짜 카메라 대본(05·06·07·16), 가짜 마이크 대본(08·13·14·15), 콘솔 0, 스크린샷
### Task 8: 전체 리뷰(스펙 대조·회귀·성능) → 수정 → 사용자 보고(배포는 별도 지시)
