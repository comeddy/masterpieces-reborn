# 10번 유휴 리셋 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 마지막 사용자 입력(클릭·드래그·카메라 손) 후 3~5초 무입력이면 탑을 전체 붕괴시키고 밑동 3층을 낙하 재건 — 관객이 떠날 때 1회만.

**Architecture:** 순수 유휴 상태 기계(`makeIdle`/`idleStep`)를 10번 모듈 상단에 export(기존 gestureStep 패턴)하고, update()에서 engaged 판정 후 발동 시 `resetTower()`(기존 `collapseFrom(0)` + `placeSlot` 재사용). 새 렌더 경로 없음.

**Tech Stack:** 순수 ES 모듈, node:test.

**Spec:** `docs/superpowers/specs/2026-09-19-babel-idle-reset-design.md`

## Global Constraints

- `IDLE_MIN = 3`, `IDLE_MAX = 5` — 무장 시점마다 `rand(IDLE_MIN, IDLE_MAX)`로 한계 선택.
- engaged 판정: `(ptr.inside && ptr.down) || ptr.justDown || handPt.n >= 1` — 커서 이동만으로는 반응 아님.
- 발동은 무장 상태에서 1회 — 새 입력 전 재발동 금지. 자동 건설·MAX_TIERS·기존 인터랙션 무변경.
- 주석 한국어, 커밋 메시지 기존 스타일. 테스트는 `node --test test/`.

---

### Task 1: 순수 유휴 상태 기계 + 피스 통합 (TDD, 인라인)

**Files:**
- Modify: `js/pieces/10-tower-of-babel.js` (상수부 export, 모듈 상태, init, update, resetTower, dispose)
- Test: `test/babel-gesture.test.mjs` (2건 추가)

**Interfaces:**
- Produces: `IDLE_MIN=3`, `IDLE_MAX=5`, `makeIdle(): {armed,t,limit}`, `idleStep(s, engaged, dt, pick): boolean`

- [ ] **Step 1: 실패하는 테스트 — test/babel-gesture.test.mjs 끝에 추가**

```js
test("유휴 리셋: 입력으로 무장 후 한계 도달 시 1회 발동, 재입력 전 재발동 없음", () => {
  const s = makeIdle();
  const pick = () => 4;
  let fired = 0;
  for (let t = 0; t < 6; t += 1 / 60) if (idleStep(s, false, 1 / 60, pick)) fired++;
  assert.equal(fired, 0);                       // 무장 전 유휴는 발동하지 않음
  assert.equal(idleStep(s, true, 1 / 60, pick), false); // 입력 → 무장
  for (let t = 0; t < 10; t += 1 / 60) if (idleStep(s, false, 1 / 60, pick)) fired++;
  assert.equal(fired, 1);                       // 4초 뒤 정확히 1회, 이후 침묵
  idleStep(s, true, 1 / 60, pick);              // 재입력 → 재무장
  for (let t = 0; t < 5; t += 1 / 60) if (idleStep(s, false, 1 / 60, pick)) fired++;
  assert.equal(fired, 2);                       // 재발동 가능
});

test("유휴 리셋: 입력이 이어지는 동안 타이머가 리셋되어 발동하지 않는다", () => {
  const s = makeIdle();
  let fired = 0;
  for (let t = 0; t < 8; t += 1 / 60) {
    const engaged = Math.floor(t) % 2 === 0;    // 2초 주기 on/off — 유휴가 3초를 못 채움
    if (idleStep(s, engaged, 1 / 60, () => 3)) fired++;
  }
  assert.equal(fired, 0);
});
```

import 줄에 `IDLE_MIN, IDLE_MAX, makeIdle, idleStep` 추가.

- [ ] **Step 2: 실패 확인** — `node --test test/babel-gesture.test.mjs` → FAIL (`makeIdle` 없음)

- [ ] **Step 3: 구현**

(a) gestureStep 블록 아래 순수부:

```js
// ---- 유휴 리셋 상태 기계 (순수, node:test 대상) ----
// 사용자 입력으로 무장(arm)되고, 이후 limit(3~5s)초 무입력이면 1회 발동 후 해제.
// 미무장 유휴에서는 발동하지 않는다 — 관객이 떠날 때 한 번만 리셋.
export const IDLE_MIN = 3;
export const IDLE_MAX = 5;

export function makeIdle() {
  return { armed: false, t: 0, limit: 0 };
}

export function idleStep(s, engaged, dt, pick) {
  if (engaged) {
    if (!s.armed) s.limit = pick();     // 무장 시점에 한계 확정(사이클마다 랜덤)
    s.armed = true; s.t = 0;
    return false;
  }
  if (!s.armed) return false;
  s.t += dt;
  if (s.t >= s.limit) { s.armed = false; s.t = 0; return true; }
  return false;
}
```

(b) 모듈 상태 12행 부근: `let idle = null;` 추가. init에 `idle = makeIdle();`, dispose에 `idle = null;`.

(c) update()의 카메라 제스처 블록 뒤, `buildTimer += dt;` 앞:

```js
  // 유휴 리셋: 관객이 떠나고 3~5초가 지나면 탑 전체가 무너지고 밑동부터 다시 시작
  const engaged = (ptr.inside && ptr.down) || ptr.justDown || handPt.n >= 1;
  if (idleStep(idle, engaged, dt, () => rand(IDLE_MIN, IDLE_MAX))) resetTower();
```

(d) collapseFrom 아래 resetTower:

```js
// --- 유휴 리셋: 전체 붕괴 후 밑동 3층을 낙하 벽돌로 재건 ---
function resetTower() {
  collapseFrom(0);
  for (let t = 0; t < 3; t++) {
    ensureTier(t);
    for (let i = 0; i < tiers[t].cap; i++) placeSlot(t, i);
  }
}
```

- [ ] **Step 4: 통과 확인** — `node --test test/` → 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git add js/pieces/10-tower-of-babel.js test/babel-gesture.test.mjs
git commit -m "feat: 10번 유휴 리셋 — 마지막 입력 3~5초 뒤 전체 붕괴·밑동 재건 (1회, 순수 idleStep + 테스트)"
```

### Task 2: 머지·배포 (검증 전용)

- [ ] 메인 체크아웃(master)에서 `git merge --no-ff feature/babel-idle-reset` → `node --test test/` 전체 PASS → `git push origin master`
- [ ] `./tools/deploy.sh` → 라이브 `js/pieces/10-tower-of-babel.js` sha256 로컬 일치 + `idleStep` 문자열 존재 확인
- [ ] worktree·브랜치 정리, 원장 기록
