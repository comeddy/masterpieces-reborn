# Masterpieces Reborn 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세계 걸작 명화 12점을 인터랙티브 제너러티브 아트로 재해석한 제로-빌드 웹 전시 사이트를 만들어 S3+CloudFront로 배포한다.

**Architecture:** 순수 정적 사이트. `index.html`(셸) + `js/main.js`(전시 로직: 아트리움, 뷰어, rAF 루프, 포인터)가 `js/data.js`의 12작품 메타를 렌더하고, 작품 선택 시 `js/pieces/NN-*.js`를 동적 import하여 `{init, tick, resize, dispose}` 인터페이스로 구동한다. Ⅰ관 4작품은 공용 `js/particle-engine.js`(입자 응집↔흩어짐↔복원)를 사용한다.

**Tech Stack:** Vanilla ES Modules, Canvas 2D, WebAudio(11번 작품만), Node 20 내장 테스트 러너(`node --test`), Python http.server(로컬 서빙), Playwright MCP(브라우저 검증), AWS CLI(S3+CloudFront).

## Global Constraints

- 외부 JS 라이브러리·프레임워크·빌드 도구 금지. 폰트만 Google Fonts CDN 허용.
- 작품 모듈 내부에서 `addEventListener`/`requestAnimationFrame`/`setInterval` 금지 — rAF와 입력은 main.js가 소유하고 `tick(dt, pointer)`로 전달.
- 모든 좌표는 CSS 픽셀 (ctx는 main.js가 devicePixelRatio 스케일 적용, dpr 상한 2).
- `dt`는 초 단위, 0.05로 캡.
- `assets.target`이 null이면 모든 작품은 절차적 폴백으로 동작해야 함.
- `prefers-reduced-motion` 시 급격한 움직임·섬광 감쇠.
- 원작 이미지는 Wikimedia Commons 퍼블릭 도메인, 256px 썸네일로 로컬 번들(`assets/targets/`), 런타임 외부 핫링크 없음.
- 한국어 UI + 영문 작품 제목. 커밋 메시지는 한국어, `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` 푸터.
- 배포 전 content-review-agent ≥ 85점 필수.
- 로컬 서버: `python3 -m http.server 8080` (프로젝트 루트). 브라우저 검증: Playwright MCP로 `http://localhost:8080`.

---

### Task 1: 프로젝트 뼈대 — index.html + css/style.css

**Files:**
- Create: `index.html`
- Create: `css/style.css`

**Interfaces:**
- Produces: `#atrium .wings`(관/카드 주입 지점), `#viewer`(뷰어 오버레이: `#stage` 캔버스, `.viewer__info`, `[data-action]` 버튼들), `body[data-view="atrium"|"viewer"]` 뷰 전환 규약. main.js(Task 5)가 이 DOM 계약에 의존.

- [ ] **Step 1: index.html 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="description" content="Masterpieces Reborn — 세계 걸작 명화 12점을 인터랙티브 제너러티브 아트로 다시 그린 미디어 아트 전시." />
  <title>Masterpieces Reborn · 다시 살아나는 걸작들</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="./css/style.css" />
</head>
<body data-view="atrium">
  <div class="grain" aria-hidden="true"></div>
  <div class="vignette" aria-hidden="true"></div>

  <header class="topbar">
    <button class="brand" data-action="home" aria-label="아트리움으로">
      <span class="brand__mark" aria-hidden="true"></span>
      <span class="brand__text">MASTERPIECES&nbsp;REBORN</span>
    </button>
    <nav class="topnav" aria-label="전시관"><!-- wing links injected by JS --></nav>
    <button class="sound-toggle" data-action="sound" aria-pressed="false" aria-label="사운드 토글">
      <span class="sound-toggle__icon" aria-hidden="true"></span>
    </button>
  </header>

  <main class="atrium" id="atrium">
    <section class="hero">
      <p class="hero__eyebrow">인터랙티브 제너러티브 미디어 아트 전시</p>
      <h1 class="hero__title">Masterpieces<br />Reborn</h1>
      <p class="hero__lead">
        호쿠사이의 파도에서 칸딘스키의 도형까지 — 세계 걸작 명화 열두 점이
        코드로 다시 태어납니다. 수천 개의 입자가 원작의 형상으로 모여들고,
        당신의 손끝에 흩어졌다가, 다시 그 불멸의 그림으로 되돌아옵니다.
        세 개의 전시관을 거닐며 걸작을 직접 만지고, 휘젓고, 밝혀보세요.
      </p>
      <div class="hero__meta"><span>12 WORKS</span><i></i><span>3 WINGS</span><i></i><span>INTERACTIVE</span></div>
      <button class="hero__enter" data-action="enter">전시 입장</button>
    </section>
    <div class="wings" id="wings"><!-- wing sections + work cards injected by JS --></div>
    <footer class="colophon">
      <p>모든 원작은 퍼블릭 도메인입니다 · 매 화면은 실시간으로 생성됩니다</p>
      <p class="colophon__credit">Made with Claude (Fable 5)</p>
    </footer>
  </main>

  <section class="viewer" id="viewer" aria-hidden="true">
    <canvas id="stage"></canvas>
    <div class="viewer__chrome">
      <button class="viewer__close" data-action="close" aria-label="전시관으로 돌아가기">✕</button>
      <button class="viewer__nav viewer__nav--prev" data-action="prev" aria-label="이전 작품">‹</button>
      <button class="viewer__nav viewer__nav--next" data-action="next" aria-label="다음 작품">›</button>
      <div class="viewer__info">
        <p class="viewer__no"><span id="v-no"></span> · <span id="v-wing"></span></p>
        <h2 class="viewer__title" id="v-title"></h2>
        <p class="viewer__medium" id="v-medium"></p>
        <p class="viewer__note" id="v-note"></p>
        <p class="viewer__hint" id="v-hint"></p>
      </div>
      <button class="viewer__infotoggle" data-action="info" aria-expanded="true" aria-label="작품 설명 접기/펼치기">ⓘ</button>
    </div>
    <div class="viewer__error" id="v-error" hidden>
      <p>작품을 불러오지 못했습니다.</p>
      <button data-action="close">아트리움으로 돌아가기</button>
    </div>
  </section>

  <script type="module" src="./js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: css/style.css 작성**

```css
/* ============ Masterpieces Reborn — 전시 셸 스타일 ============ */
:root {
  --bg: #0a0b0f;
  --bg-soft: #12141b;
  --ink: #e8e4da;
  --ink-dim: #9a958a;
  --line: rgba(232, 228, 218, 0.14);
  --accent: #5aa7d8; /* 기본(Ⅰ관) — JS가 관별로 덮어씀 */
  --serif: "Cormorant Garamond", serif;
  --sans: "Inter", sans-serif;
  --mono: "Space Mono", monospace;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  background: var(--bg);
  color: var(--ink);
  font-family: var(--sans);
  font-weight: 300;
  overflow-x: hidden;
}
button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; }

/* ---- 분위기 오버레이 ---- */
.grain, .vignette { position: fixed; inset: 0; pointer-events: none; z-index: 40; }
.grain {
  opacity: 0.05;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E");
}
.vignette { background: radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.5) 100%); }

/* ---- 톱바 ---- */
.topbar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 50;
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 22px;
  background: linear-gradient(to bottom, rgba(10,11,15,0.92), rgba(10,11,15,0));
}
.brand { display: flex; align-items: center; gap: 10px; }
.brand__mark { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 12px var(--accent); transition: background 0.4s, box-shadow 0.4s; }
.brand__text { font-family: var(--mono); font-size: 11px; letter-spacing: 0.22em; color: var(--ink); }
.topnav { display: flex; gap: 4px; }
.topnav__link {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em;
  padding: 6px 10px; color: var(--ink-dim); border-radius: 3px;
  transition: color 0.25s;
}
.topnav__link:hover, .topnav__link[aria-current="true"] { color: var(--ink); }
.sound-toggle { width: 34px; height: 34px; border: 1px solid var(--line); border-radius: 50%; position: relative; }
.sound-toggle__icon { position: absolute; inset: 0; margin: auto; width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid var(--ink-dim); transition: all 0.25s; }
.sound-toggle[aria-pressed="true"] .sound-toggle__icon { background: var(--accent); border-color: var(--accent); box-shadow: 0 0 10px var(--accent); }

/* ---- 아트리움 ---- */
.atrium { max-width: 1180px; margin: 0 auto; padding: 0 24px; }
.hero { min-height: 92vh; display: flex; flex-direction: column; justify-content: center; padding-top: 80px; }
.hero__eyebrow { font-family: var(--mono); font-size: 11px; letter-spacing: 0.3em; color: var(--accent); margin-bottom: 22px; }
.hero__title { font-family: var(--serif); font-weight: 500; font-size: clamp(52px, 9vw, 110px); line-height: 1.02; letter-spacing: 0.01em; }
.hero__lead { max-width: 560px; margin-top: 28px; font-size: 15px; line-height: 1.85; color: var(--ink-dim); }
.hero__meta { display: flex; align-items: center; gap: 14px; margin-top: 34px; font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em; color: var(--ink-dim); }
.hero__meta i { width: 28px; height: 1px; background: var(--line); }
.hero__enter {
  margin-top: 44px; align-self: flex-start;
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.24em;
  padding: 15px 34px; border: 1px solid var(--line); border-radius: 2px;
  transition: border-color 0.3s, background 0.3s;
}
.hero__enter:hover { border-color: var(--accent); background: rgba(90,167,216,0.08); }

/* ---- 전시관 섹션 ---- */
.wing { padding: 70px 0 20px; }
.wing__head { display: flex; align-items: baseline; gap: 16px; border-bottom: 1px solid var(--line); padding-bottom: 16px; margin-bottom: 30px; }
.wing__index { font-family: var(--serif); font-style: italic; font-size: 30px; color: var(--wing-accent, var(--accent)); }
.wing__name { font-family: var(--serif); font-size: 26px; font-weight: 500; }
.wing__sub { font-family: var(--mono); font-size: 11px; letter-spacing: 0.18em; color: var(--ink-dim); }
.wing__works { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 18px; }

/* ---- 작품 카드 ---- */
.card {
  text-align: left; border: 1px solid var(--line); border-radius: 4px;
  padding: 20px; background: var(--bg-soft); position: relative; overflow: hidden;
  transition: border-color 0.3s, transform 0.3s;
}
.card:hover { border-color: var(--wing-accent, var(--accent)); transform: translateY(-3px); }
.card::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: var(--wing-accent, var(--accent)); opacity: 0; transition: opacity 0.3s;
}
.card:hover::before { opacity: 1; }
.card__no { font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; color: var(--wing-accent, var(--accent)); }
.card__title { font-family: var(--serif); font-size: 20px; font-weight: 500; margin-top: 10px; line-height: 1.25; }
.card__ko { font-size: 12px; color: var(--ink-dim); margin-top: 5px; }
.card__medium { font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.06em; color: var(--ink-dim); margin-top: 14px; line-height: 1.6; }

/* ---- 콜로폰 ---- */
.colophon { padding: 80px 0 46px; text-align: center; color: var(--ink-dim); font-size: 12px; line-height: 2; }
.colophon__credit { font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em; }

/* ---- 뷰어 ---- */
.viewer { position: fixed; inset: 0; z-index: 60; background: #000; display: none; }
body[data-view="viewer"] .viewer { display: block; }
body[data-view="viewer"] .atrium { display: none; }
body[data-view="viewer"] .topbar { display: none; }
#stage { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.viewer__chrome button { z-index: 5; }
.viewer__close, .viewer__infotoggle {
  position: absolute; top: 18px; width: 42px; height: 42px;
  border: 1px solid rgba(255,255,255,0.22); border-radius: 50%;
  color: #fff; font-size: 15px; background: rgba(0,0,0,0.35); backdrop-filter: blur(6px);
  transition: border-color 0.25s;
}
.viewer__close { right: 18px; }
.viewer__infotoggle { right: 70px; }
.viewer__close:hover, .viewer__infotoggle:hover, .viewer__nav:hover { border-color: #fff; }
.viewer__nav {
  position: absolute; top: 50%; transform: translateY(-50%);
  width: 46px; height: 46px; border: 1px solid rgba(255,255,255,0.22); border-radius: 50%;
  color: #fff; font-size: 22px; background: rgba(0,0,0,0.35); backdrop-filter: blur(6px);
}
.viewer__nav--prev { left: 18px; }
.viewer__nav--next { right: 18px; }
.viewer__info {
  position: absolute; left: 24px; bottom: 24px; max-width: 420px;
  padding: 20px 22px; border: 1px solid rgba(255,255,255,0.14); border-radius: 6px;
  background: rgba(5,6,10,0.62); backdrop-filter: blur(10px);
  transition: opacity 0.3s, transform 0.3s;
}
.viewer__info.is-hidden { opacity: 0; transform: translateY(12px); pointer-events: none; }
.viewer__no { font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em; color: var(--accent); }
.viewer__title { font-family: var(--serif); font-size: 24px; font-weight: 500; margin-top: 8px; }
.viewer__medium { font-family: var(--mono); font-size: 9.5px; color: var(--ink-dim); margin-top: 8px; letter-spacing: 0.05em; }
.viewer__note { font-size: 12.5px; line-height: 1.8; color: var(--ink); opacity: 0.85; margin-top: 12px; }
.viewer__hint { font-size: 11px; color: var(--accent); margin-top: 12px; }
.viewer__error {
  position: absolute; inset: 0; display: flex; flex-direction: column; gap: 18px;
  align-items: center; justify-content: center; color: var(--ink-dim); font-size: 14px;
}
.viewer__error button { border: 1px solid var(--line); padding: 10px 24px; border-radius: 3px; }

/* ---- 반응형 ---- */
@media (max-width: 640px) {
  .topnav { display: none; }
  .viewer__info { left: 12px; right: 12px; bottom: 12px; max-width: none; padding: 14px 16px; }
  .viewer__note { display: none; }
  .viewer__nav { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .card, .card::before, .hero__enter { transition: none; }
}
```

- [ ] **Step 3: 서빙 후 브라우저 확인**

```bash
cd /home/ec2-user/media-art2 && python3 -m http.server 8080 &
```

Playwright MCP로 `http://localhost:8080` 접속 → 스크린샷: 히어로 타이틀 "Masterpieces Reborn" 표시, 콘솔에 404 외 에러 없음(main.js 404는 아직 정상).

- [ ] **Step 4: 커밋**

```bash
git add index.html css/style.css
git commit -m "feat: 전시 셸 마크업/스타일 — 아트리움·뷰어 DOM 계약

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 작품 메타데이터 — js/data.js + 구조 테스트

**Files:**
- Create: `js/data.js`
- Test: `test/data.test.mjs`

**Interfaces:**
- Produces: `WINGS`(3관: `{id, index, name, sub, accent}`), `WORKS`(12작품: `{no, wing, title, ko, medium, year, note, hint, module, asset?}`), `wingOf(work)` 헬퍼. main.js(Task 5)와 모든 작품 태스크가 이 데이터에 의존.

- [ ] **Step 1: 실패하는 테스트 작성 — test/data.test.mjs**

```js
// test/data.test.mjs — data.js 구조 무결성
import { test } from "node:test";
import assert from "node:assert/strict";
import { WINGS, WORKS, wingOf } from "../js/data.js";

