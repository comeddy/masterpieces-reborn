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
