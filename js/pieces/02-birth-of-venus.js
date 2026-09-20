// js/pieces/02-birth-of-venus.js
// After Botticelli — Birth of Venus (c.1485)
// 입자가 원작(또는 절차적 조개껍질+여신 실루엣)으로 응집하고,
// 드래그=방향성 바람, 클릭=돌풍, 유휴=수평 바람 사인파 + 장미 꽃잎으로 반응한다.
// 카메라(📷): 셸(main.js)이 손을 포인터 규약으로 합성한다(펼친 손=드래그, 주먹→펼침=클릭).
// 이 모듈은 손 인식 코드를 갖지 않고 ptr.hand(visible·openness·speed)만 읽어 원작의
// 서풍 제피로스 감각을 더한다 — 넓은 바람 반경, 펼친 손 아래 잔잔한 숨결, 빠른 손길 뒤 장미 꽃잎.
import { ParticleField } from "../particle-engine.js";

const TAU = Math.PI * 2;
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

let W = 0, H = 0, ctx = null, T = 0, reduced = false;
let field = null;
let petals = [];
let petalTimer = 3.5;
let bgGrad = null;
let handPetal = { cool: 0 };   // 손 꽃잎 방출 쿨다운 상태(petalEmit가 갱신)
let handPetalCount = 0;        // 살아 있는 손 꽃잎 수(updatePetals가 집계) — petalMax 판정용

/* ---------- 손(서풍) 보정 — 순수 함수, node:test 대상 ---------- */
// 손은 EMA 평활·REACH 확대를 거친 포인터라 마우스보다 느리고 넓게 움직인다. 펼친 손바닥은
// 한 점이 아니라 숨결의 면이므로 바람 반경을 넓히고 세기를 조금 올린다. 마우스 값은 그대로.
export const HAND = {
  pushRadius: 1.5,     // 드래그 바람 반경 배율
  pushGain: 1.25,      // 드래그 바람 세기 배율
  gust: 1.4,           // 주먹→펼침 돌풍 반경·세기 배율(01번 물보라와 같은 손맛 상수)
  breathRadius: 120,   // 펼친 손이 머무는 자리의 숨결 반경(px)
  breathForce: 30,     // 숨결 방사 가속(px/s², 손 중심에서 최대·가장자리 0). 스프링 k와의 평형 k·δ = F·(1−δ/R)에서
                       // 중심 변위 δ ≈ 6px(k 4.4)·12px(k 2.3), 손 아래 밀도 60% 이상 유지 — 구멍이 아니라 입김(80이면 얼굴에 지름 80px 공동)
  petalSpeedMin: 320,  // 이 속도(px/s) 이상으로 손이 지나가면 꽃잎이 흩날린다
  petalCool: 0.16,     // 손 꽃잎 방출 간격(s)
  petalMax: 90,        // 살아 있는 손 꽃잎 수 상한(비용 상한) — 가장자리 꽃잎은 세지 않는다(기존 주기 그대로)
  petalLife: 7,        // 손 꽃잎 수명(s) — 다 살면 거품 속으로 사라진다(화면에 정체하지 않도록)
  petalFade: 1.5,      // 수명 마지막 이 시간 동안 알파 페이드
};
const isHand = (ptr) => !!(ptr && ptr.hand && ptr.hand.visible);
const finiteXY = (ptr) => Number.isFinite(ptr.x) && Number.isFinite(ptr.y);

// 드래그 바람: 반경·세기. 손이면 넓고 조금 세게.
export function windParams(ptr, reduced) {
  const hand = isHand(ptr);
  return {
    radius: (reduced ? 110 : 155) * (hand ? HAND.pushRadius : 1),
    gain: (reduced ? 6 : 13) * (hand ? HAND.pushGain : 1),
  };
}

// 돌풍(클릭·주먹→펼침): 손이면 거품을 손으로 튕기는 감각으로 반경·세기를 키운다.
export function gustParams(ptr, reduced) {
  const k = isHand(ptr) ? HAND.gust : 1;
  return { radius: (reduced ? 130 : 210) * k, strength: (reduced ? 260 : 540) * k };
}

// 숨결: 펼친 손(down)이 보이면 손 아래 거품을 잔잔히 밀어낸다. 마우스에는 없다(null).
export function breathParams(ptr, reduced) {
  if (!isHand(ptr) || !ptr.down) return null;
  return { radius: HAND.breathRadius, force: HAND.breathForce * (reduced ? 0.5 : 1) };
}