test("전시관은 3개이고 필수 필드를 가진다", () => {
  assert.equal(WINGS.length, 3);
  for (const w of WINGS) {
    for (const k of ["id", "index", "name", "sub", "accent"]) assert.ok(w[k], `${w.id}.${k}`);
    assert.match(w.accent, /^#[0-9a-f]{6}$/i);
  }
  assert.equal(new Set(WINGS.map(w => w.id)).size, 3);
});

test("작품은 12점이고 번호 01..12가 정확하다", () => {
  assert.equal(WORKS.length, 12);
  const nos = WORKS.map(w => w.no);
  assert.deepEqual(nos, Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")));
});

test("모든 작품이 필수 필드와 유효한 관/모듈 경로를 가진다", () => {
  const wingIds = new Set(WINGS.map(w => w.id));
  for (const w of WORKS) {
    for (const k of ["no", "wing", "title", "ko", "medium", "year", "note", "hint", "module"]) {
      assert.ok(w[k], `${w.no}.${k} 누락`);
    }
    assert.ok(wingIds.has(w.wing), `${w.no}: 관 ${w.wing} 없음`);
    assert.match(w.module, /^\.\/pieces\/\d{2}-[a-z0-9-]+\.js$/, `${w.no}: 모듈 경로 형식`);
    assert.equal(w.module.slice(9, 11), w.no, `${w.no}: 모듈 번호 불일치`);
    if (w.asset) assert.match(w.asset, /^assets\/targets\/\d{2}-[a-z0-9-]+\.jpg$/);
    assert.equal(typeof wingOf(w), "object");
  }
});

test("관별 작품 수는 4점씩이다", () => {
  for (const wing of WINGS) {
    assert.equal(WORKS.filter(w => w.wing === wing.id).length, 4, wing.id);
  }
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/data.test.mjs`
Expected: FAIL — `Cannot find module '../js/data.js'`

- [ ] **Step 3: js/data.js 작성**

```js
// js/data.js — 전시관·작품 메타데이터 (단일 소스)
export const WINGS = [
  { id: "wave",  index: "Ⅰ", name: "The Wave Hall",      sub: "파도의 방", accent: "#5aa7d8" },
  { id: "light", index: "Ⅱ", name: "Light & Atmosphere", sub: "빛의 방",   accent: "#e8b46a" },
  { id: "dream", index: "Ⅲ", name: "Form & Dream",       sub: "꿈의 방",   accent: "#b48ad8" },
];

export const WORKS = [
  // ---- Ⅰ관 · 파도의 방 — Hokusai 입자 기법 (응집 ↔ 흩어짐 ↔ 복원) ----
  {
    no: "01", wing: "wave", title: "After Hokusai — Great Wave", ko: "가나가와 해변의 높은 파도",
    medium: "Particle fluid · after Hokusai (c.1831, public domain)", year: "2026",
    note: "호쿠사이의 파도가 수천 개의 물 입자로 다시 태어난다. 갈고리 같은 물보라는 주기적으로 스스로 부서져 포말로 흩어지고, 후지산은 그 너머에서 미동도 없다. 손으로 휘저으면 파도는 무너졌다가 — 다시 그 불멸의 형상으로 되돌아온다.",
    hint: "드래그로 물을 휘저으세요 · 클릭으로 물보라 · 파도는 스스로도 부서집니다",
    module: "./pieces/01-great-wave.js", asset: "assets/targets/01-great-wave.jpg",
  },
  {
    no: "02", wing: "wave", title: "After Botticelli — Birth of Venus", ko: "비너스의 탄생",
    medium: "Sea-foam particles · after Botticelli (c.1485, public domain)", year: "2026",
    note: "보티첼리의 비너스가 바다 거품으로 빚어진다. 서풍의 신이 그랬듯 당신의 드래그가 바람이 되어 여신의 머리칼과 옷자락을 흩날리고, 장미 꽃잎이 화면을 가로지른다. 바람이 멎으면 거품은 다시 여신의 형상으로 피어오른다.",
    hint: "드래그로 바람을 일으키세요 · 클릭으로 돌풍",
    module: "./pieces/02-birth-of-venus.js", asset: "assets/targets/02-birth-of-venus.jpg",
  },
  {
    no: "03", wing: "wave", title: "After Vermeer — Girl with a Pearl Earring", ko: "진주 귀걸이를 한 소녀",
    medium: "Light-dust particles · after Vermeer (c.1665, public domain)", year: "2026",
    note: "페르메이르의 소녀가 어둠 속 빛 먼지로 나타난다. 촛불 바람에 먼지가 흩날려도 소녀는 언제나 되돌아오는데 — 진주만은 늘 마지막에, 가장 밝게 돌아온다. 어둠이 깊을수록 빛나는 단 하나의 점.",
    hint: "드래그로 빛 먼지를 흩으세요 · 클릭으로 촛불 깜빡임",
    module: "./pieces/03-pearl-earring.js", asset: "assets/targets/03-pearl-earring.jpg",
  },
  {
    no: "04", wing: "wave", title: "After Leonardo — Mona Lisa", ko: "모나리자",
    medium: "Sfumato smoke particles · after Leonardo (c.1503, public domain)", year: "2026",
    note: "레오나르도의 스푸마토 — '연기처럼 사라지는' 기법 그대로, 모나리자가 안개 입자로 흩어지고 응결된다. 휘저으면 초상은 갈색 연무가 되고, 안개가 걷히며 얼굴이 돌아올 때 그 미소는 언제나 가장 늦게 완성된다.",
    hint: "드래그로 안개를 휘저으세요 · 클릭으로 흩뜨리기 · 미소를 기다리세요",
    module: "./pieces/04-mona-lisa.js", asset: "assets/targets/04-mona-lisa.jpg",
  },

  // ---- Ⅱ관 · 빛의 방 — 빛과 대기의 재해석 ----
  {
    no: "05", wing: "light", title: "After Monet — Impression, Sunrise", ko: "인상, 해돋이",
    medium: "Living seascape · after Monet (1872, public domain)", year: "2026",
    note: "인상주의라는 이름을 낳은 르아브르의 새벽이 실시간으로 다시 밝아온다. 주황 태양이 고동치고, 부서진 반사광이 수면 위에서 명멸하며, 조각배는 안개 속을 느리게 지난다. 물결을 만지면 빛의 인상이 번져나간다.",
    hint: "수면을 드래그해 물결을 만드세요 · 클릭으로 큰 파문",
    module: "./pieces/05-impression-sunrise.js",
  },
  {
    no: "06", wing: "light", title: "After Rembrandt — The Night Watch", ko: "야경",
    medium: "Lantern chiaroscuro · after Rembrandt (1642, public domain)", year: "2026",
    note: "렘브란트의 대작이 온전한 어둠에 잠겨 있다. 당신의 커서가 등불이 되어 어둠을 밝히면, 빛이 닿는 자리에서만 대원들의 얼굴이 떠오른다. 등불이 지나간 자리엔 잔광이 머물다 스러진다 — 빛과 어둠의 화가에게 바치는 오마주.",
    hint: "커서로 어둠을 비추세요 · 클릭으로 화약 섬광",
    module: "./pieces/06-night-watch.js", asset: "assets/targets/06-night-watch.jpg",
  },
  {
    no: "07", wing: "light", title: "After Van Gogh — Sunflowers", ko: "해바라기",
    medium: "Impasto bloom cycle · after Van Gogh (1888, public domain)", year: "2026",
    note: "반 고흐가 아를의 노란 집에서 그린 해바라기들이 임파스토 붓질로 피어난다. 꽃들은 저마다의 속도로 피고 시들기를 반복하고 — 시든 꽃을 클릭하면 다시 만개하며 꽃가루를 터뜨린다. 생명과 소멸을 오가는 노랑의 순환.",
    hint: "꽃을 클릭해 피워보세요 · 드래그로 붓바람",
    module: "./pieces/07-sunflowers.js",
  },
  {
    no: "08", wing: "light", title: "After Turner — Rain, Steam and Speed", ko: "비, 증기, 속도",
    medium: "Vapor flow field · after Turner (1844, public domain)", year: "2026",
    note: "터너의 금빛 폭풍 속에서 증기기관차가 다가온다. 안개와 비와 증기가 한 덩어리의 유동장이 되어 소용돌이치고, 기차는 소실점에서부터 화실의 불꽃을 키우며 끝없이 달려온다. 산업 시대의 속도를 그린 최초의 그림, 그 속도 그대로.",
    hint: "드래그로 안개를 휘저으세요 · 클릭으로 기적 소리 없는 증기",
    module: "./pieces/08-rain-steam-speed.js",
  },

  // ---- Ⅲ관 · 꿈의 방 — 형태와 상상 ----
  {
    no: "09", wing: "dream", title: "After Michelangelo — Creation of Adam", ko: "아담의 창조",
    medium: "Spark of life · after Michelangelo (c.1512, public domain)", year: "2026",
    note: "시스티나 천장화에서 가장 유명한 4센티미터 — 닿을 듯 닿지 않는 두 손끝의 간극. 커서를 그 사이에 가져가면 정전기가 일고, 간극을 이어주면 생명의 불꽃이 방전된다. 신이 아담에게 건넨 그 순간을, 당신의 손으로.",
    hint: "두 손끝 사이에 커서를 · 간극을 이으면 불꽃이 튑니다",
    module: "./pieces/09-creation-of-adam.js", asset: "assets/targets/09-creation-of-adam.jpg",
  },
  {
    no: "10", wing: "dream", title: "After Bruegel — Tower of Babel", ko: "바벨탑",
    medium: "Endless construction · after Bruegel (1563, public domain)", year: "2026",
    note: "브뤼헐의 바벨탑은 완성되지 못할 것을 알면서도 쌓아 올려진다. 벽돌은 저절로 한 장씩 놓이고, 당신은 클릭으로 건설을 거들 수도, 길게 눌러 무너뜨릴 수도 있다. 무너진 자리에서도 건설은 계속된다 — 인간의 끝없는 오만과 열망.",
    hint: "클릭으로 벽돌을 쌓으세요 · 길게 누르면 무너집니다",
    module: "./pieces/10-tower-of-babel.js",
  },
  {
    no: "11", wing: "dream", title: "After Kandinsky — Composition VIII", ko: "구성 8",
    medium: "Geometric orchestra · WebAudio · after Kandinsky (1923, public domain)", year: "2026",
    note: "칸딘스키는 색과 형태에서 소리를 들었다. 크림색 캔버스 위 원과 삼각형과 선들이 느리게 부유하다가, 손끝이 닿으면 저마다의 음색으로 울린다 — 원은 부드럽게, 삼각형은 날카롭게. 그림이 악보가 되는 공감각의 방.",
    hint: "도형을 클릭해 연주하세요 · 우상단 사운드를 켜면 소리가 납니다",
    module: "./pieces/11-composition-viii.js",
  },
  {
    no: "12", wing: "dream", title: "After Hiroshige — Sudden Shower", ko: "신오하시 다리의 소나기",
    medium: "Ukiyo-e rainfall · after Hiroshige (1857, public domain)", year: "2026",
    note: "히로시게의 소나기 — 판화에 새겨진 곧은 빗줄기가 실제로 쏟아진다. 커서를 옮기면 종이 우산이 따라와 비를 가려주고, 우산 가장자리에서 빗방울이 튄다. 반 고흐가 유화로 베껴 그렸던 바로 그 비를, 이제는 손끝으로 긋는다.",
    hint: "커서가 우산이 됩니다 · 클릭으로 폭우 토글",
    module: "./pieces/12-sudden-shower.js", asset: "assets/targets/12-sudden-shower.jpg",
  },
];

export const wingOf = (work) => WINGS.find((w) => w.id === work.wing);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/data.test.mjs`
Expected: PASS — 4 tests

- [ ] **Step 5: 커밋**

```bash
git add js/data.js test/data.test.mjs
git commit -m "feat: 12작품/3전시관 메타데이터 + 구조 무결성 테스트

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 원작 타깃 이미지 다운로드 — tools/fetch-targets.sh

**Files:**
- Create: `tools/fetch-targets.sh`
- Create: `assets/targets/*.jpg` (7개, 스크립트 실행 결과)

**Interfaces:**
- Produces: `assets/targets/{01-great-wave,02-birth-of-venus,03-pearl-earring,04-mona-lisa}.jpg`(256px, 입자 샘플링용), `assets/targets/{06-night-watch,09-creation-of-adam,12-sudden-shower}.jpg`(1024px, 화면 표시용). data.js의 asset 경로와 파일명 일치 필수.

- [ ] **Step 1: tools/fetch-targets.sh 작성**

```bash
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
fetch 12-sudden-shower.jpg   1024 "Hiroshige_-_Evening_Shower_at_Atake_and_the_Great_Bridge.jpg"

echo "완료: $(ls assets/targets/*.jpg | wc -l)/7"
```

- [ ] **Step 2: 실행 및 검증**

```bash
chmod +x tools/fetch-targets.sh && ./tools/fetch-targets.sh
ls -la assets/targets/
```

Expected: `완료: 7/7`, 파일 7개 각각 10KB~400KB. 429 등으로 일부 실패 시 60초 후 재실행(이미 받은 파일은 스킵하도록 재실행 전 확인). **전부 실패해도 계획은 계속 진행 가능** — 모든 작품에 절차적 폴백이 있음(전역 제약). 단, 실패 파일은 data.js에서 해당 asset 필드를 제거하고 커밋 메시지에 명시.

- [ ] **Step 3: 커밋**

```bash
git add tools/fetch-targets.sh assets/targets/
git commit -m "feat: 원작 타깃 이미지 7점 로컬 번들 (Wikimedia Commons PD)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 입자 엔진 — js/particle-engine.js + 수학 테스트

**Files:**
- Create: `js/particle-engine.js`
- Test: `test/particle-engine.test.mjs`

**Interfaces:**
- Produces: `containFit(iw,ih,w,h,margin)`, `samplePoints(image,{count,alphaMin})`, `stepParticle(p,dt,spring,damping)`, `class ParticleField`. Ⅰ관 작품 4개(Task 6~9)가 `ParticleField`를 소비. API는 아래 코드가 정본 — 시그니처 변경 금지.
- 주의: `samplePoints`는 `document`를 사용하므로 브라우저 전용. 모듈 임포트 시점에는 DOM을 건드리지 않아 Node 테스트에서 `containFit`/`stepParticle`/`ParticleField`(points 모드)를 검증할 수 있다.

- [ ] **Step 1: 실패하는 테스트 작성 — test/particle-engine.test.mjs**

```js
// test/particle-engine.test.mjs — 엔진 순수 로직 검증 (DOM 불필요 부분만)
import { test } from "node:test";
import assert from "node:assert/strict";
import { containFit, stepParticle, ParticleField } from "../js/particle-engine.js";

test("containFit: 종횡비 유지 + 여백 + 중앙 정렬", () => {
  // 정사각 이미지를 1000x500 화면에 margin 0.1로 → 세로가 제약: 박스 400x400
  const f = containFit(100, 100, 1000, 500, 0.1);
  assert.equal(Math.round(f.w), 400);
  assert.equal(Math.round(f.h), 400);
  assert.equal(Math.round(f.x), 300); // (1000-400)/2
  assert.equal(Math.round(f.y), 50);  // (500-400)/2
});

test("stepParticle: 목표로 수렴하고 감쇠가 진동을 잦아들게 한다", () => {
  const p = { x: 0, y: 0, vx: 0, vy: 0, tx: 100, ty: 50 };
  for (let i = 0; i < 600; i++) stepParticle(p, 1 / 60, 22, 7);
  assert.ok(Math.abs(p.tx - p.x) < 1, `x 수렴 실패: ${p.x}`);
  assert.ok(Math.abs(p.ty - p.y) < 1, `y 수렴 실패: ${p.y}`);
});

test("stepParticle: 입자별 spring 오버라이드가 우선한다", () => {
  const slow = { x: 0, y: 0, vx: 0, vy: 0, tx: 100, ty: 0, spring: 2 };
  const fast = { x: 0, y: 0, vx: 0, vy: 0, tx: 100, ty: 0 };
  for (let i = 0; i < 30; i++) { stepParticle(slow, 1/60, 22, 7); stepParticle(fast, 1/60, 22, 7); }
  assert.ok(fast.x > slow.x, "기본 spring(22)이 오버라이드(2)보다 빨라야 함");
});

test("ParticleField(points 모드): 생성·스텝·산란·리사이즈가 동작한다", () => {
  const points = Array.from({ length: 200 }, (_, i) => ({
    u: (i % 20) / 20, v: Math.floor(i / 20) / 10, r: 200, g: 100, b: 50,
  }));
  const f = new ParticleField({ points, aspect: 1, count: 200, w: 800, h: 600 });
  assert.equal(f.particles.length, 200);
  for (let i = 0; i < 400; i++) f.step(1 / 60);
  const avg = f.particles.reduce((s, p) => s + Math.hypot(p.tx - p.x, p.ty - p.y), 0) / 200;
  assert.ok(avg < 2, `응집 실패: 평균 거리 ${avg}`);

  // 산란: 중심 근처 입자들이 밀려남
  f.scatter(400, 300, 300, 900);
  f.step(1 / 60);
  const avgAfter = f.particles.reduce((s, p) => s + Math.hypot(p.tx - p.x, p.ty - p.y), 0) / 200;
  assert.ok(avgAfter > avg, "scatter 후 평균 목표거리가 커져야 함");

  // 리사이즈: 목표가 새 박스 안으로
  f.resize(400, 400);
  for (const p of f.particles) {
    assert.ok(p.tx >= 0 && p.tx <= 400 && p.ty >= 0 && p.ty <= 400);
  }
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/particle-engine.test.mjs`
Expected: FAIL — `Cannot find module '../js/particle-engine.js'`

- [ ] **Step 3: js/particle-engine.js 작성**

```js
// js/particle-engine.js — Ⅰ관 공용 입자 엔진
// 원작 이미지 픽셀을 목표 좌표로 샘플링하고 스프링 복원력으로
// "응집 ↔ 흩어짐 ↔ 복원"을 만든다. 렌더링은 각 작품이 담당.

// 종횡비를 유지하며 (w,h) 안에 margin 비율 여백을 두고 중앙 배치한 박스
export function containFit(iw, ih, w, h, margin = 0.08) {
  const availW = w * (1 - margin * 2);
  const availH = h * (1 - margin * 2);
  const s = Math.min(availW / iw, availH / ih);
  const bw = iw * s, bh = ih * s;
  return { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh };
}

// 이미지 → 목표점 샘플링. {u,v}는 이미지 박스 내 0..1 정규화 좌표 (브라우저 전용)
export function samplePoints(image, { count = 6000, alphaMin = 8 } = {}) {
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const c = document.createElement("canvas");
  c.width = iw; c.height = ih;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(image, 0, 0);
  const data = g.getImageData(0, 0, iw, ih).data;
  const pts = [];
  const step = Math.max(1, Math.sqrt((iw * ih) / count)); // count개가 나오는 격자 간격
  for (let y = 0; y < ih; y += step) {
    for (let x = 0; x < iw; x += step) {
      const xi = Math.min(iw - 1, (x + Math.random() * step) | 0); // 지터로 격자 무늬 방지
      const yi = Math.min(ih - 1, (y + Math.random() * step) | 0);
      const i = (yi * iw + xi) * 4;
      if (data[i + 3] < alphaMin) continue;
      pts.push({ u: xi / iw, v: yi / ih, r: data[i], g: data[i + 1], b: data[i + 2] });
    }
  }
  return pts;
}

// 스프링 적분 한 스텝. p.spring이 있으면 전역 spring 대신 사용
export function stepParticle(p, dt, spring, damping) {
  const k = p.spring !== undefined ? p.spring : spring;
  p.vx += (p.tx - p.x) * k * dt;
  p.vy += (p.ty - p.y) * k * dt;
  const d = Math.max(0, 1 - damping * dt);
  p.vx *= d;
  p.vy *= d;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
}

export class ParticleField {
  // image 또는 points({u,v,r,g,b}[]) 중 하나 필수. points 사용 시 aspect(가상 박스 w/h) 지정
  constructor({ image = null, points = null, aspect = 0.75, count = 6000,
                w, h, margin = 0.08, spring = 22, damping = 7, jitter = 6,
                sizeMin = 1, sizeMax = 2.2 } = {}) {
    this.spring = spring;
    this.damping = damping;
    this.jitter = jitter;
    this.margin = margin;
    // 화면 크기에 따라 입자 수 자동 감축 (모바일 보호)
    const cap = Math.max(400, Math.min(count, Math.floor((w * h) / 110)));
    let pts;
    if (image) {
      this.aspect = (image.naturalWidth || image.width) / (image.naturalHeight || image.height);
      pts = samplePoints(image, { count: cap });
    } else {
      this.aspect = aspect;
      pts = points.slice(0, cap);
    }
    // 입자는 화면 전역 무작위 위치에서 태어나 목표로 모여든다 (오프닝 응집 연출)
    this.particles = pts.map((q) => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: 0, vy: 0, tx: 0, ty: 0,
      u: q.u, v: q.v, r: q.r, g: q.g, b: q.b,
      size: sizeMin + Math.random() * (sizeMax - sizeMin),
    }));
    this.resize(w, h);
  }

  resize(w, h) {
    this.w = w; this.h = h;
    // 가상 이미지 크기(aspect 유지)를 contain-fit 후 u,v → 픽셀 목표 좌표
    const fit = containFit(this.aspect, 1, w, h, this.margin);
    this.fit = fit;
    for (const p of this.particles) {
      p.tx = fit.x + p.u * fit.w;
      p.ty = fit.y + p.v * fit.h;
    }
  }

  // 방사형 밀치기 — 드래그/클릭 교란
  scatter(cx, cy, radius, strength) {
    const r2 = radius * radius;
    for (const p of this.particles) {
      const dx = p.x - cx, dy = p.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2 || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const f = (1 - d / radius) * strength;
      p.vx += (dx / d) * f;
      p.vy += (dy / d) * f;
    }
  }

  // 소용돌이 — 접선 방향 밀기
  swirl(cx, cy, radius, strength) {
    const r2 = radius * radius;
    for (const p of this.particles) {
      const dx = p.x - cx, dy = p.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2 || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const f = (1 - d / radius) * strength;
      p.vx += (-dy / d) * f;
      p.vy += (dx / d) * f;
    }
  }

  step(dt) {
    const j = this.jitter;
    for (const p of this.particles) {
      stepParticle(p, dt, this.spring, this.damping);
      if (j > 0) { // 유휴 상태에서도 미세하게 살아있는 떨림
        p.x += (Math.random() - 0.5) * j * dt;
        p.y += (Math.random() - 0.5) * j * dt;
      }
    }
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/particle-engine.test.mjs`
Expected: PASS — 4 tests. (jitter 기본값 6이 수렴 판정(<2px)을 방해하지 않음 — 60fps에서 프레임당 최대 0.05px)

- [ ] **Step 5: 커밋**

```bash
git add js/particle-engine.js test/particle-engine.test.mjs
git commit -m "feat: 입자 엔진 — 샘플링·스프링 적분·산란/소용돌이·contain-fit

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 전시 셸 로직 — js/main.js

**Files:**
- Create: `js/main.js`

**Interfaces:**
- Consumes: `WINGS, WORKS, wingOf`(Task 2), Task 1의 DOM 계약.
- Produces: 작품 모듈 구동 규약 — 동적 `import(work.module)` 후 `piece.init({canvas, ctx, width, height, assets, reducedMotion, audio})` → 매 프레임 `piece.tick(dt, pointer)` → `piece.resize(w,h)` / `piece.dispose()`. **pointer 객체 형태와 규약이 모든 작품 태스크(6~17)의 전제.**

- [ ] **Step 1: js/main.js 작성**

```js
// js/main.js — 전시 셸: 아트리움 렌더, 뷰어, rAF 루프, 포인터 규약
import { WINGS, WORKS, wingOf } from "./data.js";

const $ = (sel) => document.querySelector(sel);
const body = document.body;
const canvas = $("#stage");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- 사운드 전역 토글 (작품엔 getter만 전달) ----------
let soundOn = false;
$(".sound-toggle").addEventListener("click", (e) => {
  soundOn = !soundOn;
  e.currentTarget.setAttribute("aria-pressed", String(soundOn));
});

// ---------- 아트리움 렌더 ----------
function renderAtrium() {
  const nav = $(".topnav");
  const wingsEl = $("#wings");
  for (const wing of WINGS) {
    const link = document.createElement("button");
    link.className = "topnav__link";
    link.textContent = `${wing.index}. ${wing.sub}`;
    link.addEventListener("click", () => $(`#wing-${wing.id}`).scrollIntoView());
    nav.appendChild(link);

    const sec = document.createElement("section");
    sec.className = "wing";
    sec.id = `wing-${wing.id}`;
    sec.style.setProperty("--wing-accent", wing.accent);
    sec.innerHTML = `
      <div class="wing__head">
        <span class="wing__index">${wing.index}</span>
        <h2 class="wing__name">${wing.name}</h2>
        <span class="wing__sub">${wing.sub}</span>
      </div>
      <div class="wing__works"></div>`;
    const grid = sec.querySelector(".wing__works");
    for (const work of WORKS.filter((w) => w.wing === wing.id)) {
      const card = document.createElement("button");
      card.className = "card";
      card.innerHTML = `
        <span class="card__no">No. ${work.no}</span>
        <h3 class="card__title">${work.title}</h3>
        <p class="card__ko">${work.ko}</p>
        <p class="card__medium">${work.medium}</p>`;
      card.addEventListener("click", () => openWork(WORKS.indexOf(work)));
      grid.appendChild(card);
    }
    wingsEl.appendChild(sec);
  }
}
renderAtrium();
$(".hero__enter").addEventListener("click", () => $("#wings").scrollIntoView());
$(".brand").addEventListener("click", closeWork);

// ---------- 포인터 규약 ----------
// 이벤트는 원시 상태만 기록, 프레임마다 스냅샷을 tick에 전달
const raw = { x: -1e4, y: -1e4, down: false, inside: false, pendingDown: false, pendingUp: false };
const pointer = { x: -1e4, y: -1e4, px: -1e4, py: -1e4, dx: 0, dy: 0,
                  down: false, justDown: false, justUp: false, downTime: 0, inside: false };
canvas.addEventListener("pointermove", (e) => { raw.x = e.clientX; raw.y = e.clientY; raw.inside = true; });
canvas.addEventListener("pointerdown", (e) => {
  raw.x = e.clientX; raw.y = e.clientY; raw.down = true; raw.pendingDown = true;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointerup", () => { raw.down = false; raw.pendingUp = true; });
canvas.addEventListener("pointerleave", () => { raw.inside = false; });

function snapshotPointer(dt) {
  pointer.px = pointer.x; pointer.py = pointer.y;
  pointer.x = raw.x; pointer.y = raw.y;
  pointer.dx = pointer.px < -9e3 ? 0 : pointer.x - pointer.px;
  pointer.dy = pointer.py < -9e3 ? 0 : pointer.y - pointer.py;
  pointer.justDown = raw.pendingDown; raw.pendingDown = false;
  pointer.justUp = raw.pendingUp; raw.pendingUp = false;
  pointer.down = raw.down;
  pointer.inside = raw.inside;
  pointer.downTime = pointer.down ? pointer.downTime + dt : 0;
}

// ---------- 뷰어 ----------
let piece = null;      // 현재 작품 모듈의 default export
let current = -1;      // WORKS 인덱스
let rafId = 0;
let lastT = 0;
let ctx = null;

function sizeCanvas() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = innerWidth, h = innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 이후 모든 좌표는 CSS px
  return { w, h };
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // 실패 시 null → 작품이 절차적 폴백
    img.src = src;
  });
}

async function openWork(idx) {
  await closeWork();
  current = idx;
  const work = WORKS[idx];
  const wing = wingOf(work);
  body.dataset.view = "viewer";
  document.documentElement.style.setProperty("--accent", wing.accent);
  $("#v-no").textContent = `No. ${work.no}`;
  $("#v-wing").textContent = `${wing.index} · ${wing.sub}`;
  $("#v-title").textContent = work.title;
  $("#v-medium").textContent = work.medium;
  $("#v-note").textContent = work.note;
  $("#v-hint").textContent = work.hint;
  $("#v-error").hidden = true;

  const { w, h } = sizeCanvas();
  try {
    const [mod, target] = await Promise.all([import(work.module), loadImage(work.asset)]);
    if (current !== idx) return; // 로딩 중 다른 작품으로 이동함
    piece = mod.default;
    piece.init({ canvas, ctx, width: w, height: h,
                 assets: { target }, reducedMotion,
                 audio: { enabled: () => soundOn } });
    lastT = performance.now();
    pointer.downTime = 0;
    rafId = requestAnimationFrame(frame);
  } catch (err) {
    console.error(`작품 로드 실패: ${work.module}`, err);
    piece = null;
    $("#v-error").hidden = false;
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); // 탭 복귀 시 폭주 방지 캡
  lastT = now;
  snapshotPointer(dt);
  piece.tick(dt, pointer);
  rafId = requestAnimationFrame(frame);
}

async function closeWork() {
  cancelAnimationFrame(rafId);
  rafId = 0;
  if (piece) { try { piece.dispose(); } catch (e) { console.error(e); } }
  piece = null;
  current = -1;
  body.dataset.view = "atrium";
}

function step(dir) {
  if (current < 0) return;
  openWork((current + dir + WORKS.length) % WORKS.length);
}

// ---------- 뷰어 컨트롤 ----------
$(".viewer__close").addEventListener("click", closeWork);
$("#v-error button").addEventListener("click", closeWork);
$(".viewer__nav--prev").addEventListener("click", () => step(-1));
$(".viewer__nav--next").addEventListener("click", () => step(1));
$(".viewer__infotoggle").addEventListener("click", (e) => {
  const info = $(".viewer__info");
  const hidden = info.classList.toggle("is-hidden");
  e.currentTarget.setAttribute("aria-expanded", String(!hidden));
});
addEventListener("keydown", (e) => {
  if (body.dataset.view !== "viewer") return;
  if (e.key === "Escape") closeWork();
  else if (e.key === "ArrowLeft") step(-1);
  else if (e.key === "ArrowRight") step(1);
});
addEventListener("resize", () => {
  if (body.dataset.view !== "viewer" || !piece) return;
  const { w, h } = sizeCanvas();
  piece.resize(w, h);
});
```

- [ ] **Step 2: 문법 검증**

Run: `node --check js/main.js`
Expected: 출력 없음 (통과)

- [ ] **Step 3: 브라우저 검증 — 정상 경로 + 에러 경로**

로컬 서버 구동 상태에서 Playwright MCP로:
1. `http://localhost:8080` 접속 → 3개 관 섹션과 12개 카드가 렌더됨 (스크린샷)
2. 아무 카드나 클릭 → 작품 모듈이 아직 없으므로 **에러 패널("작품을 불러오지 못했습니다")이 표시됨** — 에러 경로가 의도대로 동작하는지 확인
3. "아트리움으로 돌아가기" 클릭 → 아트리움 복귀
4. 콘솔: 모듈 404 로그 외 예외 없음

- [ ] **Step 4: 커밋**

```bash
git add js/main.js
git commit -m "feat: 전시 셸 — 아트리움 렌더·뷰어·rAF/포인터 규약·에러 경로

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### 작품 태스크 공통 검증 절차 (Task 6~17에서 "브라우저 검증"은 아래를 뜻함)

1. `node --check js/pieces/NN-*.js` 통과
2. Playwright MCP: 아트리움에서 해당 카드 클릭 → 3초 대기 → 스크린샷 (형상이 그려져 있어야 함 — 검은 화면이면 실패)
3. 캔버스 중앙에서 드래그 시뮬레이션(`browser_drag` 또는 evaluate로 pointer 이벤트 디스패치) → 스크린샷 → 유휴 상태와 다른 화면인지 확인
4. 클릭 1회 → 반응 확인 → 5초 대기 → 복원/지속 상태 스크린샷
5. 콘솔 에러 0건
6. ✕ 닫기 → 아트리움 복귀 → 같은 작품 재진입 (dispose/재init 무결성)

---

### Task 6: 작품 01 — After Hokusai, Great Wave (앵커·레퍼런스)

**Files:**
- Create: `js/pieces/01-great-wave.js`

**Interfaces:**
- Consumes: `ParticleField`(Task 4), main.js 구동 규약(Task 5), `assets/targets/01-great-wave.jpg`(Task 3).
- Produces: 없음 (말단 작품 모듈). 단, 이 코드는 Ⅰ관 나머지 3작품의 스타일 레퍼런스.

- [ ] **Step 1: js/pieces/01-great-wave.js 작성**

```js
// js/pieces/01-great-wave.js — After Hokusai, Great Wave (c.1831)
// 수천 개의 물 입자가 파도의 형상으로 응집한다. 파도는 주기적으로 스스로
// 부서지고(포말 입자 서지), 손길에 흩어졌다가, 다시 불멸의 형상으로 돌아온다.
import { ParticleField } from "../particle-engine.js";

let W = 0, H = 0, ctx = null, T = 0, reduced = false;
let field = null;
let crashT = 0;              // 자가 붕괴 사이클 타이머
let crashFlash = 0;          // 부서진 직후 포말 발광 잔량 0..1
let foam = [];               // 포말(밝은 목표색) 입자 캐시
let crest = { x: 0, y: 0 };  // 파도 마루(포말 무게중심) — 서지 원점
const CYCLE = 14;            // 붕괴 주기(초)

// 이미지 없을 때: 파도 곡선 + 물보라 갈고리 + 후지산의 절차적 목표점
function fallbackPoints() {
  const pts = [];
  const push = (u, v, r, g, b) => pts.push({ u, v, r, g, b });
  // 큰 파도 몸통 — 왼쪽에서 치솟아 오른쪽으로 말리는 곡선 아래를 채움
  for (let i = 0; i < 2600; i++) {
    const u = Math.random() * 0.72;
    const crestV = 0.18 + 0.30 * Math.pow(u / 0.72, 1.6); // 마루 라인
    const v = crestV + Math.random() * (0.92 - crestV);
    const deep = (v - crestV) / (0.92 - crestV);
    push(u, v, 18 + deep * 20, 52 + deep * 30, 110 + deep * 40); // 프러시안 블루
  }
  // 물보라 갈고리 — 마루를 따라 흩뿌려진 포말
  for (let i = 0; i < 900; i++) {
    const u = Math.random() * 0.78;
    const crestV = 0.18 + 0.30 * Math.pow(Math.min(1, u / 0.72), 1.6);
    const v = crestV - Math.random() * 0.10;
    push(u, v, 225 + Math.random() * 30, 235 + Math.random() * 20, 245);
  }
  // 후지산 — 오른쪽 원경의 고요한 삼각형
  for (let i = 0; i < 500; i++) {
    const u = 0.62 + Math.random() * 0.26;
    const peak = Math.abs(u - 0.75) / 0.13;               // 0(정상)..1(기슭)
    const v = 0.42 + peak * 0.5 * 0.28 + Math.random() * 0.28 * (1 - peak * 0.4);
    const snow = v < 0.50;
    push(u, Math.min(0.9, v), snow ? 235 : 42, snow ? 240 : 58, snow ? 246 : 96);
  }
  return pts;
}

function isFoam(p) { return p.r + p.g + p.b > 560; } // 밝은 목표색 = 포말

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = opts.reducedMotion; T = 0; crashT = CYCLE * 0.6; crashFlash = 0;
    field = new ParticleField(
      opts.assets.target
        ? { image: opts.assets.target, count: 7000, w: W, h: H,
            spring: 20, damping: 6.5, jitter: reduced ? 2 : 7 }
        : { points: fallbackPoints(), aspect: 1.5, count: 7000, w: W, h: H,
            spring: 20, damping: 6.5, jitter: reduced ? 2 : 7 }
    );
    // 포말 입자: 살짝 크고, 복원이 느려 물거품처럼 늦게 가라앉는다
    foam = field.particles.filter(isFoam);
    for (const p of foam) { p.size *= 1.5; p.spring = 13; }
    this._updateCrest();
  },

  _updateCrest() { // 포말 무게중심(왼쪽 2/3 우선) = 파도 마루
    let sx = 0, sy = 0, n = 0;
    for (const p of foam) {
      if (p.tx > field.fit.x + field.fit.w * 0.7) continue; // 후지산 눈 제외
      sx += p.tx; sy += p.ty; n++;
    }
    crest.x = n ? sx / n : W * 0.35;
    crest.y = n ? sy / n : H * 0.35;
  },

  tick(dt, ptr) {
    T += dt;

    // ---- 자가 붕괴 사이클: 마루가 부풀었다가 포말이 서지로 터진다 ----
    crashT += dt;
    const pre = CYCLE - crashT; // 붕괴까지 남은 시간
    if (pre < 1 && pre > 0 && !reduced) {
      for (const p of foam) p.vy -= 26 * dt; // 붕괴 직전 1초: 마루가 치솟는 숨 고르기
    }
    if (crashT >= CYCLE) {
      crashT = 0; crashFlash = 1;
      const power = reduced ? 0.4 : 1;
      for (const p of foam) { // 갈고리 방향(오른쪽-아래)으로 무너져 내리는 서지
        p.vx += (60 + Math.random() * 180) * power;
        p.vy += (120 + Math.random() * 220) * power;
      }
      field.scatter(crest.x, crest.y, Math.min(W, H) * 0.33, 320 * power);
    }
    crashFlash = Math.max(0, crashFlash - dt * 0.5);

    // ---- 인터랙션: 드래그 = 소용돌이, 클릭 = 물보라 ----
    if (ptr.inside && ptr.down) {
      const speed = Math.hypot(ptr.dx, ptr.dy);
      field.swirl(ptr.x, ptr.y, 130 + speed * 3, 40 + speed * 22);
    }
    if (ptr.justDown) field.scatter(ptr.x, ptr.y, 150, reduced ? 200 : 420);

    field.step(dt);

    // ---- 렌더 ----
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0b1626");
    bg.addColorStop(0.55, "#0d1b30");
    bg.addColorStop(1, "#050a14");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const glow = crashFlash * crashFlash; // 붕괴 직후 포말 발광
    for (const p of field.particles) {
      const f = isFoam(p);
      const a = f ? 0.95 : 0.8;
      ctx.fillStyle = f && glow > 0.02
        ? `rgba(255,255,255,${Math.min(1, a + glow * 0.5)})`
        : `rgba(${p.r},${p.g},${p.b},${a})`;
      const s = p.size * (f && glow > 0.02 ? 1 + glow * 0.8 : 1);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }

    // 수면 위 안개 한 겹 — 원작의 옅은 하늘빛
    ctx.fillStyle = "rgba(190,205,220,0.03)";
    ctx.fillRect(0, H * 0.12, W, H * 0.1);
  },

  resize(w, h) { W = w; H = h; field.resize(w, h); this._updateCrest(); },
  dispose() { ctx = null; field = null; foam = []; },
};
```

- [ ] **Step 2: 브라우저 검증** — 공통 검증 절차 수행. 추가 확인: 14초 대기 시 파도가 스스로 부서지는 서지 발생.

- [ ] **Step 3: 커밋**

```bash
git add js/pieces/01-great-wave.js
git commit -m "feat: 작품 01 — After Hokusai, Great Wave (입자 파도·자가 붕괴 사이클)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 작품 02 — After Botticelli, Birth of Venus

**Files:**
- Create: `js/pieces/02-birth-of-venus.js`

**Interfaces:**
- Consumes: `ParticleField`(Task 4), main.js 구동 규약(Task 5), `assets/targets/02-birth-of-venus.jpg`(Task 3).
- Produces: 없음 (말단 작품 모듈).

- [ ] **Step 1: js/pieces/02-birth-of-venus.js 작성**

```js
// js/pieces/02-birth-of-venus.js
// After Botticelli — Birth of Venus (c.1485)
// 입자가 원작(또는 절차적 조개껍질+여신 실루엣)으로 응집하고,
// 드래그=방향성 바람, 클릭=돌풍, 유휴=수평 바람 사인파 + 장미 꽃잎으로 반응한다.
import { ParticleField } from "../particle-engine.js";

const TAU = Math.PI * 2;
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

let W = 0, H = 0, ctx = null, T = 0, reduced = false;
let field = null;
let petals = [];
let petalTimer = 3.5;
let bgGrad = null;

/* ---------- 절차적 폴백: 조개껍질 + 여신 실루엣 points ---------- */
// 목표색: 살구/크림 피부, 금빛 머리칼, 크림·분홍 조개. u,v는 0..1 정규화.
function skinCol() {
  const n = (Math.random() - 0.5) * 18;
  return [clamp(241 + n), clamp(207 + n), clamp(178 + n)];
}
function hairCol() {
  if (Math.random() < 0.28) { // 금빛 하이라이트
    const n = (Math.random() - 0.5) * 20;
    return [clamp(226 + n), clamp(188 + n), clamp(126 + n)];
  }
  const n = (Math.random() - 0.5) * 24;
  return [clamp(194 + n), clamp(148 + n), clamp(84 + n)];
}
// 타원 내부 균일 샘플 → points 누적
function pushBlob(arr, cx, cy, rx, ry, n, colFn) {
  for (let i = 0; i < n; i++) {
    const t = Math.random() * TAU;
    const rr = Math.sqrt(Math.random());
    const u = cx + Math.cos(t) * rx * rr;
    const v = cy + Math.sin(t) * ry * rr;
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    const c = colFn();
    arr.push({ u, v, r: c[0], g: c[1], b: c[2] });
  }
}
function buildFallbackPoints() {
  const pts = [];
  // 여신 몸 (살구/크림) — 머리·목·상체·엉덩이·다리·팔
  pushBlob(pts, 0.500, 0.130, 0.052, 0.072, 220, skinCol); // 머리
  pushBlob(pts, 0.500, 0.215, 0.026, 0.032, 70, skinCol);  // 목
  pushBlob(pts, 0.490, 0.360, 0.088, 0.135, 460, skinCol); // 상체
  pushBlob(pts, 0.500, 0.520, 0.078, 0.105, 360, skinCol); // 엉덩이
  pushBlob(pts, 0.505, 0.680, 0.056, 0.135, 320, skinCol); // 다리
  pushBlob(pts, 0.415, 0.400, 0.030, 0.105, 150, skinCol); // 왼팔(가슴 가림)
  pushBlob(pts, 0.585, 0.440, 0.028, 0.120, 150, skinCol); // 오른팔(내림)
  // 머리칼 (금빛) — 정수리 + 오른쪽으로 흘러내리는 곱슬
  pushBlob(pts, 0.500, 0.095, 0.075, 0.050, 150, hairCol);
  pushBlob(pts, 0.605, 0.240, 0.045, 0.090, 170, hairCol);
  pushBlob(pts, 0.635, 0.400, 0.045, 0.110, 200, hairCol);
  pushBlob(pts, 0.615, 0.550, 0.040, 0.090, 150, hairCol);
  pushBlob(pts, 0.420, 0.200, 0.028, 0.060, 70, hairCol);  // 왼쪽 잔머리
  // 조개껍질 (크림/분홍 부채꼴) — 발 아래, 방사형 능선
  for (let i = 0; i < 760; i++) {
    const rr = Math.sqrt(Math.random());
    const ang = Math.random() * Math.PI;
    const u = 0.5 + Math.cos(ang) * (0.02 + rr * 0.30);
    const v = 0.80 + Math.sin(ang) * (rr * 0.165);
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    const rib = 0.5 + 0.5 * Math.sin(ang * 9); // 방사형 능선 음영
    const n = (Math.random() - 0.5) * 12;
    pts.push({
      u, v,
      r: clamp(242 + n - rib * 6),
      g: clamp(224 + n - rib * 20),
      b: clamp(202 + n - rib * 6),
    });
  }
  return pts;
}

/* ---------- 입자별 스프링 튜닝 ---------- */
// 밝은(살구/크림) 입자는 spring 낮게 → 여신의 몸이 가장 늦게 완성되는 연출.
function tuneSprings() {
  const ps = field.particles;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const lum = p.r * 0.299 + p.g * 0.587 + p.b * 0.114;
    p.spring = lum > 175 ? 2.3 : 4.4;
  }
}

/* ---------- 배경: 바다-하늘 파스텔 그라데이션 ---------- */
function buildBg() {
  bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0.0, "#d7e9e1"); // 연청록 하늘
  bgGrad.addColorStop(0.5, "#e8ecdf");
  bgGrad.addColorStop(1.0, "#f5ecd9"); // 크림 바다거품
}

/* ---------- 장미 꽃잎 (연분홍 삼각형) ---------- */
function spawnBurst() {
  const n = 8 + (Math.random() * 5 | 0); // 8~12개
  const fromLeft = Math.random() < 0.5;
  const dir = fromLeft ? 1 : -1;
  for (let i = 0; i < n; i++) {
    petals.push({
      x: fromLeft ? -20 - Math.random() * 80 : W + 20 + Math.random() * 80,
      y: H * (0.08 + Math.random() * 0.7),
      vx: dir * (34 + Math.random() * 46),
      vy: (Math.random() - 0.5) * 22,
      rot: Math.random() * TAU,
      vr: (Math.random() - 0.5) * 3.2,
      size: 6 + Math.random() * 6,
      ph: Math.random() * TAU,
    });
  }
}
function updatePetals(dt, wind) {
  for (let i = petals.length - 1; i >= 0; i--) {
    const p = petals[i];
    p.ph += dt * 2.4;
    p.x += (p.vx + wind * 2.2) * dt;
    p.y += (p.vy + Math.sin(p.ph) * 12) * dt; // 나풀나풀 상하 흔들림
    p.rot += p.vr * dt;
    if (p.x < -160 || p.x > W + 160 || p.y > H + 80) petals.splice(i, 1);
  }
}
function drawPetals() {
  for (let i = 0; i < petals.length; i++) {
    const p = petals[i];
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = "rgba(244,182,196,0.92)"; // 연분홍
    ctx.beginPath();
    ctx.moveTo(0, -p.size);
    ctx.lineTo(p.size * 0.7, p.size * 0.62);
    ctx.lineTo(-p.size * 0.7, p.size * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/* ---------- 입자 렌더: 부드러운 원, 목표색 그대로 ---------- */
function drawParticles() {
  const ps = field.particles;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    ctx.fillStyle = "rgb(" + (p.r | 0) + "," + (p.g | 0) + "," + (p.b | 0) + ")";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, TAU);
    ctx.fill();
  }
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion; T = 0;
    petals = []; petalTimer = reduced ? 6 : 3.5;
    const image = opts.assets && opts.assets.target ? opts.assets.target : null;
    const points = image ? null : buildFallbackPoints();
    field = new ParticleField({
      image, points,
      count: 6500,
      w: W, h: H,
      margin: 0.1,
      spring: 4.4,
      damping: 3.4,
      jitter: reduced ? 2 : 4.5,
    });
    tuneSprings();
    buildBg();
  },

  tick(dt, ptr) {
    T += dt;
    const ps = field.particles;

    // 클릭 = 돌풍: 강한 방사형 흩뜨림
    if (ptr.justDown && ptr.inside) {
      field.scatter(ptr.x, ptr.y, reduced ? 130 : 210, reduced ? 260 : 540);
    }

    // 드래그 = 바람: 이동 방향(dx,dy)으로 반경 내 입자를 직접 밀기
    if (ptr.down && ptr.inside) {
      const sp = Math.hypot(ptr.dx, ptr.dy);
      if (sp > 0.02) {
        const R = reduced ? 110 : 155, R2 = R * R;
        const k = reduced ? 6 : 13;
        for (let i = 0; i < ps.length; i++) {
          const p = ps[i];
          const ddx = p.x - ptr.x, ddy = p.y - ptr.y;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < R2) {
            const fall = 1 - Math.sqrt(d2) / R; // 반경 내 선형 감쇠
            p.vx += ptr.dx * k * fall;
            p.vy += ptr.dy * k * fall;
          }
        }
      }
    }

    // 유휴: 은은한 수평 바람 사인파 (위쪽=머리칼·옷자락일수록 크게 나부낌)
    const windAmp = reduced ? 3 : 9;
    const wind = Math.sin(T * 0.55) * windAmp + windAmp * 0.4;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      const up = 1 - p.ty / H;
      p.vx += wind * dt * (0.35 + (up > 0 ? up : 0));
    }

    // 장미 꽃잎: 이따금 가장자리에서 8~12개가 날아와 가로지름
    petalTimer -= dt;
    if (petalTimer <= 0) {
      spawnBurst();
      petalTimer = (reduced ? 14 : 8) * (0.7 + Math.random() * 0.7);
    }
    updatePetals(dt, wind);

    field.step(dt);

    // 렌더
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);
    drawParticles();
    drawPetals();
  },

  resize(w, h) {
    W = w; H = h;
    if (field) { field.resize(w, h); tuneSprings(); }
    if (ctx) buildBg();
  },

  dispose() {
    field = null; petals = []; bgGrad = null; ctx = null;
  },
};
```

- [ ] **Step 2: 브라우저 검증** — 공통 검증 절차 수행. 추가 확인: 드래그 방향으로 입자가 쏠리는 바람 반응 + 가장자리에서 장미 꽃잎이 날아와 가로지름.

- [ ] **Step 3: 커밋**

```bash
git add js/pieces/02-birth-of-venus.js
git commit -m "feat: 작품 02 — Birth of Venus (바람 입자·꽃잎)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: 작품 03 — After Vermeer, Girl with a Pearl Earring

**Files:**
- Create: `js/pieces/03-pearl-earring.js`

**Interfaces:**
- Consumes: `ParticleField`(Task 4), main.js 구동 규약(Task 5), `assets/targets/03-pearl-earring.jpg`(Task 3).
- Produces: 없음 (말단 작품 모듈).

- [ ] **Step 1: js/pieces/03-pearl-earring.js 작성**

```js
// js/pieces/03-pearl-earring.js
// After Vermeer — Girl with a Pearl Earring (c.1665)
// 어둠 속 빛 먼지 입자. 진주가 마지막에 가장 밝게 복원된다.
import { ParticleField } from "../particle-engine.js";

let W = 0, H = 0, ctx = null, T = 0, reduced = false;
let field = null;
let pearls = [];          // 진주 위치 입자 인덱스 목록
let flicker = 0;          // 촛불 깜빡임 남은 시간(초)
let flickerAge = 0;       // 깜빡임 경과 시간(초) — 방사형 웨이브 전파용
let waveOrigin = { x: 0, y: 0 };

// 진주의 이미지 내 정규화 좌표(대략) — contain-fit 박스 기준
const PEARL_U = 0.42, PEARL_V = 0.72, PEARL_R = 0.038;

const FLICKER_DUR = 0.6;  // 클릭 깜빡임 지속(초)

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = opts.reducedMotion; T = 0;
    flicker = 0; flickerAge = 0;
    const img = opts && opts.assets ? opts.assets.target : null;

    field = new ParticleField({
      image: img || null,
      points: img ? null : buildFallbackPoints(),
      count: 6500,
      w: W, h: H,
      margin: 0.1,
      spring: 4.2,
      damping: 3.4,
      jitter: 4,
    });

    tagPearls();
  },

  tick(dt, ptr) {
    T += dt;

    // 1) 입력 반영 --------------------------------------------------
    if (ptr && ptr.inside) {
      // 드래그: 촛불 바람 — 약한 scatter + 위쪽 부력
      if (ptr.down && (Math.abs(ptr.dx) > 0.01 || Math.abs(ptr.dy) > 0.01)) {
        const s = reduced ? 22 : 60;
        field.scatter(ptr.x, ptr.y, 90, s);
        applyBuoyancy(ptr.x, ptr.y, 120, reduced ? 30 : 80, dt);
      }
      // 클릭: 촛불 깜빡임 웨이브 시작
      if (ptr.justDown) {
        flicker = FLICKER_DUR;
        flickerAge = 0;
        waveOrigin.x = ptr.x; waveOrigin.y = ptr.y;
      }
    }
    if (flicker > 0) { flicker -= dt; flickerAge += dt; }

    // 2) 시뮬레이션 -------------------------------------------------
    field.step(dt);

    // 3) 렌더 -------------------------------------------------------
    drawBackground();
    drawParticles();
    drawPearls();
  },

  resize(w, h) {
    W = w; H = h;
    if (field) { field.resize(w, h); tagPearls(); }
  },

  dispose() {
    ctx = null; field = null; pearls = [];
  },
};

