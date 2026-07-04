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
  $("#viewer").setAttribute("aria-hidden", "false");
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
  $("#viewer").setAttribute("aria-hidden", "true");
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
