// test/fixtures/fake-vision/vision_bundle.mjs — E2E용 가짜 MediaPipe.
// cam.js가 window.__CAM_CDN__ 시임으로 이 번들을 로드하면, 테스트가
// window.__FAKE_HANDS__ = { n, x, y } (x,y는 화면 기준 0..1)로 손을 연출한다.
export const FilesetResolver = { forVisionTasks: async () => ({}) };
export class HandLandmarker {
  static async createFromOptions() { return new HandLandmarker(); }
  detectForVideo() {
    const s = (typeof window !== "undefined" && window.__FAKE_HANDS__) || { n: 0, x: 0.5, y: 0.5 };
    const mk = (x, y) => Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
    const landmarks = [];
    if (s.n >= 1) landmarks.push(mk(1 - s.x, s.y));      // cam.js가 1-x 반전하므로 역반전 주입
    if (s.n >= 2) landmarks.push(mk(Math.max(0, 1 - s.x - 0.2), s.y));
    return { landmarks };
  }
  close() {}
}