// --- 진주 입자 식별 -------------------------------------------------
// 목표 좌표(tx,ty)가 진주 위치에 가장 가까운 입자들을 골라
// spring을 절반으로 낮춰(가장 늦게 복원) glow 대상으로 표시.
function tagPearls() {
  pearls = [];
  const ps = field.particles;
  if (!ps || !ps.length) return;

  // contain-fit 박스 추정: 입자 목표 좌표의 경계에서 역산
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (p.tx < minx) minx = p.tx;
    if (p.ty < miny) miny = p.ty;
    if (p.tx > maxx) maxx = p.tx;
    if (p.ty > maxy) maxy = p.ty;
  }
  const bw = maxx - minx, bh = maxy - miny;
  const cx = minx + PEARL_U * bw;
  const cy = miny + PEARL_V * bh;
  const rr = PEARL_R * Math.max(bw, bh);
  const rr2 = rr * rr;

  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const dx = p.tx - cx, dy = p.ty - cy;
    if (dx * dx + dy * dy <= rr2) {
      p.spring = (p.spring || 4.2) * 0.5; // 절반 강성 → 가장 늦게 복원
      pearls.push(i);
    }
  }
}

// --- 폴백 절차적 points: 두건 + 얼굴 타원 + 진주 ---------------------
function buildFallbackPoints() {
  const pts = [];
  const N = 5200;
  for (let i = 0; i < N; i++) {
    const u = Math.random(), v = Math.random();
    // 얼굴 타원 (중앙 상단)
    const fx = 0.5, fy = 0.44, frx = 0.19, fry = 0.26;
    const ex = (u - fx) / frx, ey = (v - fy) / fry;
    const inFace = ex * ex + ey * ey <= 1;
    // 두건 (얼굴 위/좌우를 감싸는 넓은 타원)
    const hx = 0.5, hy = 0.4, hrx = 0.34, hry = 0.42;
    const gx = (u - hx) / hrx, gy = (v - hy) / hry;
    const inHood = gx * gx + gy * gy <= 1;

    if (inFace) {
      // 살결: 따뜻한 밝은 톤
      const sh = 0.55 + 0.35 * (1 - ey); // 위쪽이 더 밝음
      pts.push({ u, v, r: 205 * sh + 40, g: 165 * sh + 30, b: 130 * sh + 20 });
    } else if (inHood) {
      // 두건: 청/황 대비 (베르메르 울트라마린 + 옐로우 오커)
      if (v < 0.36 && u > 0.5) {
        pts.push({ u, v, r: 190, g: 150, b: 40 });   // 노란 두건 자락
      } else {
        pts.push({ u, v, r: 30, g: 55, b: 120 });    // 파란 두건
      }
    } else {
      i--; // 배경은 버림(어둠) — 재시도
      continue;
    }
  }
  // 진주: 밝은 흰빛 점군
  const pn = 90;
  for (let i = 0; i < pn; i++) {
    const a = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random()) * PEARL_R;
    pts.push({
      u: PEARL_U + Math.cos(a) * rad,
      v: PEARL_V + Math.sin(a) * rad * 1.1,
      r: 240, g: 240, b: 250,
    });
  }
  return pts;
}

// --- 부력: 커서 주변 입자를 위쪽으로 밀어올림 ------------------------
function applyBuoyancy(cx, cy, radius, strength, dt) {
  const ps = field.particles;
  const r2 = radius * radius;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const dx = p.x - cx, dy = p.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    const fall = 1 - Math.sqrt(d2) / radius;
    p.vy -= strength * fall * dt * 60; // 위로 뜨는 힘
    p.vx += (Math.random() - 0.5) * strength * fall * dt * 20; // 옆으로 살랑
  }
}