// 손 꽃잎: 펼친 손이 petalSpeedMin 이상으로 움직이면 petalCool마다 2~3장(아주 빠르면 3장,
// 저모션 1장)을 손 위치에서 진행 방향으로 날린다. state.cool은 호출자가 보관·전달한다.
// 반환 null = 이번 프레임 방출 없음. handCount(살아 있는 손 꽃잎 수)가 petalMax 이상이면 방출하지 않는다.
// speed(px/s)를 주면 ptr.hand.speed 대신 쓴다 — 셸의 speed는 dt 상한(0.05s)으로 나눈 값이라 20fps 미만에서
// 실제의 최대 2배(5fps에선 4배)로 부풀므로, tick은 realDt로 재계산한 값을 넘긴다.
export function petalEmit(state, ptr, dt, reduced, handCount, speed) {
  state.cool = Math.max(0, state.cool - dt);
  if (!isHand(ptr) || !ptr.down) return null;
  if (speed === undefined) speed = ptr.hand.speed;
  if (!Number.isFinite(speed) || speed < HAND.petalSpeedMin) return null;
  if (state.cool > 0 || handCount >= HAND.petalMax) return null;
  const len = Math.hypot(ptr.dx, ptr.dy);
  if (!(len > 0)) return null;
  state.cool = HAND.petalCool * (reduced ? 2 : 1);
  const n = reduced ? 1 : (speed >= HAND.petalSpeedMin * 2 ? 3 : 2);
  return { n, dirx: ptr.dx / len, diry: ptr.dy / len, speed };
}

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

