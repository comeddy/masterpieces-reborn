// test/fixtures/fake-vision/vision_bundle.mjs — E2E용 가짜 MediaPipe.
// cam.js가 window.__CAM_CDN__ 시임으로 이 번들을 로드하면, 테스트가
// window.__FAKE_HANDS__ = { n, x, y, pinch? } (x,y는 화면 기준 0..1)로 손을 연출한다.
// pinch가 없으면(undefined) 활짝 벌린 손으로 취급(기존 {n,x,y} 호환).
// 워커에서는 cam.js가 frame 메시지의 fake로 globalThis에 주입(메인 폴백에서는 globalThis===window).
export const FilesetResolver = { forVisionTasks: async () => ({}) };
export class HandLandmarker {
  static async createFromOptions() { return new HandLandmarker(); }
  detectForVideo() {
    const s = (typeof globalThis !== "undefined" && globalThis.__FAKE_HANDS__) || { n: 0, x: 0.5, y: 0.5 };
    // 손 형태 근사(원본=미반전 좌표 — cam.js가 1-x 반전하므로 화면 x를 역반전해 넣는다)
    const mk = (sx, y, pinch) => {
      const x = 1 - sx, size = 0.12, gap = pinch ? size * 0.1 : size * 0.8;
      const lm = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
      lm[0] = { x, y: y + size, z: 0 };                    // 손목: 손바닥 아래
      lm[5] = { x: x - 0.02, y, z: 0 }; lm[9] = { x: x + 0.02, y, z: 0 };
      lm[4] = { x: x - gap / 2, y: y - 0.06, z: 0 };       // 엄지 끝
      lm[8] = { x: x + gap / 2, y: y - 0.06, z: 0 };       // 검지 끝
      return lm;
    };
    const landmarks = [];
    if (s.n >= 1) landmarks.push(mk(s.x, s.y, !!s.pinch));
    if (s.n >= 2) landmarks.push(mk(Math.min(1, s.x + 0.2), s.y, false));
    return { landmarks };
  }
  close() {}
}
