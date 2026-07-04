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
