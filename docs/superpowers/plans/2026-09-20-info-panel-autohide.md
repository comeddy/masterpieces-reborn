# 작품 설명 패널 자동 숨김 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 모든 작품에서 설명 패널이 진입 4초 뒤 왼쪽으로 슬라이드아웃하고, 마우스 오버 시 대기, ⓘ로 복귀·수동 시 유지.
**Architecture:** 셸(main.js) rAF dt 누적 타이머 + CSS 전환. 작품 모듈 무변경. **Spec:** `docs/superpowers/specs/2026-09-20-info-panel-autohide-design.md`

## Global Constraints
- 작업 위치 worktree `.worktrees/info-autohide`(브랜치 `feature/info-autohide`). 메인 체크아웃에서 checkout 금지, bare stash 금지.
- 스펙의 상수·CSS 값·함수명(`INFO_AUTO_HIDE`, `setInfoHidden`, `resetInfoAutoHide`, `tickInfoAutoHide`)을 그대로 사용. 한국어 주석. 커밋 트레일러 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- `node --test test/` 통과, `node --check js/main.js`.

### Task 1: CSS + 셸 자동 숨김 (스펙 코드 그대로)
- [ ] `css/style.css` `.viewer__info` transition 교체, `.is-hidden` transform 교체, reduced-motion 규칙 추가
- [ ] `js/main.js` 블록 추가(포인터 규약 블록 뒤), openWork·frame·토글 리스너 수정
- [ ] `node --check js/main.js && node --test test/`
- [ ] 커밋 `feat: 작품 설명 패널 4초 후 왼쪽 슬라이드아웃 — 마우스 오버 대기·ⓘ 복귀·수동 시 유지`

### Task 2: Playwright 검증(스펙 검증 1~8) — 스크래치패드 스크립트, 저장소 무변경
