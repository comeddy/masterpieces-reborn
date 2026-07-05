// js/pieces/13-inwang-after-rain.js — 임시 스텁 (Task 3에서 실제 구현으로 교체)
let W = 0, H = 0, ctx = null;
export default {
  init(o) { ctx = o.ctx; W = o.width; H = o.height; },
  tick() {
    ctx.fillStyle = "#f2ead8";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(30,25,20,0.85)";
    ctx.font = "500 28px 'Cormorant Garamond', serif";
    ctx.textAlign = "center";
    ctx.fillText("준비 중 — After Jeong Seon", W / 2, H / 2);
  },
  resize(w, h) { W = w; H = h; },
  dispose() { ctx = null; },
};
