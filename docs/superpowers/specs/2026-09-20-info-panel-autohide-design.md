# 작품 설명 패널 자동 숨김 설계

- 날짜: 2026-09-20 · 브랜치 `feature/info-autohide` (worktree `.worktrees/info-autohide`)
- 대상: `js/main.js`, `css/style.css` (작품 모듈·data.js 무변경)

## 목표

모든 작품에서 설명 패널(`.viewer__info`)이 작품 진입 후 **4초** 뒤 **왼쪽 옆으로 슬라이드아웃**하며
사라진다. 관객이 읽고 있거나(마우스 오버) 패널 안 버튼을 누르려는 동안은 기다린다. ⓘ 토글로 언제든
다시 열 수 있고, 수동으로 연 뒤에는 그 작품에서 다시 자동으로 숨기지 않는다.

## 동작 규칙

| 상황 | 동작 |
|---|---|
| 작품 진입(openWork 상단 `body.dataset.view = "viewer"` 직후 + init 성공 직후) | 패널을 보이게 하고 타이머 0으로 초기화, 자동 숨김 활성. 상단 호출로 로딩 중에도 패널이 보이고, init 직후 호출로 타이머가 첫 프레임 기준으로 다시 0 |
| 매 프레임(frame) | 패널이 보이고 자동 숨김이 활성이며, (hover 가능 기기에서) 마우스가 패널 위에 없으면 `infoT += min(0.25, real)` — 실제 경과 초 |
| `infoT ≥ INFO_AUTO_HIDE(4)` | 패널 숨김(`is-hidden` + `inert`), `aria-expanded=false`, 자동 숨김 종료(그 작품에서 1회) |
| 숨길 때 포커스가 패널 안에 있음 | 먼저 ⓘ 토글로 포커스를 옮긴 뒤 숨긴다(포커스 유실 방지 — `inert` 적용 전) |
| 숨김 상태 | `infoEl.inert = true` — 탭 순서·접근성 트리에서 제외(다시 보이면 `false`) |
| 마우스가 패널 위(`:hover`) | `(hover: hover)` 기기에서만 카운트 정지(누적 유지). 터치 기기는 탭 뒤 `:hover` 고착을 피하기 위해 이 규칙 미적용 |
| 패널 안 클릭(📷/🎤 버튼·터치 탭 포함) | 수동 의사 — 자동 숨김 종료(권한 대기·모델 로드 중 패널이 사라지지 않음) |
| ⓘ 토글 클릭 | 보임/숨김 전환 + `aria-expanded`·`inert` 동기화 + 자동 숨김 종료(수동 의사 존중) |
| 다른 작품으로 이동(←/→·prev/next) | openWork가 다시 초기화 → 다시 4초 규칙 |
| 탭 숨김/백그라운드 | rAF가 멈추므로 시간이 흐르지 않음 |
| prefers-reduced-motion | 전환 없이 즉시 숨김/표시 |

- 시간은 셸 `frame`의 **실제 경과 초 `real`** 을 프레임당 0.25s로 캡해 누적 — setTimeout 사용 안 함. 첫 프레임부터 벽시계 4초.
  `dt`(0.05s 캡)를 쓰지 않는 이유: 20fps 미만 기기에서 4초가 늘어진다. 0.25s 캡은 탭 복귀 시 한 번에 점프하는 것을 막는다.
- 카메라/마이크 버튼은 패널 안에 있으므로 함께 숨겨지며 ⓘ로 복귀. 카메라·마이크 상태는 영향 없음.

## CSS

- `.viewer__info { transition: opacity 0.6s ease, transform 0.6s cubic-bezier(0.4, 0, 0.2, 1); }`
- `.viewer__info.is-hidden { opacity: 0; transform: translateX(calc(-100% - 40px)); pointer-events: none; }`
  (기존 `translateY(12px)`를 대체 — 왼쪽 화면 밖으로 완전히 나간다. 모바일 `left:12px; right:12px` 배치에서도 동일.)
- `@media (prefers-reduced-motion: reduce) { .viewer__info { transition: none; } }`

## js/main.js