// --- 배경: 거의 검정 + 미세 비네트 --------------------------------
function drawBackground() {
  // 잔상 트레일: 빛 먼지의 여운을 남긴다
  ctx.fillStyle = "rgba(5,5,7,0.34)";
  ctx.fillRect(0, 0, W, H);

  // 미세 비네트(가장자리를 더 어둡게)
  const g = ctx.createRadialGradient(
    W * 0.46, H * 0.46, Math.min(W, H) * 0.1,
    W * 0.5, H * 0.5, Math.max(W, H) * 0.72
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// --- 입자 렌더 -----------------------------------------------------
// 어두운 색은 작게, 밝은 색은 크게(빛 먼지). 유휴 twinkle.
function drawParticles() {
  const ps = field.particles;
  ctx.globalCompositeOperation = "lighter";

  // 클릭 웨이브: 중심에서 방사형으로 밝기 파동 전파
  const waveActive = flicker > 0;
  const waveR = flickerAge * Math.max(W, H) * 2.4; // 웨이브 반경 확장
  const waveWidth = Math.max(W, H) * 0.28;

  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const lum = (p.r * 0.299 + p.g * 0.587 + p.b * 0.114) / 255; // 밝기 0..1

    // 입자별 위상 twinkle (유휴에도 살아있음)
    const tw = 0.72 + 0.28 * Math.sin(T * 2.4 + i * 0.7);
    let bright = 0.45 + lum * 0.75 * tw;

    // 방사형 밝기 웨이브
    if (waveActive) {
      const dx = p.x - waveOrigin.x, dy = p.y - waveOrigin.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const band = 1 - Math.min(1, Math.abs(d - waveR) / waveWidth);
      if (band > 0) {
        const env = flicker / FLICKER_DUR; // 시간 감쇠
        bright += band * env * (reduced ? 0.5 : 1.3);
      }
    }
    if (bright > 1.8) bright = 1.8;

    // 크기: 밝을수록 크게(빛 먼지)
    const sz = (p.size || 1) * (0.6 + lum * 1.7);

    const a = Math.min(1, 0.28 + bright * 0.5);
    ctx.fillStyle = "rgba(" +
      clamp255(p.r * bright) + "," +
      clamp255(p.g * bright) + "," +
      clamp255(p.b * bright) + "," + a.toFixed(3) + ")";

    if (sz <= 1.2) {
      ctx.fillRect(p.x - sz * 0.5, p.y - sz * 0.5, sz, sz);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, sz * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = "source-over";
}

// --- 진주: 복원 완료에 가까울수록 글로우 ----------------------------
// "진주가 마지막에 가장 밝게 돌아온다" — 목표 좌표에 근접할수록 빛난다.
function drawPearls() {
  if (!pearls.length) return;
  const ps = field.particles;
  ctx.globalCompositeOperation = "lighter";

  for (let k = 0; k < pearls.length; k++) {
    const p = ps[pearls[k]];
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // 복원도: 목표에 가까울수록 1
    const settle = Math.max(0, 1 - dist / 34);
    const glow = settle * settle; // 마지막 구간에서 급격히 밝아짐

    const pulse = 0.85 + 0.15 * Math.sin(T * 3 + pearls[k]);
    const gr = (p.size || 1) * (2.6 + glow * 6.5) * pulse;

    // 2겹 원: 바깥 halo + 안쪽 코어
    const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, gr);
    const ha = (0.12 + glow * 0.6);
    halo.addColorStop(0, "rgba(255,252,240," + ha.toFixed(3) + ")");
    halo.addColorStop(0.5, "rgba(230,225,205," + (ha * 0.4).toFixed(3) + ")");
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(p.x, p.y, gr, 0, Math.PI * 2);
    ctx.fill();

    // 코어 하이라이트
    const ca = 0.5 + glow * 0.5;
    ctx.fillStyle = "rgba(255,255,255," + ca.toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(p.x, p.y, (p.size || 1) * (0.8 + glow * 1.2), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

function clamp255(v) {
  v = v | 0;
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
```

- [ ] **Step 2: 브라우저 검증** — 공통 검증 절차 수행. 추가 확인: 클릭 시 방사형 밝기 파동 + 흩뜨린 뒤 진주 부위가 가장 늦게·가장 밝게 복원.

- [ ] **Step 3: 커밋**

```bash
git add js/pieces/03-pearl-earring.js
git commit -m "feat: 작품 03 — Pearl Earring (빛 먼지·진주 지연 복원)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: 작품 04 — After Leonardo, Mona Lisa

**Files:**
- Create: `js/pieces/04-mona-lisa.js`

**Interfaces:**
- Consumes: `ParticleField`(Task 4), main.js 구동 규약(Task 5), `assets/targets/04-mona-lisa.jpg`(Task 3).
- Produces: 없음 (말단 작품 모듈).

- [ ] **Step 1: js/pieces/04-mona-lisa.js 작성**

```js
// js/pieces/04-mona-lisa.js
// After Leonardo — Mona Lisa (c.1503) · sfumato 안개 입자
import { ParticleField } from "../particle-engine.js";

const TAU = Math.PI * 2;
const SPRING = 3.6;            // 기본 복원 강성
const MONO = [116, 98, 76];   // 안개 상태의 갈색-회갈색 모노톤

let ctx = null, W = 0, H = 0, T = 0, reduced = false;
let field = null;
let bg = null;                 // 오프스크린 배경 그라데이션
let fog = 0;                   // 전역 안개 계수 (0 응집 ~ 1 흩어짐)
let cx0 = 0, cy0 = 0;          // 입자 목표 바운딩 박스 중심

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion; T = 0; fog = 0;

    const img = opts.assets && opts.assets.target ? opts.assets.target : null;
    const count = reduced ? 3200 : 6200;
    field = new ParticleField({
      image: img,
      points: img ? null : makePortraitPoints(), // null이면 초상 실루엣 절차 points
      count, w: W, h: H, margin: 0.1,
      spring: SPRING, damping: 3.4, jitter: 4,
    });

    buildBackground();
    tagParticles(); // 미소 영역 판별 · 숨쉬기 기준 목표 기록
  },

  tick(dt, ptr) {
    T += dt;

    // 1) 입력 반영
    if (ptr.inside && ptr.justDown) {
      // 클릭 = 안개 폭발: 전체를 방사형으로 밀치고 이후 spring으로 서서히 응결
      field.scatter(ptr.x, ptr.y, Math.min(W, H) * 0.95, reduced ? 130 : 260);
    } else if (ptr.inside && ptr.down) {
      // 드래그 = sfumato 휘젓기: 소용돌이 + 커서 주변 의사 컬 노이즈
      const sp = Math.hypot(ptr.dx, ptr.dy);
      const rad = Math.min(W, H) * 0.24;
      field.swirl(ptr.x, ptr.y, rad, (reduced ? 70 : 150) + sp * 4);
      stirCurl(ptr.x, ptr.y, rad, sp);
    }

    // 2) 시뮬레이션 (유휴 숨쉬기 → 적분)
    applyBreathing();
    field.step(dt);
    updateFog(dt);

    // 3) 렌더
    render();
  },

  resize(w, h) {
    W = w; H = h;
    field.resize(w, h);
    buildBackground();
    tagParticles();
  },

  dispose() { ctx = null; field = null; bg = null; },
};

// ── 입자 태깅: 미소 영역 spring 감쇠 + 숨쉬기 기준점 ───────────────
function tagParticles() {
  const ps = field.particles;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of ps) {
    if (p.tx < minX) minX = p.tx; if (p.tx > maxX) maxX = p.tx;
    if (p.ty < minY) minY = p.ty; if (p.ty > maxY) maxY = p.ty;
  }
  const spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY);
  cx0 = minX + spanX / 2; cy0 = minY + spanY / 2;

  for (const p of ps) {
    const u = (p.tx - minX) / spanX, v = (p.ty - minY) / spanY;
    p.bx = p.tx; p.by = p.ty;                 // 숨쉬기 기준 목표
    p.phase = Math.random() * TAU;            // 개별 위상
    // 미소 영역(u≈0.35..0.65, v≈0.55..0.62)은 복원이 가장 느림
    const smile = u > 0.35 && u < 0.65 && v > 0.55 && v < 0.62;
    p.isSmile = smile;
    p.spring = smile ? SPRING * 0.4 : SPRING;
  }
}

// ── 유휴: 아주 느린 숨쉬기 (중심 기준 미세 팽창/수축 + 개별 사인) ──
function applyBreathing() {
  const ps = field.particles;
  const breathe = Math.sin(T * 0.45) * (reduced ? 0.0018 : 0.005);
  const micro = reduced ? 0.12 : 0.4;
  for (const p of ps) {
    const s = 1 + breathe;
    p.tx = cx0 + (p.bx - cx0) * s + Math.cos(p.phase + T * 0.7) * micro;
    p.ty = cy0 + (p.by - cy0) * s + Math.sin(p.phase + T * 0.6) * micro;
  }
}

// ── 드래그 휘젓기: 사인 기반 의사 컬 노이즈로 vx,vy에 회전 성분 부여 ─
function stirCurl(cx, cy, rad, sp) {
  const ps = field.particles;
  const r2 = rad * rad;
  const force = (reduced ? 16 : 40) + sp * 1.4;
  for (const p of ps) {
    const dx = p.x - cx, dy = p.y - cy, d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    const fall = 1 - Math.sqrt(d2) / rad;
    // 의사 컬: 위치·시간의 사인장 → 연기처럼 감기는 회전 방향
    const n = Math.sin(p.x * 0.018 + T * 1.3) + Math.cos(p.y * 0.02 - T * 1.1);
    const a = n * Math.PI;
    p.vx += Math.cos(a) * force * fall;
    p.vy += Math.sin(a) * force * fall;
  }
}

// ── 안개 상태: 평균 목표거리로 전역 fog 계수 갱신 ──────────────────
function updateFog(dt) {
  const ps = field.particles;
  let sum = 0;
  for (const p of ps) sum += Math.hypot(p.tx - p.x, p.ty - p.y);
  const target = Math.min(1, (sum / ps.length) / 55);
  fog += (target - fog) * Math.min(1, dt * 3);
}

// ── 렌더: 부드러운 연기 (헤일로 + 코어 2겹, 잔상 트레일) ───────────
function render() {
  // 반투명 배경 재도포 → 연기 잔상
  ctx.globalAlpha = reduced ? 0.6 : 0.32;
  ctx.drawImage(bg, 0, 0, W, H);
  ctx.globalAlpha = 1;

  const ps = field.particles;
  ctx.globalCompositeOperation = "lighter";
  for (const p of ps) {
    // 색: 응집이면 원색, 흩어질수록 모노톤 (전역 fog + 개별 거리)
    const d = Math.hypot(p.tx - p.x, p.ty - p.y);
    const lf = Math.min(1, Math.max(fog, d / 70));
    const r = (p.r + (MONO[0] - p.r) * lf) | 0;
    const g = (p.g + (MONO[1] - p.g) * lf) | 0;
    const b = (p.b + (MONO[2] - p.b) * lf) | 0;
    const s = p.size || 1.5;
    // 헤일로: 큰 원 + 낮은 알파 → 안개
    ctx.fillStyle = "rgba(" + r + "," + g + "," + b + ",0.06)";
    ctx.beginPath(); ctx.arc(p.x, p.y, s * 2.6, 0, TAU); ctx.fill();
    // 코어: 작은 원 → 형상의 심
    ctx.fillStyle = "rgba(" + r + "," + g + "," + b + ",0.5)";
    ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.8, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

// ── 배경: 어두운 갈색 그라데이션 (#1a140c → #0a0806) ───────────────
function buildBackground() {
  bg = document.createElement("canvas");
  bg.width = Math.max(2, Math.round(W));
  bg.height = Math.max(2, Math.round(H));
  const g = bg.getContext("2d");
  const grad = g.createRadialGradient(
    W * 0.5, H * 0.42, Math.min(W, H) * 0.05,
    W * 0.5, H * 0.5, Math.max(W, H) * 0.75
  );
  grad.addColorStop(0, "#1a140c");
  grad.addColorStop(1, "#0a0806");
  g.fillStyle = grad;
  g.fillRect(0, 0, bg.width, bg.height);
}

// ── 절차적 폴백: 초상 실루엣 points (assets.target이 null일 때) ────
function makePortraitPoints() {
  const pts = [];
  const N = 2400;
  while (pts.length < N) {
    const u = Math.random(), v = Math.random();
    const col = portraitColor(u, v);
    if (col) pts.push({ u, v, r: col[0], g: col[1], b: col[2] });
  }
  return pts;
}

function insideOval(u, v, cu, cv, ru, rv) {
  const a = (u - cu) / ru, b = (v - cv) / rv;
  return a * a + b * b <= 1;
}

function tint(r, g, b, f) {
  const k = Math.max(0, Math.min(1, f));
  return [(r * k) | 0, (g * k) | 0, (b * k) | 0];
}

// 레오나르도 팔레트의 반신 초상 근사 (얼굴/머리/목/드레스/모은 손)
function portraitColor(u, v) {
  // 얼굴 (위는 밝고 아래로 그늘 — sfumato)
  if (insideOval(u, v, 0.5, 0.30, 0.135, 0.175)) {
    return tint(206, 176, 140, 1 - (v - 0.13) * 0.5);
  }
  // 목 그늘
  if (u > 0.445 && u < 0.555 && v > 0.45 && v < 0.53) return [150, 120, 92];
  // 머리카락·베일 (얼굴을 감싸는 외곽 타원)
  if (insideOval(u, v, 0.5, 0.30, 0.215, 0.255) && v < 0.56) return [58, 40, 28];
  // 앞으로 모은 두 손
  if (insideOval(u, v, 0.5, 0.82, 0.12, 0.055)) return [176, 146, 112];
  // 상체·드레스 (아래로 넓어지는 사다리꼴, 옷주름 명암)
  if (v > 0.5) {
    const hw = 0.16 + (v - 0.5) * 0.56;
    if (u > 0.5 - hw && u < 0.5 + hw) {
      return tint(48, 35, 25, 0.9 + 0.2 * Math.sin(u * 40 + v * 6));
    }
  }
  return null;
}
```

- [ ] **Step 2: 브라우저 검증** — 공통 검증 절차 수행. 추가 확인: 흩어진 상태에서 갈색 모노톤 안개, 응집되며 원색 복원, 미소 영역이 마지막에 완성.

- [ ] **Step 3: 커밋**

```bash
git add js/pieces/04-mona-lisa.js
git commit -m "feat: 작품 04 — Mona Lisa (sfumato 안개·미소 지연 복원)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: 작품 05 — After Monet, Impression Sunrise

**Files:**
- Create: `js/pieces/05-impression-sunrise.js`

**Interfaces:**
- Consumes: main.js 구동 규약(Task 5).
- Produces: 없음 (말단 작품 모듈).

- [ ] **Step 1: js/pieces/05-impression-sunrise.js 작성**

```js
// js/pieces/05-impression-sunrise.js
// After Monet — Impression, Sunrise (1872). 절차적 재해석: 안개 낀 르아브르 항구 새벽.
// 이미지 미사용. 청회색 안개 하늘 + 가로 붓질 바다 + 고동치는 주황 태양 + 부서진 반사 + 조각배.

const TWO_PI = Math.PI * 2;
const RIPPLE_SPEED = 150;   // 리플 링이 바깥으로 번지는 속도(px/s)
const RIPPLE_W = 46;        // 링(파동 패킷) 두께
const RK = TWO_PI / 40;     // 리플 파장 → 위상 계수
const N_BANDS = 16;         // 바다 가로 붓질 밴드 수
const MAX_RIPPLES = 20;

let W = 0, H = 0, ctx = null, T = 0, reduced = false, mo = 1;
let horizonY = 0, seaH = 0;
let sunX = 0, sunY = 0, sunR = 0, sunFlash = 0;

let bands = [];        // {f, amp, wl, spd, ph, r,g,b} — f: 수평선(0)~전경(1)
let fog = [];          // {x, y, r, vx, drift, ph, a} — 느리게 흐르는 안개 블롭
let refl = [];         // {t, x, w, ph, base} — 태양 아래 부서진 반사 조각
let boats = [];        // {x, y, s, bp, bs, amp} — 검은 조각배 실루엣
const ripples = [];    // {x, y, t, strength} — 드래그/클릭 파원
const gulls = [];      // {x, y, vx, ph} — 이따금 지나가는 갈매기 점
let gullTimer = 3, dragAccum = 0;

const rnd = (a, b) => a + Math.random() * (b - a);

// 장면 지오메트리/정적 요소 (재)구성 — init·resize에서 호출
function build() {
  horizonY = H * 0.52;
  seaH = H - horizonY;
  sunX = W * 0.34;
  sunY = horizonY - H * 0.055;
  sunR = Math.max(14, Math.min(W, H) * 0.032);

  bands = [];
  for (let i = 0; i < N_BANDS; i++) {
    const f = i / (N_BANDS - 1);
    // 수평선의 옅은 청회색 → 전경의 짙은 청록으로 보간
    bands.push({
      f,
      amp: 2 + f * 6,
      wl: TWO_PI / (60 + Math.random() * 80),
      spd: rnd(0.5, 1.3) * (i % 2 ? 1 : -1),
      ph: rnd(0, TWO_PI),
      r: Math.round(118 - f * 84),
      g: Math.round(132 - f * 84),
      b: Math.round(138 - f * 82),
    });
  }

  fog = [];
  for (let i = 0; i < 4; i++) {
    fog.push({
      x: rnd(0, W), y: rnd(H * 0.12, horizonY * 0.9),
      r: rnd(H * 0.14, H * 0.26), vx: rnd(4, 12),
      drift: rnd(0.1, 0.3), ph: rnd(0, TWO_PI), a: rnd(0.08, 0.18),
    });
  }

  refl = [];
  for (let i = 0; i < 48; i++) {
    refl.push({
      t: Math.pow(Math.random(), 0.7),  // 위로 밀집(수평선 근처가 촘촘)
      x: Math.random() * 2 - 1,         // 태양 열 기준 좌우 계수
      w: rnd(0.4, 1), ph: rnd(0, TWO_PI), base: rnd(0.35, 1),
    });
  }

  boats = [
    { x: W * 0.52, y: horizonY + seaH * 0.14, s: Math.max(10, W * 0.022), bp: 0.4, bs: 0.9, amp: seaH * 0.012 },
    { x: W * 0.66, y: horizonY + seaH * 0.07, s: Math.max(6, W * 0.013), bp: 2.1, bs: 1.1, amp: seaH * 0.008 },
  ];
}

// 모든 리플의 감쇠 사인 기여 합 — 링은 시간에 따라 확장하며 사그라짐
function rippleField(px, py) {
  let sum = 0;
  for (let i = 0; i < ripples.length; i++) {
    const r = ripples[i];
    const dx = px - r.x, dy = py - r.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const off = d - RIPPLE_SPEED * r.t;               // 링 정점까지의 거리
    const env = r.strength * Math.exp(-r.t * 0.85) *
                Math.exp(-(off * off) / (2 * RIPPLE_W * RIPPLE_W));
    sum += env * Math.cos(off * RK);
  }
  return sum;
}

function addRipple(x, y, s) {
  ripples.push({ x, y, t: 0, strength: s });
  if (ripples.length > MAX_RIPPLES) ripples.shift();
}

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, horizonY + seaH * 0.1);
  g.addColorStop(0, "#41505d");
  g.addColorStop(0.5, "#6a7883");
  g.addColorStop(0.82, "#b7ac9d");
  g.addColorStop(1, "#d8c3ac");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, horizonY + 2);
}

function drawFog(dt) {
  for (const f of fog) {
    f.x += f.vx * dt;
    if (f.x - f.r > W) f.x = -f.r;                    // 좌로 랩어라운드
    const y = f.y + Math.sin(T * f.drift + f.ph) * 8;
    const g = ctx.createRadialGradient(f.x, y, 0, f.x, y, f.r);
    g.addColorStop(0, `rgba(206,210,214,${f.a})`);
    g.addColorStop(1, "rgba(206,210,214,0)");
    ctx.fillStyle = g;
    ctx.fillRect(f.x - f.r, y - f.r, f.r * 2, f.r * 2);
  }
}

function drawSea() {
  const g = ctx.createLinearGradient(0, horizonY, 0, H);
  g.addColorStop(0, "#7c848a");
  g.addColorStop(0.25, "#5c6a72");
  g.addColorStop(1, "#28353d");
  ctx.fillStyle = g;
  ctx.fillRect(0, horizonY, W, seaH);

  const S = 16;
  const wmo = reduced ? 0.7 : 1;
  const thick = seaH / N_BANDS * 1.9;
  for (const bd of bands) {
    const by = horizonY + bd.f * seaH;
    ctx.beginPath();
    ctx.moveTo(0, by);
    for (let x = 0; x <= W; x += S) {
      const wave = Math.sin(x * bd.wl + T * bd.spd + bd.ph) * bd.amp * wmo;
      ctx.lineTo(x, by + wave + rippleField(x, by));  // 사인 일렁임 + 리플
    }
    ctx.lineTo(W, by + thick);
    ctx.lineTo(0, by + thick);
    ctx.closePath();
    ctx.fillStyle = `rgba(${bd.r},${bd.g},${bd.b},${0.42 + bd.f * 0.4})`;
    ctx.fill();
  }
}

function drawSun() {
  const r = sunR * (1 + Math.sin(T * 1.4) * 0.06 * mo);          // 반경 펄스
  const glowR = sunR * (3.4 + Math.sin(T * 1.1) * 0.5 * mo) + sunFlash * sunR * 4;
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, glowR);
  g.addColorStop(0, `rgba(255,120,66,${0.5 + sunFlash * 0.4})`);
  g.addColorStop(0.4, "rgba(255,110,60,0.18)");
  g.addColorStop(1, "rgba(255,110,60,0)");
  ctx.fillStyle = g;
  ctx.fillRect(sunX - glowR, sunY - glowR, glowR * 2, glowR * 2);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#ff6a39";
  ctx.beginPath();
  ctx.arc(sunX, sunY, r, 0, TWO_PI);
  ctx.fill();
}

function drawReflections() {
  ctx.globalCompositeOperation = "lighter";
  for (const p of refl) {
    const y = horizonY + p.t * seaH * 0.98 + 4;
    const spread = sunR * (0.5 + p.t * 3.2);          // 아래로 갈수록 넓게 퍼짐
    const rf = rippleField(sunX, y);
    const x = sunX + p.x * spread + rf * 0.6;
    const len = (6 + p.w * 26) * (0.5 + p.t);
    // 명멸: 고유 위상 사인 + 리플 밝기 기여
    let bright = p.base * (0.5 + 0.5 * Math.sin(T * (2 + p.t * 2) + p.ph));
    bright = Math.max(0, Math.min(1, bright + rf * 0.04));
    const yj = y + Math.sin(T * 1.5 + p.ph) * 2 + rf * 0.5;
    ctx.fillStyle = `rgba(255,${150 + Math.round(bright * 80)},90,${0.10 + bright * 0.28})`;
    ctx.fillRect(x - len / 2, yj, len, 2 + p.t * 2);
  }
  ctx.globalCompositeOperation = "source-over";
}

function drawBoats() {
  for (const b of boats) {
    const yo = Math.sin(T * b.bs + b.bp) * b.amp * mo; // 느린 보빙
    ctx.save();
    ctx.translate(b.x, b.y + yo);
    ctx.rotate(Math.sin(T * b.bs + b.bp) * 0.05 * mo);
    ctx.fillStyle = "#0b1216";
    const s = b.s;
    ctx.beginPath();
    ctx.moveTo(-s, 0);
    ctx.quadraticCurveTo(0, s * 0.55, s, 0);           // 초승달 선체
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-1, -s * 0.85, 2.5, s * 0.85);        // 서 있는 노잡이
    ctx.fillRect(-s * 0.7, -1.5, s * 1.4, 2);          // 뱃전
    ctx.restore();
  }
}

function updateGulls(dt) {
  gullTimer -= dt;
  if (gullTimer <= 0 && gulls.length < 3) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    gulls.push({
      x: dir > 0 ? -20 : W + 20, y: rnd(H * 0.14, horizonY * 0.72),
      vx: dir * rnd(22, 40), ph: rnd(0, TWO_PI),
    });
    gullTimer = rnd(4, 9);
  }
  for (let i = gulls.length - 1; i >= 0; i--) {
    gulls[i].x += gulls[i].vx * dt;
    if (gulls[i].x < -30 || gulls[i].x > W + 30) gulls.splice(i, 1);
  }
}

function drawGulls() {
  ctx.strokeStyle = "rgba(38,46,54,0.7)";
  ctx.lineWidth = 1.6;
  for (const g of gulls) {
    const wy = -3 - (Math.sin(T * 7 + g.ph) * 0.5 + 0.5) * 5 * mo; // 날갯짓
    ctx.beginPath();
    ctx.moveTo(g.x - 7, g.y);
    ctx.quadraticCurveTo(g.x - 2, g.y + wy, g.x, g.y);
    ctx.quadraticCurveTo(g.x + 2, g.y + wy, g.x + 7, g.y);
    ctx.stroke();
  }
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion; mo = reduced ? 0.5 : 1;
    T = 0; sunFlash = 0; dragAccum = 0; gullTimer = 3;
    ripples.length = 0; gulls.length = 0;
    build();
  },
  tick(dt, ptr) {
    T += dt;
    // 드래그: 이동 거리 누적 후 작은 리플 파원 생성
    if (ptr.inside && ptr.down && (ptr.dx || ptr.dy)) {
      dragAccum += Math.hypot(ptr.dx, ptr.dy);
      if (dragAccum > 20) { addRipple(ptr.x, ptr.y, 6); dragAccum = 0; }
    }
    // 클릭: 큰 리플 링 + 태양 글로우 한 번 크게
    if (ptr.justDown) { addRipple(ptr.x, ptr.y, 15); sunFlash = 1.3; }

    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].t += dt;
      if (ripples[i].t > 7) ripples.splice(i, 1);
    }
    sunFlash = Math.max(0, sunFlash - dt * 0.8);
    updateGulls(dt);

    drawSky();
    drawFog(dt);
    drawSea();
    drawSun();
    drawReflections();
    drawBoats();
    drawGulls();
  },
  resize(w, h) { W = w; H = h; build(); },
  dispose() {
    ctx = null;
    bands = []; fog = []; refl = []; boats = [];
    ripples.length = 0; gulls.length = 0;
  },
};
```

- [ ] **Step 2: 브라우저 검증** — 공통 검증 절차 수행. 추가 확인: 태양 고동(반경·글로우 펄스) + 드래그 리플이 바다 밴드와 반사광을 일렁이게 함.

- [ ] **Step 3: 커밋**

```bash
git add js/pieces/05-impression-sunrise.js
git commit -m "feat: 작품 05 — Impression Sunrise (살아있는 바다·태양 고동)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: 작품 06 — After Rembrandt, The Night Watch

**Files:**
- Create: `js/pieces/06-night-watch.js`

**Interfaces:**
- Consumes: main.js 구동 규약(Task 5), `assets/targets/06-night-watch.jpg`(Task 3).
- Produces: 없음 (말단 작품 모듈).

- [ ] **Step 1: js/pieces/06-night-watch.js 작성**

