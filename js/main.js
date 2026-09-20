// js/main.js — 전시 셸: 아트리움 렌더, 뷰어, rAF 루프, 포인터 규약
import { WINGS, WORKS, wingOf } from "./data.js";
import * as mic from "./mic.js";
import * as cam from "./cam.js";
import { sampleFromLandmarks, makePointerState, applyHand, detectMirrored } from "./hand-pointer.js";

const $ = (sel) => document.querySelector(sel);
const body = document.body;
const canvas = $("#stage");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- 사운드 전역 토글 (작품엔 getter만 전달) ----------
let soundOn = false;
let lastCard = null;   // 뷰어 진입 직전의 카드 (닫을 때 포커스 복원용)
$(".sound-toggle").addEventListener("click", (e) => {
  soundOn = !soundOn;
  e.currentTarget.setAttribute("aria-pressed", String(soundOn));
});

// ---------- 마이크 (mic: true 작품에서만 버튼 노출) ----------
const micBtn = $("#v-mic");
const MIC_LABEL = "🎤 소리로 생명 불어넣기";
function resetMicBtn() {
  micBtn.setAttribute("aria-pressed", "false");
  micBtn.disabled = false;
  micBtn.textContent = MIC_LABEL;
}
let micReqSeq = 0; // 대기 중인 권한 요청의 늦은 완료 무효화용
micBtn.addEventListener("click", async () => {
  if (mic.active()) { mic.stop(); resetMicBtn(); return; } // 토글 오프
  const my = ++micReqSeq;
  micBtn.disabled = true;
  const ok = await mic.request();
  if (my !== micReqSeq) return; // 대기 중 뷰어가 닫힘/전환됨 — mic.js가 트랙 정리함, UI는 건드리지 않음
  micBtn.disabled = false;
  if (ok) {
    micBtn.setAttribute("aria-pressed", "true");
    micBtn.textContent = "🎤 듣는 중 — 소리를 내보세요";
  } else {
    micBtn.disabled = true; // 권한 거부/미지원: 커서 폴백 안내
    micBtn.textContent = "마이크를 사용할 수 없어요 — 커서로 체험하세요";
  }
});