```js
// ---------- 작품 설명 패널 자동 숨김 ----------
const INFO_AUTO_HIDE = 4;   // 초 — 첫 프레임부터 실제 경과 시간(real, 0.25s 캡) 누적(탭이 숨겨진 동안은 흐르지 않음)
const HOVER_CAPABLE = matchMedia("(hover: hover)").matches;   // 터치 기기는 탭 뒤 :hover 가 고착될 수 있어 hover 규칙 제외
const infoEl = $(".viewer__info"), infoToggle = $(".viewer__infotoggle");
let infoT = 0, infoAutoDone = false;   // 작품마다 초기화 · 수동 토글/패널 클릭/1회 숨김 후 true

function setInfoHidden(hidden) {
  infoEl.classList.toggle("is-hidden", hidden);
  infoEl.inert = hidden;                                        // 숨긴 패널은 탭 순서·접근성 트리에서 제외
  infoToggle.setAttribute("aria-expanded", String(!hidden));
}
function resetInfoAutoHide() { infoT = 0; infoAutoDone = false; setInfoHidden(false); }
// 실제 경과 시간(real) 기준 — 저fps 기기에서도 벽시계 4초. dt(0.05s 캡)를 쓰면 20fps 미만에서 4초가 늘어진다.
// 호출 측이 0.25s로 캡해 탭 복귀 시 한 번에 점프하지 않는다.
function tickInfoAutoHide(real) {
  if (infoAutoDone || infoEl.classList.contains("is-hidden")) return;
  if (HOVER_CAPABLE && infoEl.matches(":hover")) return;        // 읽는 중 — 기다린다(hover 가능 기기만)
  infoT += real;
  if (infoT < INFO_AUTO_HIDE) return;
  infoAutoDone = true;
  if (infoEl.contains(document.activeElement)) infoToggle.focus();   // 포커스 유실 방지(inert 적용 전에 옮긴다)
  setInfoHidden(true);
}
// 패널 안 클릭(📷/🎤 버튼·터치 탭 포함)은 수동 의사 — 권한 대기·모델 로드 중에 패널이 사라지지 않도록 자동 숨김 종료
infoEl.addEventListener("click", () => { infoAutoDone = true; });
```
- `openWork`: 상단 `body.dataset.view = "viewer";` 직후 `resetInfoAutoHide();`(로딩 중 패널 보임) **그리고** `piece.init(...)` 성공 직후 다시 `resetInfoAutoHide();`(타이머를 첫 프레임 기준으로 0).
- `frame(now)`: `updateHandCursor(synthesizeHand(dt));` 다음 줄에 `tickInfoAutoHide(Math.min(0.25, real));` — `real`은 frame에 이미 있는 실제 경과 초.
- ⓘ 토글 리스너는 `infoToggle.addEventListener("click", ...)`(재조회 없이) 안에서 `setInfoHidden(!infoEl.classList.contains("is-hidden")); infoAutoDone = true;`.

## 검증(Playwright, 헤드리스 Chrome)

1. 01 진입 → 즉시 보임 → 3.0s 시점 보임 → 5.0s 시점 `is-hidden`·`aria-expanded=false`·패널 bounding box 오른쪽 끝 < 0(화면 왼쪽 밖).
2. 1s에 마우스를 패널 위에 올리고 6s까지 유지 → 여전히 보임 → 마우스를 떼고 3.5s 뒤 숨김.
3. 숨김 후 ⓘ 클릭 → 보임, 10s 뒤에도 보임(자동 숨김 종료). ⓘ 재클릭 → 숨김.
4. ArrowRight로 02 이동 → 즉시 보임, 5s 뒤 숨김.
5. 모바일 375×812에서 1·4 동일.
6. `prefers-reduced-motion: reduce` 에뮬레이션 → 4s 뒤 숨김, computed transition-duration 0s.
7. 01에서 📷 버튼에 포커스(Tab 또는 focus()) → 4s 뒤 패널 숨김 + `document.activeElement === ⓘ 토글`.
8. 전 과정 콘솔 에러 0. `node --test test/` 통과.

## 하지 않는 것

- 마우스 이동에 따른 자동 복귀, 작품별 시간 차등, 스와이프 제스처, 힌트 위치 변경.