```js
// js/pieces/06-night-watch.js
// After Rembrandt — The Night Watch (1642) · 키아로스쿠로
// 원작 이미지를 오프스크린 A에 contain-fit으로 그려두고, 커서 등불은
// 오프스크린 B의 방사형 그라데이션 마스크로 이미지를 국소 리빌한다.

let ctx = null, W = 0, H = 0, T = 0, reduced = false;
let img = null;                 // 원작 이미지 (없으면 null → 절차적 폴백)
let A = null, actx = null;      // 오프스크린 A: 명화 또는 절차적 장면
let B = null, bctx = null;      // 오프스크린 B: 등불 마스크 스크래치
let fit = { x: 0, y: 0, w: 0, h: 0 };

let lx = 0, ly = 0;             // 부드럽게 따라오는 등불 좌표
let flash = 0;                  // 화약 섬광 잔여 시간(초)
let travel = 0;                 // 이동 누적 (잔광 스팟 스폰용)
const spots = [];               // 잔광 스팟 (최대 5, 3초 페이드)
let dust = [];                  // 미세 먼지 입자

const BASE_R = 140;             // 기본 등불 반경(px)
const MARGIN = 0.06;

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w | 0);
  c.height = Math.max(1, h | 0);
  return c;
}

// 원작 종횡비를 화면에 contain-fit
function computeFit() {
  let iw = img ? (img.naturalWidth || img.width) : 0;
  let ih = img ? (img.naturalHeight || img.height) : 0;
  if (iw <= 0 || ih <= 0) { iw = 1000; ih = 820; } // Night Watch 가로형 근사
  const bw = W * (1 - MARGIN * 2), bh = H * (1 - MARGIN * 2);
  const s = Math.min(bw / iw, bh / ih);
  const w = iw * s, h = ih * s;
  fit = { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

// A 오프스크린 갱신: 이미지 또는 절차적 장면
function paintA() {
  actx.clearRect(0, 0, W, H);
  if (img) actx.drawImage(img, fit.x, fit.y, fit.w, fit.h);
  else proceduralScene();
}

// 절차적 폴백: 어둠 속 인물 실루엣 8개 + 옷깃 하이라이트
function proceduralScene() {
  const { x, y, w, h } = fit;
  const bg = actx.createLinearGradient(0, y, 0, y + h);
  bg.addColorStop(0, "#241a12");
  bg.addColorStop(0.6, "#1a1109");
  bg.addColorStop(1, "#0d0805");
  actx.fillStyle = bg;
  actx.fillRect(x, y, w, h);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const fxc = x + w * (0.1 + t * 0.8);
    const scale = 0.82 + ((i * 37) % 10) / 30;
    const fh = h * 0.66 * scale;
    const fw = fh * 0.32;
    const fy = y + h - fh - h * 0.04 * (i % 3);
    drawFigure(fxc, fy, fw, fh, i);
  }
}

function drawFigure(cx, top, w, h, i) {
  const hw = w / 2;
  // 망토 실루엣
  actx.fillStyle = "#0a0705";
  actx.beginPath();
  actx.moveTo(cx - hw, top + h);
  actx.lineTo(cx - hw * 0.7, top + h * 0.28);
  actx.quadraticCurveTo(cx, top + h * 0.16, cx + hw * 0.7, top + h * 0.28);
  actx.lineTo(cx + hw, top + h);
  actx.closePath();
  actx.fill();
  // 머리
  actx.fillStyle = "#120c08";
  actx.beginPath();
  actx.arc(cx, top + h * 0.16, w * 0.22, 0, 6.283);
  actx.fill();
  // 옷깃/러프 하이라이트 — 밝게 두어 등불에 드러남
  actx.strokeStyle = i % 2 === 0 ? "rgba(226,196,140,0.9)" : "rgba(200,170,120,0.75)";
  actx.lineWidth = Math.max(1.5, w * 0.09);
  actx.beginPath();
  actx.moveTo(cx - hw * 0.55, top + h * 0.30);
  actx.quadraticCurveTo(cx, top + h * 0.24, cx + hw * 0.55, top + h * 0.30);
  actx.stroke();
  // 얼굴 하이라이트
  actx.fillStyle = "rgba(210,175,130,0.5)";
  actx.beginPath();
  actx.arc(cx + w * 0.03, top + h * 0.15, w * 0.12, 0, 6.283);
  actx.fill();
}

function initDust() {
  const n = Math.round(Math.min(140, (W * H) / 9000));
  dust = new Array(n);
  for (let i = 0; i < n; i++) {
    dust[i] = {
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 6, vy: -6 - Math.random() * 10,
      ph: Math.random() * 6.28, sz: 0.6 + Math.random() * 1.4,
    };
  }
}

// 등불 마스크: 중심 불투명 → 가장자리 투명 (source-in용, 흰색으로 색 보존)
function drawLamp(c, x, y, r, intensity) {
  const a = Math.max(0, Math.min(1, intensity));
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${0.95 * a})`);
  g.addColorStop(0.55, `rgba(255,255,255,${0.5 * a})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

// 따뜻한 촛불 색온 오버레이
function drawWarm(x, y, r, intensity) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,190,90,${0.1 * intensity})`);
  g.addColorStop(1, "rgba(255,190,90,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function renderDust(cx, cy, R, dt) {
  const drift = reduced ? 0.3 : 1;
  for (const p of dust) {
    p.x += (p.vx + Math.sin(T * 0.8 + p.ph) * 3) * dt * drift;
    p.y += p.vy * dt * drift;
    if (p.y < -4) { p.y = H + 4; p.x = Math.random() * W; }
    if (p.x < -4) p.x = W + 4; else if (p.x > W + 4) p.x = -4;
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d > R) continue;                       // 등불 반경 안에서만 보임
    ctx.fillStyle = `rgba(255,224,170,${(1 - d / R) * 0.5})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.sz, 0, 6.283);
    ctx.fill();
  }
}

function drawVignette() {
  const g = ctx.createRadialGradient(
    W / 2, H / 2, Math.min(W, H) * 0.35,
    W / 2, H / 2, Math.max(W, H) * 0.72,
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.82)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function render(cx, cy, R, dt) {
  // (0) 거의 검정 배경
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, W, H);

  // (1) 이미지를 희미하게 깔기 (0.10~0.14 은은한 숨결)
  ctx.globalAlpha = 0.12 + Math.sin(T * 0.7) * 0.02;
  ctx.drawImage(A, 0, 0, W, H);
  ctx.globalAlpha = 1;

  // (2) 등불 마스크 합성 → B에 그라데이션을 모으고 A를 source-in
  bctx.globalCompositeOperation = "source-over";
  bctx.clearRect(0, 0, W, H);
  bctx.globalCompositeOperation = "lighter";
  drawLamp(bctx, cx, cy, R, 1);                       // 메인 등불
  for (const s of spots) drawLamp(bctx, s.x, s.y, R * 0.6, s.life * 0.5); // 잔광
  bctx.globalCompositeOperation = "source-in";
  bctx.drawImage(A, 0, 0, W, H);                       // 명화를 마스크에 끼움
  bctx.globalCompositeOperation = "source-over";
  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(B, 0, 0, W, H);                        // 메인에 가산

  // 따뜻한 등불빛 오버레이
  drawWarm(cx, cy, R, 1);
  for (const s of spots) drawWarm(s.x, s.y, R * 0.6, s.life * 0.5);

  // (3) 먼지 — 등불 반경 안에서만
  renderDust(cx, cy, R, dt);

  // 비네트
  ctx.globalCompositeOperation = "source-over";
  drawVignette();
  ctx.globalAlpha = 1;
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion; T = 0;
    img = opts.assets && opts.assets.target ? opts.assets.target : null;
    A = makeCanvas(W, H); actx = A.getContext("2d");
    B = makeCanvas(W, H); bctx = B.getContext("2d");
    computeFit(); paintA();
    lx = W * 0.5; ly = H * 0.5;
    flash = 0; travel = 0; spots.length = 0;
    initDust();
  },

  tick(dt, ptr) {
    T += dt;
    const cdt = Math.min(dt, 0.05);

    // 1) 등불이 부드럽게 따라옴 (lerp 0.12 @60fps, dt 보정)
    const tx = ptr.inside ? ptr.x : lx;
    const ty = ptr.inside ? ptr.y : ly;
    const a = 1 - Math.pow(1 - 0.12, cdt * 60);
    const nlx = lx + (tx - lx) * a;
    const nly = ly + (ty - ly) * a;
    travel += Math.hypot(nlx - lx, nly - ly);
    lx = nlx; ly = nly;

    // 지나간 자리에 잔광 스팟 (최대 5)
    if (ptr.inside && travel > 46) {
      travel = 0;
      spots.push({ x: lx, y: ly, life: 1 });
      if (spots.length > 5) spots.shift();
    }
    for (let i = spots.length - 1; i >= 0; i--) {
      spots[i].life -= dt / 3;                 // 3초 페이드
      if (spots[i].life <= 0) spots.splice(i, 1);
    }

    // 2) 클릭 = 화약 섬광 (0.5초간 반경 확장 후 수축)
    if (ptr.justDown) flash = 0.5;
    if (flash > 0) flash = Math.max(0, flash - dt);
    const peak = reduced ? 1.5 : 3;
    let rmul = 1;
    if (flash > 0) rmul = 1 + (peak - 1) * Math.sin((1 - flash / 0.5) * Math.PI);

    // 촛불 플리커: 반경·중심을 노이즈로 미세하게 흔들기
    const fl = reduced ? 0.03 : 0.1;
    const flick = 1 + fl * (Math.sin(T * 11) * 0.6 + Math.sin(T * 23.3) * 0.4);
    const jx = reduced ? 0 : Math.sin(T * 9.1) * 2.2 + Math.sin(T * 17) * 1.3;
    const jy = reduced ? 0 : Math.cos(T * 8.3) * 2.2 + Math.cos(T * 15.7) * 1.3;
    const base = Math.min(BASE_R, Math.min(W, H) * 0.34);
    const R = base * flick * rmul;

    render(lx + jx, ly + jy, R, cdt);
  },

  resize(w, h) {
    W = w; H = h;
    A.width = W; A.height = H;
    B.width = W; B.height = H;
    computeFit(); paintA();
    initDust();
  },

  dispose() {
    ctx = null; actx = null; bctx = null;
    A = null; B = null; img = null;
    spots.length = 0; dust = [];
  },
};
```

- [ ] **Step 2: 브라우저 검증** — 공통 검증 절차 수행. 추가 확인: 커서 등불이 어둠 속 그림을 국소 리빌 + 지나간 자리 잔광 + 클릭 시 섬광 확장.

- [ ] **Step 3: 커밋**

```bash
git add js/pieces/06-night-watch.js
git commit -m "feat: 작품 06 — Night Watch (등불 키아로스쿠로)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: 작품 07 — After Van Gogh, Sunflowers

**Files:**
- Create: `js/pieces/07-sunflowers.js`

**Interfaces:**
- Consumes: main.js 구동 규약(Task 5).
- Produces: 없음 (말단 작품 모듈).

- [ ] **Step 1: js/pieces/07-sunflowers.js 작성**

```js
// js/pieces/07-sunflowers.js
// After Van Gogh — Sunflowers (1888). 절차적 임파스토 정물화.
// 노란 임파스토 배경(오프스크린 베이크) + 도자기 화병 + 해바라기 12~14송이.
// 각 꽃은 개화도 bloom 0..1로 느리게 피고 시들며, 클릭 시 만개+꽃가루, 드래그 시 붓바람에 휨.

let W = 0, H = 0, ctx = null, T = 0, reduced = false;
let bg = null, bgCtx = null;          // 배경 임파스토 베이크용 오프스크린
let flowers = [], order = [], pollen = [];

const GOLDEN = 2.39996323;            // 황금각(라디안) — 해바라기 씨앗 나선
const GRAVITY = 340;                  // 꽃가루 낙하 가속도(px/s^2)

// ── 유틸 ──────────────────────────────────────────────
const rnd = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// 세 성분 색 보간 → rgb 문자열
function mix3(c1, c2, t) {
  return `rgb(${Math.round(lerp(c1[0], c2[0], t))},${Math.round(lerp(c1[1], c2[1], t))},${Math.round(lerp(c1[2], c2[2], t))})`;
}

// ── 배경 굽기: 세로 임파스토 스트로크 ─────────────────
function bakeBackground() {
  bg = document.createElement("canvas");
  bg.width = Math.max(1, Math.round(W));
  bg.height = Math.max(1, Math.round(H));
  bgCtx = bg.getContext("2d");
  const g = bgCtx;
  g.fillStyle = "#c99a34";
  g.fillRect(0, 0, W, H);
  // 짧고 두꺼운 세로 획을 촘촘히 쌓아 임파스토 질감 생성
  g.lineCap = "round";
  const step = Math.max(6, W / 160);
  for (let x = -step; x < W + step; x += step) {
    for (let y = -10; y < H + 10; ) {
      const len = rnd(14, 42);
      const t = Math.random();                     // 밝기 흔들림
      const top = y < H * 0.66 ? t : t * 0.5;       // 상단은 더 밝은 노랑
      const col = [lerp(150, 240, top), lerp(120, 190, top), lerp(30, 60, top)];
      g.strokeStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`;
      g.lineWidth = rnd(3, step * 0.9);
      g.beginPath();
      g.moveTo(x + rnd(-2, 2), y);
      g.lineTo(x + rnd(-3, 3), y + len);
      g.stroke();
      y += len * rnd(0.5, 0.85);
    }
  }
}

// ── 꽃 데이터 생성(init 1회) ──────────────────────────
function makeFlowers() {
  flowers = [];
  const count = 13;                                // 12~14 사이
  const R = 0.33;                                  // 부케 퍼짐(S 단위)
  const seed = rnd(0, Math.PI * 2);
  for (let i = 0; i < count; i++) {
    const rr = R * Math.sqrt((i + 0.6) / count);
    const ang = i * GOLDEN + seed;
    flowers.push({
      ox: rr * Math.cos(ang) + rnd(-0.02, 0.02),   // 부케 중심 기준 오프셋(S 단위)
      oy: rr * Math.sin(ang) * 0.82 - 0.03 + rnd(-0.02, 0.02),
      baseSize: rnd(0.045, 0.07) * (1 - rr * 0.4), // 바깥쪽일수록 약간 작게
      petals: (14 + (Math.random() * 5 | 0)),
      phase: rnd(0, Math.PI * 2),                  // 생애주기 위상
      cycleSpeed: rnd(0.05, 0.11),                 // 느린 개화/시듦
      swayPhase: rnd(0, Math.PI * 2),
      wiggle: rnd(0.9, 1.1),
      bloom: rnd(0.3, 0.9),
      bend: 0, bendVel: 0,                          // 붓바람 휨(각도) + 각속도
      animating: false, animT: 0, animFrom: 0,      // 클릭 만개 애니메이션
      x: 0, y: 0, rad: 0,
    });
  }
}

// ── 레이아웃(init/resize): 화면 크기 반영 ─────────────
let vase = {};
function layout() {
  const S = Math.min(W, H);
  const bx = W * 0.5, by = H * 0.40;
  for (const f of flowers) {
    f.x = bx + f.ox * S;
    f.y = by + f.oy * S;
    f.rad = f.baseSize * S;
  }
  order = flowers.map((_, i) => i).sort((a, b) => flowers[a].y - flowers[b].y);
  vase = {
    cx: W * 0.5, mouthY: H * 0.585, tableY: H * 0.72,
    mouthHalf: S * 0.135, bodyHalf: S * 0.185, bottomHalf: S * 0.12,
  };
}

// ── 꽃 한 송이 그리기 ─────────────────────────────────
const C_GOLD = [247, 199, 44], C_DEEP = [212, 132, 26], C_BROWN = [118, 80, 44];
const C_DISK = [58, 38, 22], C_DISK2 = [104, 66, 30];

function drawFlower(f, lean) {
  const bloom = f.bloom;
  const droop = 1 - bloom;
  const hx = f.x + Math.sin(lean) * f.rad * 1.2;   // 바람에 옆으로
  const hy = f.y + droop * f.rad * 0.6;            // 시들면 고개 숙임
  const cR = f.rad * 0.55;                          // 중심 원판 반지름
  const pLen = f.rad * (0.5 + 0.8 * bloom);        // 꽃잎 길이 = 개화도 반영
  const sat = 0.35 + 0.65 * bloom;                  // 시들수록 갈색조

  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(lean * 0.5);
  ctx.lineCap = "round";

  // 꽃잎: 중심각 배열, 각 꽃잎 = 2~3개의 굵은 곡선 획
  const pc = f.petals;
  for (let i = 0; i < pc; i++) {
    const a = (i / pc) * Math.PI * 2 + f.swayPhase * 0.1;
    const jitter = ((i * 928.71) % 1) - 0.5;        // 꽃잎별 미세 변주
    const len = pLen * (0.9 + jitter * 0.18);
    const t = clamp(sat + jitter * 0.12, 0, 1);
    const base = jitter > 0.15 ? mix3(C_BROWN, C_DEEP, t) : mix3(C_BROWN, C_GOLD, t);
    drawPetal(a, cR * 0.85, cR + len, f.rad * 0.11, base);
  }

  // 중심 원판: 갈색 점묘 나선(황금각 phyllotaxis)
  ctx.fillStyle = mix3(C_DISK, C_DISK2, 0.2 + droop * 0.3);
  ctx.beginPath(); ctx.arc(0, 0, cR, 0, Math.PI * 2); ctx.fill();
  const dots = Math.min(90, Math.max(24, (cR * cR * 0.12) | 0));
  for (let k = 0; k < dots; k++) {
    const dr = cR * 0.94 * Math.sqrt(k / dots);
    const da = k * GOLDEN;
    const dx = dr * Math.cos(da), dy = dr * Math.sin(da);
    ctx.fillStyle = (k & 1) ? mix3(C_DISK, C_DISK2, 0.85) : mix3(C_DISK, [30, 18, 8], 0.5);
    const s = cR * 0.09;
    ctx.beginPath(); ctx.arc(dx, dy, s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// 꽃잎 하나: 중심각 a 방향으로 뻗는 3개의 굵은 곡선 획 + 1px 에지 하이라이트
function drawPetal(a, r0, r1, halfW, colBase) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const px = -sa, py = ca;                          // 수직 방향(폭)
  const curl = (((a * 53.13) % 1) - 0.5) * 0.5;     // 살짝 휘어짐
  for (let k = -1; k <= 1; k++) {
    const off = k * halfW * 0.55;
    const taper = 1 - Math.abs(k) * 0.22;           // 바깥 획은 짧게 → 뾰족한 끝
    const sx = ca * r0 + px * off, sy = sa * r0 + py * off;
    const ex = ca * (r0 + (r1 - r0) * taper) + px * off * 0.4;
    const ey = sa * (r0 + (r1 - r0) * taper) + py * off * 0.4;
    const mx = ca * (r0 + r1) * 0.5 + px * (off + curl * halfW * 2);
    const my = sa * (r0 + r1) * 0.5 + py * (off + curl * halfW * 2);
    ctx.lineWidth = halfW * (k === 0 ? 1.1 : 0.8);
    ctx.strokeStyle = colBase;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
    // 임파스토 하이라이트: 1px 오프셋 밝은 에지
    ctx.lineWidth = Math.max(1, halfW * 0.28);
    ctx.strokeStyle = "rgba(255,246,196,0.55)";
    ctx.beginPath();
    ctx.moveTo(sx + px * 1 - 1, sy + py * 1 - 1);
    ctx.quadraticCurveTo(mx + px - 1, my + py - 1, ex - 1, ey - 1);
    ctx.stroke();
  }
}

// ── 화병 + 테이블 + 줄기 ──────────────────────────────
function drawVaseAndStems() {
  const v = vase, S = Math.min(W, H);
  // 테이블 라인(painterly)
  ctx.lineCap = "round";
  ctx.strokeStyle = "#8a5a1e";
  ctx.lineWidth = Math.max(4, S * 0.012);
  ctx.beginPath();
  ctx.moveTo(0, v.tableY + 2);
  ctx.quadraticCurveTo(W * 0.5, v.tableY - 4, W, v.tableY + 3);
  ctx.stroke();
  ctx.strokeStyle = "rgba(60,38,14,0.5)";
  ctx.lineWidth = Math.max(2, S * 0.006);
  ctx.beginPath(); ctx.moveTo(0, v.tableY + 10); ctx.lineTo(W, v.tableY + 12); ctx.stroke();

  // 줄기(꽃 뒤에 먼저): 화병 입구에서 각 꽃 머리로
  const R = 0.33;
  for (const i of order) {
    const f = flowers[i];
    const mx = v.cx + (f.ox / R) * v.mouthHalf * 0.6;
    const droop = 1 - f.bloom;
    const hx = f.x + Math.sin(f.bend) * f.rad * 1.2;
    const hy = f.y + droop * f.rad * 0.6 + f.rad * 0.5;
    ctx.strokeStyle = mix3([70, 96, 40], [96, 78, 36], droop);
    ctx.lineWidth = Math.max(2, f.rad * 0.14);
    ctx.beginPath();
    ctx.moveTo(mx, v.mouthY);
    ctx.quadraticCurveTo((mx + hx) * 0.5 + Math.sin(f.bend) * f.rad, (v.mouthY + hy) * 0.5, hx, hy);
    ctx.stroke();
  }

  // 화병 본체(윤곽 2~3획 + 채움)
  const cx = v.cx;
  ctx.beginPath();
  ctx.moveTo(cx - v.mouthHalf, v.mouthY);
  ctx.bezierCurveTo(cx - v.bodyHalf, v.mouthY + (v.tableY - v.mouthY) * 0.5,
    cx - v.bottomHalf, v.tableY, cx - v.bottomHalf, v.tableY);
  ctx.lineTo(cx + v.bottomHalf, v.tableY);
  ctx.bezierCurveTo(cx + v.bodyHalf, v.tableY, cx + v.bodyHalf, v.mouthY + (v.tableY - v.mouthY) * 0.5,
    cx + v.mouthHalf, v.mouthY);
  ctx.closePath();
  const grd = ctx.createLinearGradient(0, v.mouthY, 0, v.tableY);
  grd.addColorStop(0, "#f0d27a");
  grd.addColorStop(0.52, "#e6b94e");
  grd.addColorStop(0.54, "#b9822f");
  grd.addColorStop(1, "#9a6a26");
  ctx.fillStyle = grd; ctx.fill();
  // 윤곽 획
  ctx.strokeStyle = "#7a4e18"; ctx.lineWidth = Math.max(3, S * 0.009); ctx.stroke();
  // 입구 타원
  ctx.strokeStyle = "#7a4e18"; ctx.lineWidth = Math.max(2, S * 0.006);
  ctx.beginPath(); ctx.ellipse(cx, v.mouthY, v.mouthHalf, v.mouthHalf * 0.26, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#caa24a"; ctx.beginPath();
  ctx.ellipse(cx, v.mouthY, v.mouthHalf, v.mouthHalf * 0.26, 0, 0, Math.PI * 2); ctx.fill();
}

// ── 꽃가루 입자 ───────────────────────────────────────
function spawnPollen(x, y) {
  for (let i = 0; i < 20; i++) {
    pollen.push({
      x, y,
      vx: rnd(-90, 90),
      vy: -rnd(60, 210),                            // 위로 튀었다가 포물선 낙하
      life: 0, max: rnd(0.8, 1.6),
      size: rnd(1.4, 3.4),
    });
  }
  if (pollen.length > 220) pollen.splice(0, pollen.length - 220);
}
function updatePollen(dt) {
  for (let i = pollen.length - 1; i >= 0; i--) {
    const p = pollen[i];
    p.life += dt;
    if (p.life >= p.max) { pollen.splice(i, 1); continue; }
    p.vy += GRAVITY * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const a = 1 - p.life / p.max;
    ctx.fillStyle = `rgba(255,${210 + (a * 30) | 0},70,${(a * 0.9).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
}

// ── 입력: 클릭 개화 / 드래그 붓바람 ───────────────────
function handleInput(ptr) {
  if (ptr.justDown && ptr.inside) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < flowers.length; i++) {
      const f = flowers[i];
      const hy = f.y + (1 - f.bloom) * f.rad * 0.6;
      const hx = f.x + Math.sin(f.bend) * f.rad * 1.2;
      const d = Math.hypot(ptr.x - hx, ptr.y - hy);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0 && bestD < flowers[best].rad * 1.6) {
      const f = flowers[best];
      f.animating = true; f.animT = 0; f.animFrom = f.bloom;   // 1.2초 만개
      spawnPollen(f.x + Math.sin(f.bend) * f.rad * 1.2, f.y - f.rad * 0.2);
    }
  }
  // 드래그 = 붓바람: 커서 근처 꽃에 각속도 임펄스
  if (ptr.down && ptr.inside && (Math.abs(ptr.dx) > 0.1 || Math.abs(ptr.dy) > 0.1)) {
    const R = Math.min(W, H) * 0.42;
    const push = clamp(ptr.dx, -60, 60) * (reduced ? 0.0003 : 0.0011);
    for (const f of flowers) {
      const d = Math.hypot(ptr.x - f.x, ptr.y - f.y);
      if (d < R) f.bendVel += push * (1 - d / R);
    }
  }
}

// ── 꽃 물리/생애주기 갱신 ─────────────────────────────
function updateFlowers(dt) {
  for (const f of flowers) {
    const natural = 0.5 + 0.5 * Math.sin(T * f.cycleSpeed + f.phase);
    if (f.animating) {
      f.animT += dt;
      const k = Math.min(f.animT / 1.2, 1);
      const e = 1 - Math.pow(1 - k, 3);              // easeOutCubic
      f.bloom = f.animFrom + (1 - f.animFrom) * e;
      if (f.animT > 1.2 + 2.6) f.animating = false;  // 만개 유지 후 자연 사이클 복귀
    } else {
      f.bloom += (natural - f.bloom) * Math.min(dt * 1.4, 1);
    }
    // 붓바람 각도 스프링 복귀
    f.bendVel += (-9.0 * f.bend - 3.2 * f.bendVel) * dt;
    f.bend += f.bendVel * dt;
    f.bend = clamp(f.bend, -0.6, 0.6);
  }
}

// ── 모듈 인터페이스 ───────────────────────────────────
export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion; T = 0;
    pollen = [];
    makeFlowers();
    layout();
    bakeBackground();
  },
  tick(dt, ptr) {
    T += dt;
    // 배경(구운 임파스토)
    if (bg) ctx.drawImage(bg, 0, 0, W, H);
    else { ctx.fillStyle = "#c99a34"; ctx.fillRect(0, 0, W, H); }

    if (ptr) handleInput(ptr);
    updateFlowers(dt);

    drawVaseAndStems();

    // 유휴 흔들림 포함 렌더 각도로 뒤→앞(위→아래) 순서로 그림
    for (const i of order) {
      const f = flowers[i];
      const sway = (reduced ? 0.25 : 1) * 0.05 * Math.sin(T * 1.1 * f.wiggle + f.swayPhase);
      drawFlower(f, f.bend + sway);
    }

    updatePollen(dt);
  },
  resize(w, h) {
    W = w; H = h;
    layout();
    bakeBackground();
  },
  dispose() {
    ctx = null; bg = null; bgCtx = null;
    flowers = []; order = []; pollen = [];
  },
};
```

- [ ] **Step 2: 브라우저 검증** — 공통 검증 절차 수행. 추가 확인: 꽃마다 다른 위상의 개화/시듦 사이클 + 클릭한 꽃 만개·꽃가루 + 드래그 붓바람 휨.

- [ ] **Step 3: 커밋**

```bash
git add js/pieces/07-sunflowers.js
git commit -m "feat: 작품 07 — Sunflowers (임파스토 개화 사이클)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: 작품 08 — After Turner, Rain Steam and Speed

**Files:**
- Create: `js/pieces/08-rain-steam-speed.js`

**Interfaces:**
- Consumes: main.js 구동 규약(Task 5).
- Produces: 없음 (말단 작품 모듈).

- [ ] **Step 1: js/pieces/08-rain-steam-speed.js 작성**

```js
// js/pieces/08-rain-steam-speed.js
// After Turner — Rain, Steam and Speed (1844). 절차적.
// 금갈색 안개 유동장 속 대각선 철교와 다가오는 증기기관차.

let ctx = null, W = 0, H = 0, reduced = false, T = 0;

// 안개 입자 · 비 스트릭 · 기적 증기 뭉게
let fog = [], rain = [], puffs = [];
// 커서 속도 주입(유동장 교란)
let stir = { x: 0, y: 0, vx: 0, vy: 0, life: 0 };
// 화면 진동(기적)
let shake = 0;
// 기차 접근 위상(0..1, ~20초 루프)
let trainT = 0;
const LOOP = 20; // 초

// 소실점(중앙 약간 위)과 철교 기준선을 화면 비율로 잡는다
let vp = { x: 0, y: 0 };

// ---- 의사 노이즈 유동장: 사인 조합으로 curl 유사 흐름 ----
function flow(x, y, t) {
  const nx = x * 0.0018, ny = y * 0.0018;
  // 두 개의 스칼라장을 미분한 듯한 회전 벡터 (curl 근사)
  const a = Math.sin(nx * 1.7 + t * 0.25) + Math.cos(ny * 2.1 - t * 0.2);
  const b = Math.cos(nx * 2.3 - t * 0.18) + Math.sin(ny * 1.5 + t * 0.22);
  // 전체적으로 우하단→좌상 소용돌이 + 소실점으로 빨려드는 성분
  const dx = vp.x - x, dy = vp.y - y;
  const d = Math.hypot(dx, dy) + 1;
  const pull = 18 / d;
  return {
    x: (b - a) * 26 + dx * pull * 0.02 + 8,
    y: (a + b) * 20 + dy * pull * 0.02 - 6,
  };
}

function rnd(a, b) { return a + Math.random() * (b - a); }

function makeFog(n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    arr.push({
      x: Math.random() * W, y: Math.random() * H,
      r: rnd(40, 130),                 // 큰 반투명 덩어리
      hue: rnd(0, 1),                  // 황토~회갈 보간용
      a: rnd(0.04, 0.12),
      sp: rnd(0.6, 1.4),               // 유동장 반응 속도차
    });
  }
  return arr;
}

function makeRain(n) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(spawnRain());
  return arr;
}
function spawnRain() {
  return {
    x: rnd(-0.1 * W, 1.2 * W), y: rnd(-0.2 * H, H),
    len: rnd(14, 40), v: rnd(700, 1200), a: rnd(0.06, 0.18),
  };
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion; T = 0; trainT = 0.15; shake = 0;
    stir = { x: 0, y: 0, vx: 0, vy: 0, life: 0 };
    puffs = [];
    layout();
    fog = makeFog(fogCount());
    rain = makeRain(rainCount());
  },

  tick(dt, ptr) {
    T += dt;
    // 기차 위상 진행 (도착 후 다시 멀리서)
    trainT += dt / LOOP;
    if (trainT >= 1) trainT -= 1;

    // 드래그: 커서 속도를 유동장에 주입
    if (ptr && ptr.inside && ptr.down) {
      stir.x = ptr.x; stir.y = ptr.y;
      stir.vx = ptr.dx / Math.max(dt, 1e-3);
      stir.vy = ptr.dy / Math.max(dt, 1e-3);
      stir.life = 1;
    } else if (stir.life > 0) {
      stir.life -= dt * 1.6;
    }

    // 클릭: 기적 — 증기 뭉게 + 진동 1회
    if (ptr && ptr.justDown) whistle();

    if (shake > 0) shake = Math.max(0, shake - dt * 3);

    render(dt);
  },

  resize(w, h) {
    W = w; H = h; layout();
    // 개수 재조정(가벼운 재생성)
    fog = makeFog(fogCount());
    rain = makeRain(rainCount());
  },

  dispose() {
    ctx = null; fog = []; rain = []; puffs = [];
  },
};

// ---- 화면 비율에 맞춘 소실점/철교 좌표 ----
function layout() {
  vp.x = W * 0.5; vp.y = H * 0.42;
}

function fogCount() {
  // 200~300 (브리프), 화면 픽셀 수 기준 자동 조절
  const base = Math.round(W * H / 5200);
  return Math.max(200, Math.min(300, base));
}
function rainCount() {
  return Math.max(40, Math.min(60, Math.round(W / 24)));
}

// 기적: 굴뚝에서 밝은 입자 30개 상승 확산 + 진동
function whistle() {
  const tr = trainPose(trainT);
  for (let i = 0; i < 30; i++) {
    puffs.push({
      x: tr.stackX + rnd(-tr.s * 6, tr.s * 6),
      y: tr.stackY,
      vx: rnd(-20, 20), vy: rnd(-70, -30),
      r: rnd(6, 16) * (0.6 + tr.s), a: rnd(0.5, 0.85), life: 1,
    });
  }
  if (!reduced) shake = 1;
}

// 기차 자세: 위상 p(0=멀리, 1=도착직전 우하단 통과)
function trainPose(p) {
  // 소실점에서 우하단으로 향하는 경로를 따라 커진다
  const ex = W * 1.02, ey = H * 1.05;          // 화면 밖 도착점(우하단)
  const t = p;
  const x = vp.x + (ex - vp.x) * t;
  const y = vp.y + (ey - vp.y) * t;
  const s = 0.05 + t * t * 1.05;               // 원근 스케일(가까울수록 급증)
  return {
    x, y, s,
    stackX: x - 34 * s,                         // 굴뚝(진행방향 앞쪽)
    stackY: y - 30 * s,
    glow: t,                                    // 화실 글로우 강도
  };
}

// ---- 렌더 ----
function render(dt) {
  const ox = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
  const oy = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
  ctx.save();
  ctx.translate(ox, oy);

  drawBackground();
  // 잔상 트레일: 반투명 배경 덮기로 회화적 붓질감
  paintTrail();

  updateFog(dt);
  drawBridge();             // 안개 뒤 흐릿한 교각(먼저, 아래층)
  drawFog();                // 안개가 다리를 덮어 흐리게
  drawTrain();
  drawRain(dt);
  drawPuffs(dt);

  ctx.restore();
}

// 황토-금-회갈 방사 그라데이션
function drawBackground() {
  const g = ctx.createRadialGradient(vp.x, vp.y, 10, vp.x, vp.y, Math.max(W, H) * 0.9);
  g.addColorStop(0, "#f3d27a");
  g.addColorStop(0.35, "#c8a24e");
  g.addColorStop(0.7, "#8a6a3c");
  g.addColorStop(1, "#4a3a28");
  ctx.fillStyle = g;
  ctx.fillRect(-20, -20, W + 40, H + 40);
}

// 반투명 트레일 (붓질감) — 배경색 계열로 살짝 덮기
function paintTrail() {
  ctx.fillStyle = "rgba(120,95,55,0.08)";
  ctx.fillRect(-20, -20, W + 40, H + 40);
}

// 안개 입자를 유동장으로 이동
function updateFog(dt) {
  for (let i = 0; i < fog.length; i++) {
    const f = fog[i];
    const v = flow(f.x, f.y, T);
    let vx = v.x, vy = v.y;
    // 커서 교란: 근처 입자에 커서 속도 주입
    if (stir.life > 0) {
      const dx = f.x - stir.x, dy = f.y - stir.y;
      const d2 = dx * dx + dy * dy;
      const R = 160;
      if (d2 < R * R) {
        const k = (1 - Math.sqrt(d2) / R) * stir.life * (reduced ? 0.3 : 1);
        vx += stir.vx * 0.15 * k;
        vy += stir.vy * 0.15 * k;
      }
    }
    const mul = f.sp * (reduced ? 0.5 : 1) * dt;
    f.x += vx * mul; f.y += vy * mul;
    // 래핑
    if (f.x < -f.r) f.x = W + f.r; else if (f.x > W + f.r) f.x = -f.r;
    if (f.y < -f.r) f.y = H + f.r; else if (f.y > H + f.r) f.y = -f.r;
  }
}

// 안개 그리기: 큰 반투명 원, 황토~회갈 보간
function drawFog() {
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < fog.length; i++) {
    const f = fog[i];
    // hue: 0=금빛, 1=회갈
    const r = Math.round(214 - f.hue * 90);
    const g = Math.round(176 - f.hue * 86);
    const b = Math.round(110 - f.hue * 60);
    const grd = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
    grd.addColorStop(0, `rgba(${r},${g},${b},${f.a})`);
    grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

// 철교: 우하단→소실점 원근 사다리꼴 + 교각 아치
function drawBridge() {
  // 다리 상판: 우하단 넓게, 소실점에서 좁게
  const near = { x: W * 1.05, y: H * 0.92 };
  const far = { x: vp.x + W * 0.02, y: vp.y + H * 0.02 };
  const nw = W * 0.34;   // 근경 폭
  const fw = W * 0.02;   // 원경 폭
  // 상판 사다리꼴
  ctx.fillStyle = "rgba(46,34,24,0.85)";
  ctx.beginPath();
  ctx.moveTo(near.x, near.y - nw * 0.28);
  ctx.lineTo(near.x, near.y + nw * 0.14);
  ctx.lineTo(far.x, far.y + fw);
  ctx.lineTo(far.x, far.y - fw);
  ctx.closePath();
  ctx.fill();

  // 교각 아치 3개 (근경→원경으로 작아짐)
  ctx.strokeStyle = "rgba(38,28,20,0.8)";
  ctx.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    const t = 0.12 + k * 0.26;
    const bx = near.x + (far.x - near.x) * t;
    const by = near.y + (far.y - near.y) * t;
    const w = nw * (1 - t) * 0.5 + 6;
    const h = w * 1.1;
    ctx.fillStyle = `rgba(40,29,20,${0.75 - t * 0.4})`;
    // 교각 기둥
    ctx.fillRect(bx - w * 0.14, by, w * 0.28, H - by);
    // 아치
    ctx.beginPath();
    ctx.arc(bx, by + h, w * 0.5, Math.PI, 0);
    ctx.stroke();
  }
}

// 기차: 검은 덩어리 + 굴뚝 + 화실 글로우
function drawTrain() {
  const tr = trainPose(trainT);
  const s = tr.s;
  const bw = 90 * s, bh = 46 * s;

  // 화실(火室) 주황 글로우 — 접근할수록 강해짐
  const gl = 0.25 + tr.glow * 0.9;
  const gr = ctx.createRadialGradient(tr.x, tr.y, 0, tr.x, tr.y, bw * 1.6);
  gr.addColorStop(0, `rgba(255,150,40,${gl})`);
  gr.addColorStop(0.4, `rgba(230,90,20,${gl * 0.4})`);
  gr.addColorStop(1, "rgba(120,40,10,0)");
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.arc(tr.x, tr.y, bw * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  // 검은 기관차 덩어리(원근 방향으로 약간 기울인 사다리꼴 근사)
  ctx.fillStyle = "rgba(12,10,10,0.92)";
  ctx.beginPath();
  ctx.moveTo(tr.x - bw * 0.5, tr.y - bh * 0.5);
  ctx.lineTo(tr.x + bw * 0.5, tr.y - bh * 0.2);
  ctx.lineTo(tr.x + bw * 0.5, tr.y + bh * 0.5);
  ctx.lineTo(tr.x - bw * 0.5, tr.y + bh * 0.4);
  ctx.closePath();
  ctx.fill();

  // 굴뚝
  ctx.fillStyle = "rgba(8,7,7,0.95)";
  ctx.fillRect(tr.stackX - 7 * s, tr.stackY, 14 * s, 30 * s);

  // 화실 개구부(밝은 점)
  ctx.fillStyle = `rgba(255,190,90,${0.6 + tr.glow * 0.4})`;
  ctx.beginPath();
  ctx.arc(tr.x - bw * 0.25, tr.y + bh * 0.1, 6 * s + 2, 0, Math.PI * 2);
  ctx.fill();
}

// 비: 가는 사선 스트릭 우상→좌하 (안개색과 섞이는 따뜻한 톤)
function drawRain(dt) {
  ctx.lineWidth = 1;
  const dxu = -0.5, dyu = 1;            // 방향(좌하)
  const spd = reduced ? 0.4 : 1;
  for (let i = 0; i < rain.length; i++) {
    const r = rain[i];
    r.x += dxu * r.v * dt * spd;
    r.y += dyu * r.v * dt * spd;
    if (r.y > H + 40 || r.x < -40) {
      r.x = rnd(0, 1.2 * W); r.y = rnd(-0.2 * H, 0);
    }
    // 스트릭마다 알파가 달라야 하므로 개별 stroke
    ctx.strokeStyle = `rgba(235,214,164,${r.a})`;
    ctx.beginPath();
    ctx.moveTo(r.x, r.y);
    ctx.lineTo(r.x + dxu * r.len, r.y + dyu * r.len);
    ctx.stroke();
  }
}

// 기적 증기 뭉게(상승 확산)
function drawPuffs(dt) {
  ctx.globalCompositeOperation = "lighter";
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy *= 0.98; p.r += 22 * dt; p.life -= dt * 0.5;
    if (p.life <= 0) { puffs.splice(i, 1); continue; }
    const a = p.a * p.life;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    g.addColorStop(0, `rgba(255,245,220,${a})`);
    g.addColorStop(1, "rgba(240,220,180,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}
```

- [ ] **Step 2: 브라우저 검증** — 공통 검증 절차 수행. 추가 확인: 안개 유동장 잔상 트레일 + 기차 접근 루프(화실 글로우 증가) + 클릭 증기 뭉게.

- [ ] **Step 3: 커밋**

```bash
git add js/pieces/08-rain-steam-speed.js
git commit -m "feat: 작품 08 — Rain Steam and Speed (안개 유동장·기차)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 14: 작품 09 — After Michelangelo, Creation of Adam

**Files:**
- Create: `js/pieces/09-creation-of-adam.js`

**Interfaces:**
- Consumes: main.js 구동 규약(Task 5), `assets/targets/09-creation-of-adam.jpg`(Task 3).
- Produces: 없음 (말단 작품 모듈).

- [ ] **Step 1: js/pieces/09-creation-of-adam.js 작성**

```js
// js/pieces/09-creation-of-adam.js
// After Michelangelo — Creation of Adam (c.1512). 닿을 듯 닿지 않는 두 손끝의 간극에
// 커서를 가져가면 정전기가 충전되고, 간극을 이으면 생명의 불꽃이 방전된다.

const TWO_PI = Math.PI * 2;
const NEAR = 40;          // 손끝 선분 근접 판정(px)
const CHARGE_TIME = 1.5;  // 충전 완료 시간(초)
const IGNITE_TIME = 0.8;  // 대형 아크 방전 지속
const COOLDOWN_TIME = 3;  // 쿨다운
const WARM_TIME = 1.5;    // 이미지가 따뜻하게 밝아지는 시간

// 두 손끝 좌표(이미지 기준 u,v). 좌: 아담(아래에서), 우: 신(위에서)
const LEFT_UV = { u: 0.42, v: 0.52 };
const RIGHT_UV = { u: 0.58, v: 0.48 };

let W = 0, H = 0, ctx = null, T = 0, reduced = false;
let img = null, fresco = null, fit = { x: 0, y: 0, w: 0, h: 0 };
let A = { x: 0, y: 0 }, B = { x: 0, y: 0 }; // 좌/우 손끝 스크린 좌표

let phase = "ready";      // ready | ignite | cooldown
let charge = 0, igniteT = 0, cooldownT = 0, warmT = 99, warmth = 0;
let tMin = 1, tMax = 0, awayT = 0; // 경로 주파(traverse) 추적
let near = false;
let idleTimer = 3, idleFlash = 0; // 유휴 정전기
let gold = [];            // 금빛 입자 풀

// ---- 기하 헬퍼 ----
function containFit(iw, ih, w, h, margin) {
  const s = Math.min((w * (1 - margin * 2)) / iw, (h * (1 - margin * 2)) / ih);
  const bw = iw * s, bh = ih * s;
  return { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh };
}

// 점→선분 최근접 거리와 정규화 투영값 t(0..1)
function projSeg(px, py) {
  const dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - A.x) * dx + (py - A.y) * dy) / l2));
  return { t, dist: Math.hypot(px - (A.x + dx * t), py - (A.y + dy * t)) };
}