// ---------- 카메라 (cam: true 작품에서만 버튼 노출) ----------
const camBtn = $("#v-cam");
const CAM_LABEL = "📷 카메라로 체험하기";
function resetCamBtn() {
  camBtn.setAttribute("aria-pressed", "false");
  camBtn.disabled = false;
  camBtn.textContent = CAM_LABEL;
}
let camReqSeq = 0; // 대기 중인 권한·모델 로드의 늦은 완료 무효화용
camBtn.addEventListener("click", async () => {
  if (cam.active()) { cam.stop(); resetCamBtn(); return; } // 토글 오프
  const my = ++camReqSeq;
  camBtn.disabled = true;
  camBtn.textContent = "📷 카메라 준비 중…";               // 모델 ~10MB 로드 피드백
  const ok = await cam.request({ numHands: (WORKS[current] && WORKS[current].camHands) || 2 });
  if (my !== camReqSeq) return; // 대기 중 뷰어 닫힘/전환 — cam.js가 자원 정리함
  camBtn.disabled = false;
  if (ok) {
    camBtn.setAttribute("aria-pressed", "true");
    camBtn.textContent = "📷 손을 비춰보세요";
  } else {
    camBtn.disabled = true; // 권한 거부/미지원/CDN 실패: 마우스 폴백 안내
    camBtn.textContent = "카메라를 사용할 수 없어요 — 마우스로 체험하세요";
  }
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
      card.dataset.no = work.no; // 뷰어 내비게이션 후 포커스 복원 대상 조회용
      card.innerHTML = `
        <span class="card__no">No. ${work.no}</span>
        <h3 class="card__title">${work.title}</h3>
        <p class="card__ko">${work.ko}</p>
        <p class="card__medium">${work.medium}</p>`;
      card.addEventListener("click", () => { lastCard = card; openWork(WORKS.indexOf(work)); });
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
                  down: false, justDown: false, justUp: false, downTime: 0, inside: false,
                  hand: { visible: false, openness: 0, speed: 0 } };   // 손 합성 부가 정보(작품 선택 소비)
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

// ---------- 손 → 포인터 합성 (handPointer: true 작품) ----------
// cam.js 계약: hands().x·landmarks()는 모두 거울 보정 후 좌표(세션 중 불변)다. detectMirrored
// (순수 모듈)는 미확정 동안 이 계약값(보정 후)을 기본으로 반환하고, 손이 중앙에서 벗어난 첫
// 프레임에 hands().x와 손바닥 중심을 비교해 한 번 판별해 래치한다 — cam.js가 계약을 어기고
// 원본 좌표를 내주는 회귀가 생겨도 손이 반대로 움직이지 않도록 잡아내는 안전망이다.
const handCursor = $("#hand-cursor");
let handState = makePointerState();
let handWarned = false;   // 합성 상태·경고 플래그는 카메라가 꺼지면 초기화 — 재활성화마다 새로 시작
let stageW = 0, stageH = 0;   // sizeCanvas()의 CSS px — 합성 좌표 범위

function synthesizeHand(dt) {
  const work = WORKS[current];
  if (!(work && work.handPointer && cam.active())) {
    if (handState.seen || handState.mirrored !== null) {    // 유령 손 방지: 이전 활성화의 잔여 상태 제거
      handState = makePointerState(); handWarned = false;
    }
    pointer.hand.visible = false; pointer.hand.openness = 0; pointer.hand.speed = 0;
    return false;
  }
  // 검출 예외는 그 프레임만 건너뛰고 마우스 폴백 — rAF 루프를 죽이지 않는다.
  try {
    const h = cam.hands();                                  // 이 프레임의 추론 트리거(1회 캐시는 cam.js 보장)
    const lm = cam.landmarks();
    const primary = lm && lm[0];
    const sample = sampleFromLandmarks(primary, detectMirrored(handState, h && h.x, primary));
    return applyHand(pointer, sample, handState, dt, stageW, stageH);
  } catch (err) {
    handState = makePointerState();                         // 예외 직후엔 다음 활성화처럼 새로 시작
    pointer.hand.visible = false; pointer.hand.openness = 0; pointer.hand.speed = 0;
    if (!handWarned) { handWarned = true; console.warn("손 인식 예외 — 이 프레임은 마우스로 폴백", err); }
    return false;
  }
}

function updateHandCursor(owns) {
  handCursor.hidden = !owns;
  if (!owns) return;
  handCursor.style.transform = `translate(${pointer.x}px, ${pointer.y}px) translate(-50%, -50%)`;
  handCursor.style.setProperty("--hand-open", pointer.hand.openness.toFixed(2));
  handCursor.classList.toggle("is-down", pointer.down);
}

// ---------- 작품 설명 패널 자동 숨김 ----------
const INFO_AUTO_HIDE = 4;   // 초 — 첫 프레임부터 rAF dt 누적(탭이 숨겨진 동안은 흐르지 않음)
const infoEl = $(".viewer__info"), infoToggle = $(".viewer__infotoggle");
let infoT = 0, infoAutoDone = false;   // 작품마다 초기화 · 수동 토글/1회 숨김 후 true

function setInfoHidden(hidden) {
  infoEl.classList.toggle("is-hidden", hidden);
  infoToggle.setAttribute("aria-expanded", String(!hidden));
}
function resetInfoAutoHide() { infoT = 0; infoAutoDone = false; setInfoHidden(false); }
function tickInfoAutoHide(dt) {
  if (infoAutoDone || infoEl.classList.contains("is-hidden")) return;
  if (infoEl.matches(":hover")) return;                         // 읽는 중 — 기다린다
  infoT += dt;
  if (infoT < INFO_AUTO_HIDE) return;
  infoAutoDone = true;
  if (infoEl.contains(document.activeElement)) infoToggle.focus();   // 포커스 유실 방지
  setInfoHidden(true);
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
  // ←/→·prev/next 이동 후 닫아도 현재(마지막) 작품 카드로 포커스가 복원되도록 갱신
  lastCard = $(`.card[data-no="${work.no}"]`) || lastCard;
  body.dataset.view = "viewer";
  $("#viewer").setAttribute("aria-hidden", "false");
  document.documentElement.style.setProperty("--accent", wing.accent);
  $("#v-no").textContent = `No. ${work.no}`;
  $("#v-wing").textContent = `${wing.index} · ${wing.sub}`;
  $("#v-title").textContent = work.title;
  $("#v-medium").textContent = work.medium;
  $("#v-note").textContent = work.note;
  $("#v-hint").textContent = work.hint;
  micBtn.hidden = !work.mic;
  camBtn.hidden = !work.cam;
  $("#v-error").hidden = true;

  const { w, h } = sizeCanvas(); stageW = w; stageH = h;
  try {
    const [mod, target] = await Promise.all([import(work.module), loadImage(work.asset)]);
    if (current !== idx) return; // 로딩 중 다른 작품으로 이동함
    piece = mod.default;
    piece.init({ canvas, ctx, width: w, height: h,
                 assets: { target }, reducedMotion,
                 audio: { enabled: () => soundOn,
                          mic: { active: () => mic.active(), level: () => mic.level() } },
                 cam: { active: () => cam.active(), hands: () => cam.hands(),
                        video: () => cam.video(), landmarks: () => cam.landmarks(),
                        drawMirror: (c, rect) => cam.drawMirror(c, rect) } });
    resetInfoAutoHide();
    lastT = performance.now();
    pointer.downTime = 0;
    rafId = requestAnimationFrame(frame);
    $(".viewer__close").focus();
  } catch (err) {
    console.error(`작품 로드 실패: ${work.module}`, err);
    piece = null;
    $("#v-error").hidden = false;
  }
}

function frame(now) {
  const real = (now - lastT) / 1000;
  const dt = Math.min(0.05, real);          // 탭 복귀 시 폭주 방지 캡(기존 작품 규약)
  lastT = now;
  snapshotPointer(dt);
  updateHandCursor(synthesizeHand(dt));   // 손이 보이면 이 프레임의 포인터는 손
  tickInfoAutoHide(dt);
  try {
    piece.tick(dt, pointer, Math.min(0.25, real)); // 3번째: 실제 경과(초) — fps 독립 진행이 필요한 작품용
  } catch (err) {
    console.error("작품 tick 예외 — 아트리움으로 복귀", err);
    closeWork(); // rAF 루프가 소리 없이 죽지 않도록 우아하게 복귀
    return;
  }
  rafId = requestAnimationFrame(frame);
}

async function closeWork() {
  cancelAnimationFrame(rafId);
  rafId = 0;
  if (piece) { try { piece.dispose(); } catch (e) { console.error(e); } }
  piece = null;
  micReqSeq++; // 대기 중인 마이크 권한 요청의 늦은 완료를 무효화
  mic.stop(); resetMicBtn(); micBtn.hidden = true;
  camReqSeq++; cam.stop(); resetCamBtn(); camBtn.hidden = true;
  handState = makePointerState(); handCursor.hidden = true; handWarned = false;   // 합성 상태·링 커서 초기화
  current = -1;
  body.dataset.view = "atrium";
  $("#viewer").setAttribute("aria-hidden", "true");
  if (lastCard) lastCard.focus();
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
$(".viewer__infotoggle").addEventListener("click", () => {
  setInfoHidden(!infoEl.classList.contains("is-hidden"));
  infoAutoDone = true;
});
addEventListener("keydown", (e) => {
  if (body.dataset.view !== "viewer") return;
  if (e.key === "Escape") closeWork();
  else if (e.key === "ArrowLeft") step(-1);
  else if (e.key === "ArrowRight") step(1);
});
addEventListener("resize", () => {
  if (body.dataset.view !== "viewer" || !piece) return;
  const { w, h } = sizeCanvas(); stageW = w; stageH = h;
  piece.resize(w, h);
});