/* ---------- 장미 꽃잎 (곡선 실루엣 · 분홍 그라데이션) ---------- */
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
      size: 8 + Math.random() * 8,        // 꽃잎이 좀 더 크게 (형태가 보이도록)
      ph: Math.random() * TAU,
      tone: Math.random(),                // 꽃잎마다 색조를 조금씩 다르게
      drag: 0, g: 0,                      // 가장자리 꽃잎은 등속 횡단
    });
  }
}
// 손 꽃잎: 손 위치에서 진행 방향 ±0.45rad 부채로, 손 속도의 일부를 물려받아 튀어나간 뒤
// 저항(drag)으로 느려지고 내려앉아(g, 종단 g/drag = 50px/s) 바람·팔랑임에 실리며, petalLife가 다하면
// 마지막 petalFade 동안 흐려져 사라진다 — 여신 위에 정체하지 않고, 상한(petalMax)은 손 꽃잎만 센다.
function spawnFromHand(x, y, e) {
  for (let i = 0; i < e.n; i++) {
    const s = 60 + e.speed * 0.3 + Math.random() * 40;
    const a = (Math.random() - 0.5) * 0.9;
    const cs = Math.cos(a), sn = Math.sin(a);
    const dx = e.dirx * cs - e.diry * sn, dy = e.dirx * sn + e.diry * cs;
    petals.push({
      x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 30,
      vx: dx * s, vy: dy * s - 10,
      rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 4,
      size: 7 + Math.random() * 7, ph: Math.random() * TAU, tone: Math.random(),
      drag: 1.2, g: 60, life: HAND.petalLife, alpha: 1, hand: true,
    });
  }
  handPetalCount += e.n;
}
function updatePetals(dt, wind) {
  let hands = 0;
  for (let i = petals.length - 1; i >= 0; i--) {
    const p = petals[i];
    p.ph += dt * 2.4;
    if (p.drag) { const d = Math.max(0, 1 - p.drag * dt); p.vx *= d; p.vy *= d; }
    if (p.g) p.vy += p.g * dt;
    p.x += (p.vx + wind * 2.2) * dt;
    p.y += (p.vy + Math.sin(p.ph) * 12) * dt; // 나풀나풀 상하 흔들림
    p.rot += p.vr * dt;
    let dead = p.x < -160 || p.x > W + 160 || p.y > H + 80 || p.y < -120;
    if (p.hand) {                              // 손 꽃잎: 수명·페이드
      p.life -= dt;
      p.alpha = p.life < HAND.petalFade ? Math.max(0, p.life / HAND.petalFade) : 1;
      if (p.life <= 0) dead = true;
    }
    if (dead) petals.splice(i, 1);
    else if (p.hand) hands++;
  }
  handPetalCount = hands;
}
// 디버그·테스트 전용 읽기 접근자: 화면 위 꽃잎 총수와 손 꽃잎 수
export function petalStats() { return { total: petals.length, hand: handPetalCount }; }
// 장미 꽃잎 실루엣 하나를 로컬 좌표(기부=아래, 끝=위)에 그린다.
// 아래 뾰족한 기부에서 두 베지어가 볼록하게 올라가 끝이 살짝 갈라진(노치) 물방울/하트형.
function petalPath(s) {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.96);                                   // 기부(아래 뾰족)
  ctx.bezierCurveTo(s * 0.58, s * 0.40, s * 0.66, -s * 0.52, // 오른쪽 볼록
                    s * 0.20, -s * 0.94);                     // 오른쪽 끝
  ctx.quadraticCurveTo(0, -s * 0.70, -s * 0.20, -s * 0.94);  // 끝 중앙 노치(갈라짐)
  ctx.bezierCurveTo(-s * 0.66, -s * 0.52, -s * 0.58, s * 0.40, // 왼쪽 볼록
                    0, s * 0.96);                             // 기부로 복귀
  ctx.closePath();
}
function drawPetals() {
  for (let i = 0; i < petals.length; i++) {
    const p = petals[i];
    const s = p.size;
    const t = p.tone;
    ctx.save();
    if (p.alpha !== undefined && p.alpha < 1) ctx.globalAlpha = p.alpha;   // 손 꽃잎 페이드
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    // 가로축 스케일 진동 = 팔랑임/살짝 말린 느낌
    ctx.scale(0.62 + 0.38 * Math.sin(p.ph * 1.3), 1);
    // 2톤 그라데이션: 기부 진분홍 → 끝 연분홍 (꽃잎마다 tone으로 색조 편차)
    const grad = ctx.createLinearGradient(0, s * 0.96, 0, -s * 0.94);
    grad.addColorStop(0, "rgba(" + clamp(206 + t * 26 | 0) + "," + clamp(70 + t * 40 | 0) + "," + clamp(104 + t * 30 | 0) + ",0.96)");
    grad.addColorStop(1, "rgba(" + clamp(247 + t * 6 | 0) + "," + clamp(196 + t * 18 | 0) + "," + clamp(208 + t * 12 | 0) + ",0.94)");
    petalPath(s);
    ctx.fillStyle = grad;
    ctx.fill();
    // 중심선 음영 = 입체감(중앙 잎맥)
    ctx.beginPath();
    ctx.moveTo(0, s * 0.9);
    ctx.quadraticCurveTo(s * 0.06, 0, 0, -s * 0.66);
    ctx.strokeStyle = "rgba(180,58,92,0.22)";
    ctx.lineWidth = Math.max(0.6, s * 0.07);
    ctx.stroke();
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
    petals = []; petalTimer = reduced ? 6 : 3.5; handPetal = { cool: 0 }; handPetalCount = 0;
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

  tick(dt, ptr, realDt) {
    T += dt;
    const ps = field.particles;
    const ok = finiteXY(ptr);   // 합성 포인터가 비정상 값이면 이 프레임의 상호작용만 건너뛴다(NaN 전파 방지)

    // 클릭·주먹→펼침 = 돌풍: 강한 방사형 흩뜨림(손이면 반경·세기 확대)
    if (ok && ptr.justDown && ptr.inside) {
      const g = gustParams(ptr, reduced);
      field.scatter(ptr.x, ptr.y, g.radius, g.strength);
    }

    // 드래그·펼친 손 = 바람: 이동 방향(dx,dy)으로 반경 내 입자를 직접 밀기
    if (ok && ptr.down && ptr.inside) {
      const sp = Math.hypot(ptr.dx, ptr.dy);
      if (sp > 0.02) {
        const wp = windParams(ptr, reduced);
        const R = wp.radius, R2 = R * R, k = wp.gain;
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

    // 펼친 손의 숨결: 손이 머무는 자리의 거품을 잔잔히 밀어내 살짝 갈라진다(서풍의 입김)
    const br = ok ? breathParams(ptr, reduced) : null;
    if (br) {
      const R = br.radius, R2 = R * R, F = br.force * dt;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        const ddx = p.x - ptr.x, ddy = p.y - ptr.y;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 < R2 && d2 > 0) {
          const d = Math.sqrt(d2);
          const f = (1 - d / R) * F / d;
          p.vx += ddx * f;
          p.vy += ddy * f;
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
    // 손 꽃잎: 빠르게 지나간 펼친 손의 자리에서 장미 꽃잎이 흩날린다.
    // 속도는 셸의 ptr.hand.speed(dt 상한으로 나눠 저fps에서 과대) 대신 실제 경과 realDt로 재계산한다.
    const speed = Number.isFinite(realDt) && realDt > 0 ? Math.hypot(ptr.dx, ptr.dy) / realDt : undefined;
    const e = ok ? petalEmit(handPetal, ptr, dt, reduced, handPetalCount, speed) : null;
    if (e) spawnFromHand(ptr.x, ptr.y, e);
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
    field = null; petals = []; bgGrad = null; ctx = null; handPetal = { cool: 0 }; handPetalCount = 0;
  },
};