function computeTips() {
  if (img) {
    fit = containFit(img.naturalWidth || img.width, img.naturalHeight || img.height, W, H, 0.06);
    A = { x: fit.x + LEFT_UV.u * fit.w, y: fit.y + LEFT_UV.v * fit.h };
    B = { x: fit.x + RIGHT_UV.u * fit.w, y: fit.y + RIGHT_UV.v * fit.h };
  } else {
    const cx = W / 2, cy = H / 2, gap = Math.min(W, H) * 0.09;
    fit = { x: W * 0.1, y: H * 0.1, w: W * 0.8, h: H * 0.8 };
    A = { x: cx - gap, y: cy + gap * 0.5 }; // 아담: 아래에서
    B = { x: cx + gap, y: cy - gap * 0.5 }; // 신: 위에서
  }
}

// ---- 프레스코 질감: 노이즈 점 + 크랙 라인을 오프스크린에 한 번 굽는다 ----
function buildFresco(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  const g = c.getContext("2d");
  const dots = Math.min(9000, ((w * h) / 380) | 0);
  for (let i = 0; i < dots; i++) {
    const a = 0.03 + Math.random() * 0.06;
    g.fillStyle = Math.random() < 0.5 ? `rgba(255,250,238,${a})` : `rgba(88,72,56,${a})`;
    g.beginPath();
    g.arc(Math.random() * w, Math.random() * h, Math.random() < 0.85 ? 0.6 : 1.5, 0, TWO_PI);
    g.fill();
  }
  const cracks = 5 + (Math.random() * 4 | 0);
  for (let i = 0; i < cracks; i++) {
    let x = Math.random() * w, y = Math.random() * h, ang = Math.random() * TWO_PI;
    g.strokeStyle = `rgba(58,46,36,${0.06 + Math.random() * 0.05})`;
    g.lineWidth = 0.6 + Math.random() * 0.7;
    g.beginPath(); g.moveTo(x, y);
    const segs = 6 + (Math.random() * 8 | 0);
    for (let s = 0; s < segs; s++) {
      ang += (Math.random() - 0.5) * 1.1;
      x += Math.cos(ang) * (20 + Math.random() * 40);
      y += Math.sin(ang) * (20 + Math.random() * 40);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return c;
}
function ensureFresco() { if (!fresco) fresco = buildFresco(W, H); }

// ---- 절차적 두 손 실루엣 (이미지 null 폴백) ----
function drawArmHand(tipX, tipY, fromX, fromY, armW, fill, shade) {
  const dx = fromX - tipX, dy = fromY - tipY, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, px = -uy, py = ux;
  const hx = tipX + ux * armW * 1.4, hy = tipY + uy * armW * 1.4; // 손등 중심
  const grad = ctx.createLinearGradient(tipX, tipY, fromX, fromY);
  grad.addColorStop(0, fill); grad.addColorStop(1, shade);
  ctx.fillStyle = grad; ctx.strokeStyle = grad;
  ctx.lineWidth = armW; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(fromX, fromY); ctx.stroke();
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(Math.atan2(uy, ux));
  ctx.beginPath(); ctx.ellipse(0, 0, armW * 0.78, armW * 0.62, 0, 0, TWO_PI); ctx.fill(); ctx.restore();
  // 검지: 손등 → 손끝 (베지어 채움 실루엣)
  ctx.beginPath();
  ctx.moveTo(hx + px * armW * 0.28, hy + py * armW * 0.28);
  ctx.quadraticCurveTo((hx + tipX) / 2 + px * armW * 0.12, (hy + tipY) / 2 + py * armW * 0.12, tipX, tipY);
  ctx.quadraticCurveTo((hx + tipX) / 2 - px * armW * 0.12, (hy + tipY) / 2 - py * armW * 0.12,
    hx - px * armW * 0.28, hy - py * armW * 0.28);
  ctx.closePath(); ctx.fill();
  for (let i = 0; i < 3; i++) { // 말린 나머지 손가락
    const off = (i - 1) * armW * 0.34;
    ctx.beginPath();
    ctx.arc(hx + px * off - ux * armW * 0.22, hy + py * off - uy * armW * 0.22, armW * 0.22, 0, TWO_PI);
    ctx.fill();
  }
}
function drawProceduralHands() {
  const armW = Math.min(W, H) * 0.12;
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
  drawArmHand(A.x, A.y, -W * 0.05, H * 1.1, armW, "#c9a17a", "#7d5a3c");   // 아담(좌하단)
  drawArmHand(B.x, B.y, W * 1.05, -H * 0.05, armW * 1.04, "#d4ac86", "#8a6242"); // 신(우상단)
  ctx.restore();
}

// ---- 스파크(지지직 폴리라인) ----
function boltPoints(ax, ay, bx, by, segs, amp) {
  const pts = [{ x: ax, y: ay }];
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  for (let i = 1; i < segs; i++) {
    const t = i / segs, o = (Math.random() - 0.5) * amp * Math.sin(Math.PI * t); // 양끝 고정
    pts.push({ x: ax + dx * t + nx * o, y: ay + dy * t + ny * o });
  }
  pts.push({ x: bx, y: by });
  return pts;
}
function strokePoly(pts) {
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}
function drawBolt(ax, ay, bx, by, amp, width, color, glow, segs) {
  const pts = boltPoints(ax, ay, bx, by, segs, amp);
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.shadowColor = glow; ctx.shadowBlur = width * 4;
  ctx.strokeStyle = color; ctx.lineWidth = width; strokePoly(pts);
  ctx.shadowBlur = width * 2; // 밝은 코어
  ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = width * 0.4; strokePoly(pts);
  ctx.restore();
  return pts;
}
function drawChargeSparks(P) {
  const amp = (reduced ? 3 : 8) * (0.4 + charge), w = 1 + charge * 1.6;
  const col = `rgba(180,200,255,${0.5 + charge * 0.4})`, glow = "rgba(120,170,255,0.9)";
  for (const tip of [A, B]) {
    const main = drawBolt(tip.x, tip.y, P.x, P.y, amp, w, col, glow, 8 + (charge * 6 | 0));
    const nb = reduced ? 1 : 2; // 잔가지
    for (let i = 0; i < nb; i++) {
      const s = main[1 + (Math.random() * (main.length - 2) | 0)];
      drawBolt(s.x, s.y, s.x + (Math.random() - 0.5) * 44, s.y + (Math.random() - 0.5) * 44,
        amp * 0.6, w * 0.6, col, glow, 4);
    }
  }
}
function drawArcDischarge() {
  const fade = 1 - igniteT / IGNITE_TIME;
  const amp = (reduced ? 8 : 22) * (0.5 + fade * 0.8), w = 2.5 + fade * 3;
  const main = drawBolt(A.x, A.y, B.x, B.y, amp, w,
    `rgba(255,240,200,${0.6 + fade * 0.4})`, "rgba(255,210,120,1)", reduced ? 10 : 16);
  const nb = reduced ? 2 : 4;
  for (let i = 0; i < nb; i++) {
    const s = main[1 + (Math.random() * (main.length - 2) | 0)];
    drawBolt(s.x, s.y, s.x + (Math.random() - 0.5) * 70, s.y + (Math.random() - 0.5) * 70,
      amp * 0.7, w * 0.55, "rgba(255,236,190,0.85)", "rgba(255,200,110,0.9)", 5);
  }
}
function drawTipGlow() {
  for (const tip of [A, B]) {
    const r = (3 + charge * 4 + (phase === "ignite" ? 6 : 0)) * 3;
    const a = 0.22 + charge * 0.5 + (phase === "ignite" ? 0.3 : 0);
    const g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, r);
    g.addColorStop(0, `rgba(205,222,255,${a})`); g.addColorStop(1, "rgba(205,222,255,0)");
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tip.x, tip.y, r, 0, TWO_PI); ctx.fill(); ctx.restore();
  }
}

// ---- 금빛 입자 ----
function spawnGold(n, x, y) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TWO_PI, sp = (reduced ? 30 : 60) + Math.random() * (reduced ? 60 : 170);
    gold.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.8 + Math.random() * 1.3, size: 1 + Math.random() * 2.5 });
  }
}
function stepGold(dt) {
  for (let i = gold.length - 1; i >= 0; i--) {
    const p = gold[i]; p.life += dt;
    if (p.life >= p.max) { gold.splice(i, 1); continue; }
    p.vx *= 0.96; p.vy *= 0.96; p.vy += 22 * dt; // 약한 중력
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
}
function drawGold() {
  if (!gold.length) return;
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (const p of gold) {
    const k = 1 - p.life / p.max;
    ctx.fillStyle = `rgba(255,${190 + (60 * k | 0)},${90 + (70 * k | 0)},${k})`;
    ctx.shadowColor = "rgba(255,200,120,0.9)"; ctx.shadowBlur = 6 * k + 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * k + 0.4, 0, TWO_PI); ctx.fill();
  }
  ctx.restore();
}

// ---- 상태 전이 ----
function envelope(t) {
  if (t < 0.2) return t / 0.2;
  if (t < 0.8) return 1;
  if (t < WARM_TIME) return 1 - (t - 0.8) / (WARM_TIME - 0.8);
  return 0;
}
function ignite() {
  phase = "ignite"; igniteT = 0; warmT = 0; charge = 1;
  spawnGold(reduced ? 40 : 110, (A.x + B.x) / 2, (A.y + B.y) / 2);
}
function updateState(dt, P) {
  near = false; let t = 0;
  if (P) { const r = projSeg(P.x, P.y); near = r.dist < NEAR; t = r.t; }
  if (phase === "ready") {
    if (near) {
      charge = Math.min(1, charge + dt / CHARGE_TIME);
      tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); awayT = 0;
    } else {
      charge = Math.max(0, charge - dt * 0.9);
      awayT += dt; if (awayT > 0.4) { tMin = 1; tMax = 0; }
    }
    if (charge >= 1 || (near && tMin < 0.12 && tMax > 0.88)) ignite();
    idleTimer -= dt; if (idleFlash > 0) idleFlash -= dt;
    if (idleTimer <= 0) { idleFlash = 0.1 + Math.random() * 0.12; idleTimer = 2 + Math.random() * 3; }
  } else if (phase === "ignite") {
    warmT += dt; igniteT += dt;
    if (igniteT >= IGNITE_TIME) { phase = "cooldown"; cooldownT = 0; charge = 0; }
  } else {
    warmT += dt; cooldownT += dt; charge = Math.max(0, charge - dt * 2);
    if (cooldownT >= COOLDOWN_TIME) { phase = "ready"; tMin = 1; tMax = 0; }
  }
  warmth = envelope(warmT);
}
function drawWarmth() {
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, rad = Math.max(fit.w, fit.h) * 0.6;
  const g = ctx.createRadialGradient(mx, my, 0, mx, my, rad);
  g.addColorStop(0, `rgba(255,214,150,${warmth * 0.5})`); g.addColorStop(1, "rgba(255,214,150,0)");
  ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion;
    img = (opts.assets && opts.assets.target) || null;
    T = 0; phase = "ready"; charge = 0; igniteT = 0; cooldownT = 0; warmT = 99; warmth = 0;
    tMin = 1; tMax = 0; awayT = 0; near = false;
    idleTimer = 2 + Math.random() * 3; idleFlash = 0; gold = []; fresco = null;
    computeTips();
  },

  tick(dt, ptr) {
    T += dt;
    ensureFresco();
    // 배경: 프레스코 크림-회색
    ctx.fillStyle = "#d8cfbd"; ctx.fillRect(0, 0, W, H);
    // 이미지 contain-fit 또는 절차적 두 손
    if (img) ctx.drawImage(img, fit.x, fit.y, fit.w, fit.h);
    else drawProceduralHands();
    // 프레스코 질감 오버레이
    if (fresco) { ctx.globalAlpha = 0.55; ctx.drawImage(fresco, 0, 0); ctx.globalAlpha = 1; }

    const P = ptr && ptr.inside ? ptr : null;
    updateState(dt, P);
    if (warmth > 0.001) drawWarmth(); // 이미지가 따뜻하게 밝아짐

    // 효과 렌더
    if (phase === "ready") {
      if (P && near && charge > 0.01) drawChargeSparks(P);
      else if (idleFlash > 0) // 유휴 미세 정전기
        drawBolt(A.x, A.y, B.x, B.y, reduced ? 2 : 5, 0.8,
          `rgba(170,190,255,${Math.min(0.45, idleFlash * 3)})`, "rgba(120,170,255,0.7)", 6);
    } else if (phase === "ignite") {
      drawArcDischarge();
    }
    stepGold(dt); drawGold();
    drawTipGlow();
  },

  resize(w, h) { W = w; H = h; fresco = null; computeTips(); },

  dispose() { ctx = null; img = null; fresco = null; gold = []; },
};
```

- [ ] **Step 2: 브라우저 검증** — 공통 검증 절차 수행. 추가 확인: 손끝 사이 커서 접근 시 스파크 충전 + 간극 잇기/충전 완료 시 대형 방전 + 쿨다운.

- [ ] **Step 3: 커밋**

```bash
git add js/pieces/09-creation-of-adam.js
git commit -m "feat: 작품 09 — Creation of Adam (생명의 불꽃 방전)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 15: 작품 10 — After Bruegel, Tower of Babel

**Files:**
- Create: `js/pieces/10-tower-of-babel.js`

**Interfaces:**
- Consumes: main.js 구동 규약(Task 5).
- Produces: 없음 (말단 작품 모듈).

- [ ] **Step 1: js/pieces/10-tower-of-babel.js 작성**

```js
// js/pieces/10-tower-of-babel.js
// After Bruegel — Tower of Babel (1563). 절차적 나선 원뿔 탑: 끝없는 건설과 붕괴.

let W = 0, H = 0, ctx = null, reduced = false, T = 0;
let cx = 0, groundY = 0;              // 탑 밑동 화면 앵커
let camS = 1, camTarget = 1;         // 탑이 높아지면 서서히 축소
let tiers = [];   // tiers[t] = { cap, filled[], n, order[] }
let blocks = [];  // 개별 블록 {t, i, cap, r, g, b, oy, vy, state}
let debris = [];  // 붕괴 파편(월드 물리) / dust: 흙먼지 / clouds: 구름
let dust = [], clouds = [];
let buildTimer = 0, buildInterval = 2.5, heldTime = 0, collapseDone = false;

const BRICK = [168, 103, 74];        // #a8674a
const FLATTEN = 0.34;                // 원근 납작 타원 ry/rx
const SPIRAL = 0.20;                 // 층마다 나선 오프셋
const G = 1650;                      // 중력(월드/s^2)

const rand = (a, b) => a + Math.random() * (b - a);
const baseRx = () => Math.min(W, H) * 0.30;
const tierH = () => baseRx() * 0.17;
const rxAt = (t) => baseRx() * Math.max(0.28, 1 - 0.03 * t);
const baseAngle = (t) => t * SPIRAL;
const capAt = (t) => Math.max(5, Math.min(40, Math.round((2 * Math.PI * rxAt(t)) / (baseRx() * 0.30))));

// --- 층 생성: 그리기 순서를 뒤(sin<0)→앞(sin>0)으로 미리 정렬 ---
function ensureTier(t) {
  while (tiers.length <= t) {
    const cap = capAt(tiers.length), ba = baseAngle(tiers.length), order = [];
    for (let i = 0; i < cap; i++) order.push(i);
    order.sort((p, q) => Math.sin(ba + p * 6.283 / cap) - Math.sin(ba + q * 6.283 / cap));
    tiers.push({ cap, filled: new Array(cap).fill(false), n: 0, order });
  }
}

// --- 블록 배치(위에서 낙하) ---
function placeSlot(t, i) {
  ensureTier(t);
  const tier = tiers[t];
  if (tier.filled[i]) return;
  tier.filled[i] = true; tier.n++;
  const th = tierH(), v = () => (Math.random() * 32 - 16) | 0;
  blocks.push({
    t, i, cap: tier.cap, r: BRICK[0] + v(), g: BRICK[1] + v(), b: BRICK[2] + v(),
    oy: reduced ? -th * 1.2 : -(th * 6 + rand(0, th * 4)), vy: 0, state: "falling",
  });
}

// 자동 건설: 가장 낮은 미완성 층의 다음 빈 슬롯(링 채운 뒤 상승)
function placeNextAuto() {
  ensureTier(0);
  let t = 0;
  while (t < tiers.length && tiers[t].n >= tiers[t].cap) t++;
  ensureTier(t);
  for (let i = 0; i < tiers[t].cap; i++) if (!tiers[t].filled[i]) { placeSlot(t, i); return; }
}

// 클릭 건설: 클릭 지점 근처 층/각도의 빈 슬롯
function placeNear(sx, sy) {
  const th = tierH();
  let t = Math.max(0, Math.min(Math.round(-(sy - groundY) / camS / th - 0.5), tiers.length));
  ensureTier(t);
  while (tiers[t] && tiers[t].n >= tiers[t].cap) { t++; ensureTier(t); }
  const tier = tiers[t], da = 6.283 / tier.cap, ba = baseAngle(t);
  const hint = Math.acos(Math.max(-1, Math.min(1, (sx - cx) / camS / rxAt(t)))); // 0..PI 앞면
  let best = -1, bestD = 9;
  for (let i = 0; i < tier.cap; i++) {
    if (tier.filled[i]) continue;
    const a = ba + i * da, d = Math.abs(Math.atan2(Math.sin(a - hint), Math.cos(a - hint)));
    if (d < bestD) { bestD = d; best = i; }
  }
  if (best >= 0) placeSlot(t, best);
}

// --- 붕괴: 누른 지점 위쪽 층을 파편으로 무너뜨림(+흙먼지) ---
function collapseAt(sy) {
  if (!tiers.length) return;
  const th = tierH();
  const from = Math.max(0, Math.min(Math.round(-(sy - groundY) / camS / th - 0.5), tiers.length - 1));
  for (const b of blocks) {
    if (b.t < from) continue;
    const rx = rxAt(b.t), ry = rx * FLATTEN, a = baseAngle(b.t) + b.i * 6.283 / b.cap;
    debris.push({
      x: rx * Math.cos(a), y: -b.t * th + ry * Math.sin(a) + b.oy,
      vx: rand(-220, 220), vy: rand(-60, 40), r: b.r, g: b.g, b: b.b,
      w: rx * 0.5, h: th * 0.9, rot: rand(0, 6.28),
      vrot: reduced ? rand(-1, 1) : rand(-5, 5), life: -1, landed: false,
    });
  }
  blocks = blocks.filter((b) => b.t < from);
  tiers.length = from;                                   // 탑 높이 감소
  const n = reduced ? 10 : 26, dyc = -from * th, R = baseRx();
  for (let k = 0; k < n; k++) dust.push({
    x: rand(-R * 0.5, R * 0.5), y: dyc + rand(-th, th), vx: rand(-70, 70),
    vy: rand(-90, -20), rad: rand(R * 0.08, R * 0.22), life: rand(0.9, 1.8), age: 0,
  });
}

function initClouds() {
  clouds = [];
  const n = 3 + (Math.random() * 2 | 0);
  for (let i = 0; i < n; i++) clouds.push({
    x: rand(0, W), y: rand(H * 0.08, H * 0.42), s: rand(0.7, 1.5),
    spd: rand(4, 12) * (Math.random() < 0.5 ? -1 : 1),
  });
}

// --- 업데이트 ---
function update(dt, ptr) {
  T += dt;
  for (const c of clouds) {                              // 구름 표류
    c.x += c.spd * dt * (reduced ? 0.4 : 1);
    const m = 140 * c.s;
    if (c.x < -m) c.x = W + m; else if (c.x > W + m) c.x = -m;
  }
  // 입력: 짧게=클릭 건설 / 길게(>1.2s)=붕괴
  if (ptr.justDown) collapseDone = false;
  if (ptr.down) {
    heldTime = ptr.downTime;
    if (ptr.downTime > 1.2 && !collapseDone) { collapseAt(ptr.y); collapseDone = true; }
  }
  if (ptr.justUp && !collapseDone && heldTime <= 1.2 && ptr.inside) {
    const n = 3 + (Math.random() * 3 | 0);               // 3~5개
    for (let k = 0; k < n; k++) placeNear(ptr.x + rand(-8, 8), ptr.y + rand(-6, 6));
  }
  buildTimer += dt;                                      // 자동 건설(2~3s)
  if (buildTimer >= buildInterval) { buildTimer = 0; buildInterval = rand(2, 3); placeNextAuto(); }
  for (const b of blocks) {                              // 낙하 안착(살짝 튕김)
    if (b.state !== "falling") continue;
    b.vy += G * dt; b.oy += b.vy * dt;
    if (b.oy >= 0) {
      b.oy = 0;
      if (!reduced && b.vy > 260) b.vy = -b.vy * 0.28;
      else { b.vy = 0; b.state = "settled"; }
    }
  }
  const rest = reduced ? 0.1 : 0.4;                      // 파편 물리(바닥 y=0 튕김)
  for (const d of debris) {
    d.vy += G * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vrot * dt;
    if (d.y >= 0) {
      d.y = 0;
      if (Math.abs(d.vy) > 120) { d.vy = -d.vy * rest; d.vx *= 0.7; d.vrot *= 0.6; }
      else { d.vy = 0; d.vx *= 0.9; }
      if (!d.landed) { d.landed = true; d.life = 1.5; }  // 착지 1.5s 후 페이드
    }
    if (d.landed) d.life -= dt;
  }
  debris = debris.filter((d) => d.life === -1 || d.life > 0);
  for (const p of dust) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 30 * dt; p.rad += 24 * dt; }
  dust = dust.filter((p) => p.age < p.life);
  // 카메라: 탑 전체가 보이도록 축소
  const towerH = Math.max(tierH() * 4, tiers.length * tierH());
  camTarget = Math.min(1, (H * 0.66) / towerH, (W * 0.92) / (2 * baseRx()));
  camS += (camTarget - camS) * Math.min(1, dt * 2.2);
}

// --- 렌더 ---
function drawSky() {
  const horizon = H * 0.62, g = ctx.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, "#b9b2a6"); g.addColorStop(1, "#cdd2d6");  // 웜 그레이→청회
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, horizon);
  for (const c of clouds) {                              // 구름
    ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = "#eef0f0";
    const r = 26 * c.s;
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.ellipse(c.x + k * r * 0.9, c.y + Math.abs(k) * r * 0.18, r * (1.3 - Math.abs(k) * 0.18), r * 0.7, 0, 0, 6.283);
      ctx.fill();
    }
    ctx.restore();
  }
  const gg = ctx.createLinearGradient(0, horizon, 0, H);  // 지면
  gg.addColorStop(0, "#8f8f70"); gg.addColorStop(1, "#5c5a44");
  ctx.fillStyle = gg; ctx.fillRect(0, horizon, W, H - horizon);
}

function drawBlock(b, th) {
  const rx = rxAt(b.t), ry = rx * FLATTEN, da = 6.283 / b.cap, a = baseAngle(b.t) + b.i * da;
  const aL = a - da * 0.5, aR = a + da * 0.5, yT = -(b.t + 1) * th + b.oy, yB = -b.t * th + b.oy;
  const X = (g) => rx * Math.cos(g), Y = (cy, g) => cy + ry * Math.sin(g);
  const k = Math.max(0.45, Math.min(1.15, 0.62 + 0.30 * Math.cos(a + 2.2) + 0.12 * Math.sin(a)));
  ctx.fillStyle = `rgb(${b.r * k | 0},${b.g * k | 0},${b.b * k | 0})`;
  ctx.beginPath();
  ctx.moveTo(X(aL), Y(yT, aL)); ctx.lineTo(X(aR), Y(yT, aR));
  ctx.lineTo(X(aR), Y(yB, aR)); ctx.lineTo(X(aL), Y(yB, aL)); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(40,24,16,0.35)"; ctx.lineWidth = 0.6; ctx.stroke();
}

function drawTower() {
  const th = tierH();
  ctx.save(); ctx.translate(cx, groundY); ctx.scale(camS, camS);
  for (const d of debris) {                              // 파편(뒤)
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
    ctx.globalAlpha = d.life === -1 ? 1 : Math.max(0, d.life / 1.5);
    ctx.fillStyle = `rgb(${d.r},${d.g},${d.b})`;
    ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h); ctx.restore();
  }
  ctx.globalAlpha = 1;
  const byTier = [];                                     // 층별 그룹
  for (const b of blocks) (byTier[b.t] || (byTier[b.t] = [])).push(b);
  for (let t = 0; t < byTier.length; t++) {              // 아래→위, 뒤→앞
    const arr = byTier[t]; if (!arr) continue;
    if (tiers[t]) {
      const rank = {}; tiers[t].order.forEach((i, r) => (rank[i] = r));
      arr.sort((p, q) => rank[p.i] - rank[q.i]);
    }
    for (const b of arr) drawBlock(b, th);
  }
  for (const p of dust) {                                // 흙먼지(앞)
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life) * 0.5;
    ctx.fillStyle = "#8a7a63";
    ctx.beginPath(); ctx.arc(p.x, p.y, p.rad, 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.restore();
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height; reduced = !!opts.reducedMotion; T = 0;
    tiers = []; blocks = []; debris = []; dust = [];
    buildTimer = 0; buildInterval = rand(2, 3); heldTime = 0; collapseDone = false;
    camS = 1; camTarget = 1; cx = W * 0.5; groundY = H * 0.80;
    initClouds();
    for (let t = 0; t < 3; t++) {                        // 밑동 몇 층 미리 세움
      const cap = capAt(t); ensureTier(t);
      for (let i = 0; i < cap; i++) {
        placeSlot(t, i);
        const b = blocks[blocks.length - 1];
        if (b) { b.oy = 0; b.vy = 0; b.state = "settled"; }
      }
    }
  },
  tick(dt, ptr) { update(dt, ptr); drawSky(); drawTower(); },
  resize(w, h) { W = w; H = h; cx = W * 0.5; groundY = H * 0.80; },
  dispose() { ctx = null; tiers = []; blocks = []; debris = []; dust = []; clouds = []; },
};
```

- [ ] **Step 2: 브라우저 검증** — 공통 검증 절차 수행. 추가 확인: 블록 자동 건설(낙하 안착) + 클릭 증축 + 1.2초 이상 길게 누르면 붕괴 후에도 건설 지속.

- [ ] **Step 3: 커밋**

```bash
git add js/pieces/10-tower-of-babel.js
git commit -m "feat: 작품 10 — Tower of Babel (끝없는 건설과 붕괴)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 16: 작품 11 — After Kandinsky, Composition VIII

**Files:**
- Create: `js/pieces/11-composition-viii.js`

**Interfaces:**
- Consumes: main.js 구동 규약(Task 5).
- Produces: 없음 (말단 작품 모듈).

- [ ] **Step 1: js/pieces/11-composition-viii.js 작성**

```js
// js/pieces/11-composition-viii.js
// After Kandinsky — Composition VIII (1923). 절차적 기하 도형 + WebAudio.
// 크림색 캔버스 위 칸딘스키 어휘의 도형들이 부유·회전하고, 클릭하면 악기처럼 울린다.

let ctx = null, W = 0, H = 0, S = 0, T = 0, reduced = false;
let audio = null, actx = null, audioTried = false;
let shapes = [], ripples = [], trail = [];
let minM = 1, maxM = 1;
let tex = null;              // 캐시된 미세 텍스처 오프스크린
let wasDown = false;

// 팔레트
const INK = "#1a1a1a", RED = "#d4452f", BLU = "#2b5aa0", YEL = "#e8b430", PUR = "#7a4a8f";
const CREAM = "#ece5d3";
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// 파형 매핑 (도형 종류별)
function waveOf(type) {
  if (type === "triangle") return "triangle";
  if (type === "line") return "square";
  if (type === "checker") return "square";
  return "sine"; // circle, arc
}

// 도형 스펙 생성: 정규화 좌표(nx,ny)로 저장 → 리사이즈 시 픽셀 재계산
function buildShapes() {
  const list = [];
  // 대형 동심원 2개 (보라/검정/주황 겹)
  list.push({ type: "circle", nx: 0.24, ny: 0.30, rf: 0.12,
    discs: [{ r: 1.0, c: PUR }, { r: 0.64, c: INK }, { r: 0.32, c: YEL }] });
  list.push({ type: "circle", nx: 0.72, ny: 0.66, rf: 0.10,
    discs: [{ r: 1.0, c: INK }, { r: 0.66, c: RED }, { r: 0.30, c: CREAM }] });
  // 소형 원 4개
  const smalls = [[0.50, 0.18, RED], [0.85, 0.24, BLU], [0.13, 0.72, YEL], [0.60, 0.44, PUR]];
  for (const [x, y, c] of smalls) list.push({ type: "circle", nx: x, ny: y, rf: rand(0.024, 0.038),
    discs: [{ r: 1.0, c }, { r: 0.5, c: INK }] });
  // 예각 삼각형 3개
  list.push({ type: "triangle", nx: 0.42, ny: 0.62, rf: 0.10, c: BLU });
  list.push({ type: "triangle", nx: 0.80, ny: 0.40, rf: 0.075, c: YEL });
  list.push({ type: "triangle", nx: 0.30, ny: 0.85, rf: 0.065, c: RED });
  // 사선 직선 다발 4개
  const lines = [[0.55, 0.72, -0.7], [0.66, 0.30, 0.5], [0.18, 0.50, 1.2], [0.90, 0.80, -0.3]];
  for (const [x, y, a] of lines) list.push({ type: "line", nx: x, ny: y, rf: rand(0.16, 0.24), ang0: a,
    c: Math.random() < 0.5 ? INK : pick([RED, BLU]) });
  // 호(arc) 2개
  list.push({ type: "arc", nx: 0.36, ny: 0.20, rf: 0.11, a0: 0.2, a1: 2.6, c: RED });
  list.push({ type: "arc", nx: 0.68, ny: 0.86, rf: 0.09, a0: 3.4, a1: 5.6, c: BLU });
  // 체크 격자 작은 사각형 1묶음
  list.push({ type: "checker", nx: 0.92, ny: 0.52, rf: 0.020, c: INK });

  // 공통 초기 상태 부여
  for (const s of list) {
    s.pph = rand(0, 6.28); s.pph2 = rand(0, 6.28);
    s.ds = rand(0.18, 0.42); s.ds2 = rand(0.18, 0.42);
    s.rot = rand(0, 6.28); s.rotSpeed = rand(-0.12, 0.12);
    s.ang = s.ang0 || 0;
    s.scale = 1; s.sv = 0;                 // 펄스 스프링
    s.px = 0; s.py = 0; s.pvx = 0; s.pvy = 0; // 회피 밀림
    s.dx = 0; s.dy = 0;
  }
  return list;
}

// 픽셀 좌표/크기 재계산 + 주파수 매핑 범위 산출
function layout() {
  S = Math.min(W, H);
  minM = Infinity; maxM = -Infinity;
  for (const s of shapes) {
    s.x = s.nx * W; s.y = s.ny * H;
    s.size = s.rf * S;
    s.metric = s.type === "line" ? s.size * 0.42 : s.type === "checker" ? s.size * 2 : s.size;
    if (s.metric < minM) minM = s.metric;
    if (s.metric > maxM) maxM = s.metric;
  }
  if (maxM <= minM) maxM = minM + 1;
  buildTexture();
}

// 종이질감: 크림 배경 + 미세 반점 (init/resize에서 1회 캐시)
function buildTexture() {
  const c = document.createElement("canvas");
  c.width = Math.max(1, W | 0); c.height = Math.max(1, H | 0);
  const g = c.getContext("2d");
  g.fillStyle = CREAM; g.fillRect(0, 0, c.width, c.height);
  const n = ((W * H) / 900) | 0;
  for (let i = 0; i < n; i++) {
    const dark = Math.random() < 0.5;
    g.fillStyle = dark ? "rgba(80,70,55,0.05)" : "rgba(255,255,255,0.06)";
    g.fillRect(Math.random() * c.width, Math.random() * c.height, 1.4, 1.4);
  }
  tex = c;
}

// 현재 렌더 중심 (기준 + 부유 드리프트 + 회피 밀림)
function cx(s) { return s.x + s.dx + s.px; }
function cy(s) { return s.y + s.dy + s.py; }

// 히트 테스트: 도형별 근사
function hit(s, x, y) {
  const dx = x - cx(s), dy = y - cy(s);
  if (s.type === "line") {
    // 세그먼트까지 거리
    const a = s.rot + s.ang, hx = Math.cos(a) * s.size * 0.5, hy = Math.sin(a) * s.size * 0.5;
    const len2 = hx * hx + hy * hy || 1;
    let t = clamp((dx * hx + dy * hy) / len2, -1, 1);
    const px = dx - hx * t, py = dy - hy * t;
    return Math.hypot(px, py) < 10 + s.size * 0.03;
  }
  const d = Math.hypot(dx, dy);
  if (s.type === "checker") return d < s.size * 2.4;
  if (s.type === "arc") return Math.abs(d - s.size) < s.size * 0.22;
  return d < s.size * (s.type === "triangle" ? 0.7 : 1.0);
}

// 오디오: 첫 justDown에서 생성, 음소거면 skip
function ensureAudio() {
  if (audioTried) return;
  audioTried = true;
  if (!audio || !audio.enabled()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    actx = new AC();
  } catch (e) { actx = null; }
}
function playTone(s) {
  if (!actx) return;
  if (actx.state === "suspended") actx.resume();
  const t = (s.metric - minM) / (maxM - minM);
  const freq = clamp(180 + (1 - t) * 700, 180, 880);
  const now = actx.currentTime;
  const osc = actx.createOscillator(), g = actx.createGain();
  osc.type = waveOf(s.type);
  osc.frequency.setValueAtTime(freq, now);
  g.gain.setValueAtTime(0.08, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
  osc.connect(g).connect(actx.destination);
  osc.start(now); osc.stop(now + 0.42);
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion; audio = opts.audio || null;
    T = 0; ripples = []; trail = []; wasDown = false;
    audioTried = false; actx = null;
    shapes = buildShapes();
    layout();
  },

  tick(dt, ptr) {
    T += dt;
    const ampK = (reduced ? 0.5 : 1) * 0.015 * S;

    // 입력 반영
    if (ptr) {
      if (ptr.justDown) ensureAudio();
      // 드래그 궤적 수집
      if (ptr.down && ptr.inside) {
        const ns = !wasDown; // 스트로크 시작이면 이전 점과 잇지 않음
        const last = trail[trail.length - 1];
        if (ns || !last || Math.hypot(ptr.x - last.x, ptr.y - last.y) > 3)
          trail.push({ x: ptr.x, y: ptr.y, age: 0, gap: ns });
      }
      // 클릭 = 최상단 도형 펄스 + 톤 + 파문
      if (ptr.justDown && ptr.inside) {
        for (let i = shapes.length - 1; i >= 0; i--) {
          if (hit(shapes[i], ptr.x, ptr.y)) {
            const s = shapes[i];
            s.scale = 1.3;
            playTone(s);
            ripples.push({ x: ptr.x, y: ptr.y, r: s.size * 0.3, life: 1, c: s.discs ? s.discs[0].c : s.c });
            break;
          }
        }
      }
      wasDown = ptr.down;
    }

    // 시뮬레이션: 부유 드리프트 · 회전 · 펄스/회피 스프링
    for (const s of shapes) {
      s.dx = Math.sin(T * s.ds + s.pph) * ampK;
      s.dy = Math.cos(T * s.ds2 + s.pph2) * ampK;
      s.rot += s.rotSpeed * dt;
      // 펄스 스프링 (→1 복귀)
      s.sv += (60 * (1 - s.scale) - 12 * s.sv) * dt;
      s.scale += s.sv * dt;
      // 커서 반경 80px 회피 (구동형 스프링)
      let fx = 0, fy = 0;
      if (ptr && ptr.inside) {
        const ddx = cx(s) - ptr.x, ddy = cy(s) - ptr.y;
        const d = Math.hypot(ddx, ddy);
        if (d < 80) { const f = ((80 - d) / 80) * 900; fx = (ddx / (d || 1)) * f; fy = (ddy / (d || 1)) * f; }
      }
      s.pvx += (fx - 45 * s.px - 9 * s.pvx) * dt;
      s.pvy += (fy - 45 * s.py - 9 * s.pvy) * dt;
      s.px += s.pvx * dt; s.py += s.pvy * dt;
    }

    // 파문 · 궤적 수명
    for (const rp of ripples) { rp.r += 220 * dt; rp.life -= dt / 0.8; }
    ripples = ripples.filter((rp) => rp.life > 0);
    for (const p of trail) p.age += dt;
    trail = trail.filter((p) => p.age < 2);

    // ── 렌더 ──
    if (tex) ctx.drawImage(tex, 0, 0); else { ctx.fillStyle = CREAM; ctx.fillRect(0, 0, W, H); }
    for (const s of shapes) drawShape(s);
    drawRipples();
    drawTrail();
  },

  resize(w, h) { W = w; H = h; layout(); },

  dispose() {
    if (actx) { try { actx.close(); } catch (e) {} }
    actx = null; audio = null; ctx = null;
    shapes = []; ripples = []; trail = []; tex = null;
  },
};

function drawShape(s) {
  ctx.save();
  ctx.translate(cx(s), cy(s));
  ctx.rotate(s.rot);
  ctx.scale(s.scale, s.scale);
  const R = s.size;
  if (s.type === "circle") {
    for (const d of s.discs) { ctx.fillStyle = d.c; ctx.beginPath(); ctx.arc(0, 0, R * d.r, 0, 6.2832); ctx.fill(); }
  } else if (s.type === "triangle") {
    ctx.fillStyle = s.c;
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.65); ctx.lineTo(-R * 0.4, R * 0.45); ctx.lineTo(R * 0.42, R * 0.4);
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = Math.max(1, R * 0.02); ctx.strokeStyle = INK; ctx.stroke();
  } else if (s.type === "line") {
    ctx.rotate(s.ang);
    ctx.lineCap = "round";
    const lw = Math.max(1, S * 0.004);
    const gap = R * 0.05;
    for (let k = -1; k <= 1; k++) {
      ctx.strokeStyle = k === 0 ? s.c : INK;
      ctx.lineWidth = k === 0 ? lw * 1.4 : lw * 0.7;
      ctx.beginPath(); ctx.moveTo(-R * 0.5, k * gap); ctx.lineTo(R * 0.5, k * gap); ctx.stroke();
    }
  } else if (s.type === "arc") {
    ctx.strokeStyle = s.c; ctx.lineWidth = Math.max(2, R * 0.09); ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(0, 0, R, s.a0, s.a1); ctx.stroke();
  } else if (s.type === "checker") {
    const c = R, n = 3, off = -(n * c) / 2 + c / 2;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if ((i + j) % 2 === 0) { ctx.fillStyle = s.c; ctx.fillRect(off + i * c - c / 2, off + j * c - c / 2, c, c); }
    }
  }
  ctx.restore();
}

function drawRipples() {
  for (const rp of ripples) {
    ctx.globalAlpha = clamp(rp.life, 0, 1) * 0.7;
    ctx.strokeStyle = rp.c; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r, 0, 6.2832); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawTrail() {
  ctx.lineWidth = 1.3; ctx.strokeStyle = INK; ctx.lineCap = "round";
  for (let i = 1; i < trail.length; i++) {
    const p = trail[i], q = trail[i - 1];
    if (p.gap) continue;
    ctx.globalAlpha = (1 - p.age / 2) * 0.55;
    ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
```

- [ ] **Step 2: 브라우저 검증** — 공통 검증 절차 수행. 추가 확인: 도형 클릭 펄스 + 파문(사운드 토글 OFF 기본 무음, ON이면 도형별 톤) + 커서 회피.

- [ ] **Step 3: 커밋**

```bash
git add js/pieces/11-composition-viii.js
git commit -m "feat: 작품 11 — Composition VIII (기하 오케스트라·WebAudio)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 17: 작품 12 — After Hiroshige, Sudden Shower

**Files:**
- Create: `js/pieces/12-sudden-shower.js`

**Interfaces:**
- Consumes: main.js 구동 규약(Task 5), `assets/targets/12-sudden-shower.jpg`(Task 3).
- Produces: 없음 (말단 작품 모듈).

- [ ] **Step 1: js/pieces/12-sudden-shower.js 작성**

```js
// js/pieces/12-sudden-shower.js — After Hiroshige, Sudden Shower over Shin-Ōhashi (1857)
// 우키요에의 곧은 빗줄기가 두 겹으로 쏟아진다. 커서는 종이 우산이 되어 비를 가리고,
// 우산 가장자리에서 물방울이 튀며, 수면에 닿은 비는 잔물결을 남긴다.
// 번개는 이따금 구름 속에서 0.2초 번뜩인다. 무음 · 먹색-남색-주홍 팔레트.

let W = 0, H = 0, ctx = null, T = 0, reduced = false;
let img = null, fit = null;

// 비 스트릭 풀 — downpour 시 activeCount만 늘려 재사용(프레임당 할당 최소화)
const MAX = 270, BASE = 150;
let rain = [];
let activeCount = BASE;
let downpour = false, darkT = 0;

let splashes = [];   // 수면 잔물결 {x,y,life,life0,len}
let drips = [];      // 우산 가장자리 물방울 {x,y,vx,vy}

// 우산 상태: 커서를 lerp로 부드럽게 따라오고, 이동 속도로 기울어진다
const umb = { x: 0, y: 0, tx: 0, ty: 0, px: 0, vx: 0, tilt: 0, r: 100 };

// 번개
let boltTimer = 6, flash = 0, bolt = null;

// ---- 유틸 ----
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);

function containFit(iw, ih, w, h, m = 0.03) {
  const aw = w * (1 - m * 2), ah = h * (1 - m * 2);
  const s = Math.min(aw / iw, ah / ih);
  const bw = iw * s, bh = ih * s;
  return { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh };
}

// 스트릭 1개를 화면 위쪽으로 (재)배치. layer 0=근경(진하고 김), 1=원경(옅고 짧음)
function spawn(s, layer, atTop) {
  s.layer = layer;
  // 각도: 근경 78°, 원경 84° (수평 기준) → 곧게 떨어지되 살짝 오른쪽으로
  const deg = layer === 0 ? 78 : 84;
  const a = (deg * Math.PI) / 180;
  s.dx = Math.cos(a); s.dy = Math.sin(a);
  s.len = layer === 0 ? rnd(28, 48) : rnd(14, 26);
  s.speed = layer === 0 ? rnd(820, 1000) : rnd(560, 720);
  s.x = rnd(-0.1 * W, 1.05 * W);
  s.y = atTop ? rnd(-H * 0.5, 0) : -s.len - Math.random() * 40;
}

function initRain() {
  rain = [];
  for (let i = 0; i < MAX; i++) {
    const s = {};
    spawn(s, i % 3 === 0 ? 1 : 0, true); // 약 1/3은 원경
    rain.push(s);
  }
}

// ---- 절차적 폴백 배경: 먹색 구름 밴드 · 대각 다리 실루엣 · 강 수면 밴드 ----
function drawProcedural() {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#0c0f18");
  sky.addColorStop(0.45, "#28303f");
  sky.addColorStop(0.75, "#1c2634");
  sky.addColorStop(1, "#10161f");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  // 상단 먹색 구름 밴드
  const cloud = ctx.createLinearGradient(0, 0, 0, H * 0.26);
  cloud.addColorStop(0, "rgba(8,9,13,0.92)");
  cloud.addColorStop(1, "rgba(8,9,13,0)");
  ctx.fillStyle = cloud; ctx.fillRect(0, 0, W, H * 0.26);

  // 강 수면 밴드(하단 25%)
  const water = ctx.createLinearGradient(0, H * 0.75, 0, H);
  water.addColorStop(0, "#1a2b33");
  water.addColorStop(1, "#0a1418");
  ctx.fillStyle = water; ctx.fillRect(0, H * 0.75, W, H * 0.25);

  // 대각 다리 실루엣 — 좌상에서 우하로 가로지르는 판재
  ctx.fillStyle = "#0b0d12";
  ctx.beginPath();
  ctx.moveTo(-20, H * 0.44); ctx.lineTo(W + 20, H * 0.66);
  ctx.lineTo(W + 20, H * 0.72); ctx.lineTo(-20, H * 0.50);
  ctx.closePath(); ctx.fill();
  // 난간 기둥
  ctx.strokeStyle = "rgba(6,7,10,0.9)"; ctx.lineWidth = 3;
  for (let i = 1; i < 9; i++) {
    const t = i / 9, x = t * W;
    const y = H * (0.44 + 0.22 * t);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 26); ctx.stroke();
  }
}

// ---- 배경(이미지 또는 폴백) + 저녁 톤 오버레이 ----
function drawBackground() {
  if (img && fit) {
    ctx.fillStyle = "#0a0d16"; ctx.fillRect(0, 0, W, H);
    let filtered = false;
    try { ctx.filter = "saturate(0.62) brightness(0.82)"; filtered = true; } catch (e) {}
    ctx.drawImage(img, fit.x, fit.y, fit.w, fit.h);
    if (filtered) ctx.filter = "none";
  } else {
    drawProcedural();
  }
  // 채도 낮춘 저녁 톤
  ctx.fillStyle = "rgba(20,25,40,0.25)";
  ctx.fillRect(0, 0, W, H);
}

// ---- 번개 실루엣 생성(구름 밴드 안 지그재그) ----
function makeBolt() {
  const pts = [];
  let x = rnd(W * 0.2, W * 0.8), y = 0;
  const endY = H * rnd(0.18, 0.28);
  while (y < endY) {
    pts.push([x, y]);
    y += rnd(14, 30);
    x += rnd(-24, 24);
  }
  pts.push([x, y]);
  bolt = pts;
}

function drawLightning() {
  if (flash <= 0 || !bolt) return;
  const k = flash / 0.2;
  ctx.fillStyle = `rgba(200,210,235,${0.30 * k})`;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = `rgba(235,240,255,${0.85 * k})`;
  ctx.lineWidth = 2.2; ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(bolt[0][0], bolt[0][1]);
  for (let i = 1; i < bolt.length; i++) ctx.lineTo(bolt[i][0], bolt[i][1]);
  ctx.stroke();
}

// ---- 비 갱신 + 우산 차단 + 수면 착수 ----
function updateRain(dt) {
  const mul = downpour ? 1.8 : 1;
  const waterY = H * 0.75;
  const R = umb.r, r2 = R * R;
  for (let i = 0; i < activeCount; i++) {
    const s = rain[i];
    const py = s.y;
    s.x += s.dx * s.speed * dt * mul;
    s.y += s.dy * s.speed * dt * mul;

    // 우산 돔(중심 위쪽 반원) 차단 → 재배치 + 가장자리 물방울
    const ddx = s.x - umb.x, ddy = s.y - umb.y;
    if (ddy <= 0 && ddx * ddx + ddy * ddy <= r2) {
      if (drips.length < 130 && Math.random() < 0.16) {
        const side = ddx >= 0 ? 1 : -1;
        drips.push({ x: umb.x + side * R * 0.92, y: umb.y - R * 0.08,
                     vx: side * rnd(15, 45), vy: rnd(20, 60) });
      }
      spawn(s, s.layer, false);
      continue;
    }
    // 수면 착수 → 잔물결 후 재배치
    if (py < waterY && s.y >= waterY) {
      if (splashes.length < 160)
        splashes.push({ x: s.x, y: waterY + rnd(0, H * 0.2), life: 0.34, life0: 0.34, len: rnd(3, 7) });
      spawn(s, s.layer, false);
      continue;
    }
    if (s.y > H + s.len) spawn(s, s.layer, false);
  }
}

function drawRain() {
  // 원경(옅음) → 근경(진함) 순서로 그려 겹침 자연스럽게
  for (let pass = 1; pass >= 0; pass--) {
    ctx.strokeStyle = pass === 0 ? "rgba(214,224,238,0.52)" : "rgba(176,192,214,0.28)";
    ctx.lineWidth = pass === 0 ? 1.1 : 0.7;
    ctx.beginPath();
    for (let i = 0; i < activeCount; i++) {
      const s = rain[i];
      if (s.layer !== pass) continue;
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.dx * s.len, s.y - s.dy * s.len);
    }
    ctx.stroke();
  }
}

function updateDrips(dt) {
  const waterY = H * 0.75;
  const next = [];
  for (const d of drips) {
    d.vy += 900 * dt;
    d.x += d.vx * dt; d.y += d.vy * dt;
    if (d.y >= waterY) {
      if (splashes.length < 160)
        splashes.push({ x: d.x, y: waterY + rnd(0, H * 0.2), life: 0.3, life0: 0.3, len: rnd(2, 5) });
      continue;
    }
    if (d.y < H + 20) next.push(d);
  }
  drips = next;
  ctx.fillStyle = "rgba(220,200,190,0.7)";
  for (const d of drips) ctx.fillRect(d.x - 0.9, d.y - 2, 1.8, 4);
}

function updateSplashes(dt) {
  const next = [];
  for (const sp of splashes) {
    sp.life -= dt;
    if (sp.life <= 0) continue;
    const k = sp.life / sp.life0;
    const w = sp.len * (1.4 - k);        // 짧게 번지는 가로획
    ctx.strokeStyle = `rgba(200,214,224,${0.5 * k})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sp.x - w, sp.y); ctx.lineTo(sp.x + w, sp.y);
    ctx.stroke();
    next.push(sp);
  }
  splashes = next;
}

function drawUmbrella() {
  const R = umb.r;
  ctx.save();
  ctx.translate(umb.x, umb.y);
  ctx.rotate(umb.tilt);
  // 화지 막(반투명 주홍 반원)
  ctx.beginPath();
  ctx.moveTo(-R, 0);
  ctx.arc(0, 0, R, Math.PI, Math.PI * 2, false);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -R, 0, 0);
  g.addColorStop(0, "rgba(198,76,50,0.44)");
  g.addColorStop(1, "rgba(214,150,120,0.30)");
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = "rgba(150,40,28,0.72)"; ctx.stroke();
  // 대나무 살 7개
  ctx.lineWidth = 1; ctx.strokeStyle = "rgba(58,44,36,0.75)";
  ctx.beginPath();
  for (let i = 0; i <= 7; i++) {
    const a = Math.PI + (i / 7) * Math.PI;
    ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
  }
  ctx.stroke();
  // 꼭지 + 손잡이 대
  ctx.strokeStyle = "rgba(58,44,36,0.85)"; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -R * 1.08); ctx.stroke();
  ctx.fillStyle = "rgba(150,40,28,0.9)";
  ctx.beginPath(); ctx.arc(0, -R * 1.08, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(48,36,30,0.5)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, R * 0.5); ctx.stroke();
  ctx.restore();
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = opts.reducedMotion; T = 0;
    img = opts.assets && opts.assets.target ? opts.assets.target : null;
    downpour = false; darkT = 0;
    splashes = []; drips = [];
    boltTimer = rnd(6, 12); flash = 0; bolt = null;
    umb.r = clamp(Math.min(W, H) * 0.16, 72, 150);
    umb.x = umb.tx = umb.px = W * 0.5;
    umb.y = umb.ty = H * 0.44;
    umb.vx = 0; umb.tilt = 0;
    this.resize(W, H);
    activeCount = BASE;
    initRain();
  },

  tick(dt, ptr) {
    T += dt;

    // 클릭 = 폭우 토글
    if (ptr.justDown) downpour = !downpour;
    activeCount = downpour ? MAX : BASE;
    darkT += ((downpour ? 1 : 0) - darkT) * Math.min(1, dt * 3);

    // 우산: 커서를 lerp로 따라오고 이동 속도로 기울어짐
    if (ptr.inside) { umb.tx = ptr.x; umb.ty = ptr.y; }
    umb.px = umb.x;
    const lf = Math.min(1, dt * 9);
    umb.x += (umb.tx - umb.x) * lf;
    umb.y += (umb.ty - umb.y) * lf;
    umb.vx = umb.x - umb.px;
    const tiltTarget = reduced ? 0 : clamp(umb.vx * 0.02, -0.5, 0.5);
    umb.tilt += (tiltTarget - umb.tilt) * Math.min(1, dt * 6);

    // 번개(reducedMotion에선 생략)
    if (!reduced) {
      boltTimer -= dt;
      if (boltTimer <= 0) { makeBolt(); flash = 0.2; boltTimer = rnd(6, 12); }
      if (flash > 0) flash = Math.max(0, flash - dt);
    }

    updateRain(dt);

    // ---- 렌더 ----
    drawBackground();
    // 폭우 시 은은한 어두워짐
    if (darkT > 0.01) { ctx.fillStyle = `rgba(10,12,22,${darkT * 0.2})`; ctx.fillRect(0, 0, W, H); }
    if (!reduced) drawLightning();
    drawRain();
    updateSplashes(dt);
    updateDrips(dt);
    drawUmbrella();
  },

  resize(w, h) {
    W = w; H = h;
    umb.r = clamp(Math.min(W, H) * 0.16, 72, 150);
    fit = img ? containFit(img.naturalWidth || img.width, img.naturalHeight || img.height, W, H) : null;
  },

  dispose() { ctx = null; img = null; fit = null; rain = []; splashes = []; drips = []; bolt = null; },
};
```

- [ ] **Step 2: 브라우저 검증** — 공통 검증 절차 수행. 추가 확인: 커서 우산이 빗줄기를 차단(가장자리 물방울 튐) + 클릭 폭우 토글 + 이따금 번개.

- [ ] **Step 3: 커밋**

```bash
git add js/pieces/12-sudden-shower.js
git commit -m "feat: 작품 12 — Sudden Shower (우키요에 빗줄기·우산)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 18: 통합 스모크 — 파일 무결성 테스트 + 12작품 전수 브라우저 검증

**Files:**
- Create: `test/integrity.test.mjs`

**Interfaces:**
- Consumes: 전체 산출물 (Task 1~17).

- [ ] **Step 1: 무결성 테스트 작성 — test/integrity.test.mjs**

```js
// test/integrity.test.mjs — data.js가 가리키는 파일이 실제로 존재하는지
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WORKS } from "../js/data.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("모든 작품 모듈 파일이 존재한다", () => {
  for (const w of WORKS) {
    assert.ok(existsSync(join(root, "js", w.module)), `${w.no}: ${w.module} 없음`);
  }
});

test("asset이 선언된 작품의 이미지 파일이 존재한다", () => {
  for (const w of WORKS.filter((w) => w.asset)) {
    assert.ok(existsSync(join(root, w.asset)), `${w.no}: ${w.asset} 없음`);
  }
});

test("모든 작품 모듈이 인터페이스 4메서드를 export한다", async () => {
  for (const w of WORKS) {
    const mod = await import(join(root, "js", w.module));
    for (const m of ["init", "tick", "resize", "dispose"]) {
      assert.equal(typeof mod.default[m], "function", `${w.no}.${m}`);
    }
  }
});
```

주의: 작품 모듈 import는 모듈 스코프에서 DOM을 만지지 않아야 통과한다(전역 제약과 일치). 실패하는 모듈이 있으면 해당 모듈의 톱레벨 DOM 접근을 init 안으로 옮긴다.

- [ ] **Step 2: 전체 테스트 실행**

Run: `node --test test/`
Expected: PASS — data/particle-engine/integrity 전체 통과

- [ ] **Step 3: 12작품 전수 브라우저 스윕 (Playwright MCP)**

각 작품에 대해 "작품 태스크 공통 검증 절차" 1~6을 순회 실행. 체크리스트:

- [ ] 01 Great Wave — 파도 응집 + 14초 자가 붕괴
- [ ] 02 Birth of Venus — 바람 드래그에 방향성 흩날림
- [ ] 03 Pearl Earring — 진주가 마지막에 밝게 복원
- [ ] 04 Mona Lisa — 안개 상태에서 모노톤, 응집 시 원색
- [ ] 05 Impression Sunrise — 태양 고동 + 드래그 물결
- [ ] 06 Night Watch — 커서 등불 리빌 + 클릭 섬광
- [ ] 07 Sunflowers — 개화/시듦 사이클 + 클릭 만개
- [ ] 08 Rain Steam Speed — 안개 유동 + 기차 접근 루프
- [ ] 09 Creation of Adam — 간극 잇기 → 불꽃 방전
- [ ] 10 Tower of Babel — 자동 건설 + 길게 눌러 붕괴
- [ ] 11 Composition VIII — 도형 클릭 펄스(사운드 off 기본 무음)
- [ ] 12 Sudden Shower — 빗줄기 + 커서 우산 차단

- [ ] **Step 4: 전환 내구성 — 12작품 연속 순회 2바퀴**

뷰어에서 › 버튼으로 01→02→…→12→01 두 바퀴(총 24회 전환). 확인: 콘솔 에러 0, 페이지 응답성 유지(전환마다 rAF가 정리되어 프레임 콜백이 중첩되지 않음 — `browser_evaluate`로 `performance.now()` 기반 프레임 시간 측정 시 20ms 이하 유지).

- [ ] **Step 5: prefers-reduced-motion 스폿 체크**

Playwright에서 reduced motion 에뮬레이션 후 01(자가 붕괴 약화)·06(섬광 축소)·12(번개 없음) 확인.

- [ ] **Step 6: 모바일 뷰포트 반응형 확인**

Playwright `browser_resize`로 390×844(모바일) 설정 후: 아트리움 카드 1열 배치, 뷰어에서 note·nav 버튼 숨김(CSS 미디어쿼리 동작), 작품 01·05 정상 구동 및 콘솔 에러 0. 확인 후 데스크톱 1440×900으로 복귀.

- [ ] **Step 7: 커밋**

```bash
git add test/integrity.test.mjs
git commit -m "test: 파일 무결성·인터페이스 검증 + 12작품 전수 스모크 통과

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 19: 품질 게이트 — content-review-agent ≥ 85점

**Files:**
- Modify: 리뷰 지적 사항에 따라 해당 파일

- [ ] **Step 1: content-review-agent 디스패치**

Agent 도구로 `aws-content-plugin:content-review-agent`를 호출한다. 프롬프트:

> /home/ec2-user/media-art2 의 웹 전시 사이트(index.html, css/, js/, 로컬 서버 http://localhost:8080)를 리뷰하라. 관점: 레이아웃/반응형, 한국어 문구 품질(맞춤법·톤), 작품 정보 정확성(작가·연도·작품명 — 할루시네이션 검증), 접근성(aria, 키보드, reduced-motion), PII/민감 정보 없음, 구조 완결성. 100점 만점 점수와 개선 항목 목록을 반환하라.

- [ ] **Step 2: 85점 미만이면 지적 사항 수정 → 재리뷰**

각 지적 사항을 수정하고 커밋한 뒤 Step 1을 반복. 85점 이상이 될 때까지. (최대 3회 반복 후에도 미달이면 남은 항목과 함께 사용자에게 보고)

- [ ] **Step 3: 커밋**

```bash
git add -A
git commit -m "fix: content-review 지적 사항 반영 (최종 점수 기록)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 20: 배포 — S3 + CloudFront(OAC)

**Files:**
- Create: `tools/deploy.sh`

- [ ] **Step 1: tools/deploy.sh 작성**

```bash
#!/usr/bin/env bash
# S3(퍼블릭 차단) + CloudFront(OAC) 배포. 최초 실행 시 인프라 생성, 이후 sync만.
set -euo pipefail
cd "$(dirname "$0")/.."

REGION=$(aws configure get region || echo "us-east-1")
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET="masterpieces-reborn-${ACCOUNT}"
STATE=".deploy-state.json"   # 배포 인프라 ID 저장 (gitignore)

if [ ! -f "$STATE" ]; then
  echo "== 최초 배포: 인프라 생성 =="
  # 1) S3 버킷 (퍼블릭 차단 유지)
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
  else
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION"
  fi
  aws s3api put-public-access-block --bucket "$BUCKET" \
    --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

  # 2) Origin Access Control
  OAC_ID=$(aws cloudfront create-origin-access-control --origin-access-control-config \
    "Name=masterpieces-reborn-oac,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
    --query 'OriginAccessControl.Id' --output text)

  # 3) CloudFront 배포
  DIST_JSON=$(aws cloudfront create-distribution --distribution-config "{
    \"CallerReference\": \"masterpieces-reborn-$(date +%s)\",
    \"Comment\": \"Masterpieces Reborn art exhibition\",
    \"Enabled\": true,
    \"DefaultRootObject\": \"index.html\",
    \"Origins\": { \"Quantity\": 1, \"Items\": [{
      \"Id\": \"s3origin\",
      \"DomainName\": \"${BUCKET}.s3.${REGION}.amazonaws.com\",
      \"OriginAccessControlId\": \"${OAC_ID}\",
      \"S3OriginConfig\": { \"OriginAccessIdentity\": \"\" }
    }]},
    \"DefaultCacheBehavior\": {
      \"TargetOriginId\": \"s3origin\",
      \"ViewerProtocolPolicy\": \"redirect-to-https\",
      \"CachePolicyId\": \"658327ea-f89d-4fab-a63d-7e88639e58f6\",
      \"Compress\": true
    },
    \"HttpVersion\": \"http2and3\",
    \"PriceClass\": \"PriceClass_200\"
  }")
  DIST_ID=$(echo "$DIST_JSON" | python3 -c "import sys,json;print(json.load(sys.stdin)['Distribution']['Id'])")
  DOMAIN=$(echo "$DIST_JSON" | python3 -c "import sys,json;print(json.load(sys.stdin)['Distribution']['DomainName'])")

  # 4) 버킷 정책: 이 배포의 CloudFront만 읽기 허용
  aws s3api put-bucket-policy --bucket "$BUCKET" --policy "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Sid\": \"AllowCloudFrontOAC\",
      \"Effect\": \"Allow\",
      \"Principal\": { \"Service\": \"cloudfront.amazonaws.com\" },
      \"Action\": \"s3:GetObject\",
      \"Resource\": \"arn:aws:s3:::${BUCKET}/*\",
      \"Condition\": { \"StringEquals\": {
        \"AWS:SourceArn\": \"arn:aws:cloudfront::${ACCOUNT}:distribution/${DIST_ID}\"
      }}
    }]
  }"
  printf '{"bucket":"%s","distId":"%s","domain":"%s"}\n' "$BUCKET" "$DIST_ID" "$DOMAIN" > "$STATE"
fi

DIST_ID=$(python3 -c "import json;print(json.load(open('$STATE'))['distId'])")
DOMAIN=$(python3 -c "import json;print(json.load(open('$STATE'))['domain'])")

echo "== 업로드 =="
aws s3 sync . "s3://${BUCKET}" \
  --exclude ".git/*" --exclude "docs/*" --exclude "test/*" --exclude "tools/*" \
  --exclude ".deploy-state.json" --exclude ".gitignore" --delete

echo "== 캐시 무효화 =="
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" > /dev/null

echo "URL: https://${DOMAIN}/"
```

- [ ] **Step 2: .gitignore 추가 및 배포 실행**

```bash
echo ".deploy-state.json" >> .gitignore
chmod +x tools/deploy.sh && ./tools/deploy.sh
```

Expected: `URL: https://<random>.cloudfront.net/` 출력. 배포 전파는 3~5분.

- [ ] **Step 3: 배포 스모크 테스트**

```bash
sleep 240 && curl -s -o /dev/null -w "%{http_code}" https://<domain>/
```

Expected: `200`. Playwright MCP로 실제 URL 접속 → 아트리움 렌더 + 작품 01 열기 → 정상 구동 스크린샷.

- [ ] **Step 4: 커밋 + 완료 보고**

```bash
git add tools/deploy.sh .gitignore
git commit -m "feat: S3+CloudFront(OAC) 배포 스크립트 · 최초 배포 완료

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

사용자에게 CloudFront URL, content-review 점수, 남은 개선 아이디어(making-of 페이지 등)를 보고한다.

---
