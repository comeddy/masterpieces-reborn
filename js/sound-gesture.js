// js/sound-gesture.js — 공용 소리 제스처 헬퍼. mic.level()(0..1, 노이즈 플로어 제거·평활 완료)을
// 지속 세기(energy: 숨·목소리)와 순간 스파이크(onset: 박수·외침)로 합성하는 순수 로직.
// 브라우저 API 미참조 — node:test 대상. 작품은 타이머·이벤트 없이 tick 첫머리에서 한 번 폴링한다:
//   sound = soundStep(mic && mic.active() ? mic.level() : 0, dt, snd);   // 비활성이면 0으로 스텝 → 자연 감쇠

export const GATE = 0.08;            // 이하 무시(배경 소음)
export const ATTACK = 10, RELEASE = 2.5;   // energy 상승/하강 반응(1/s)
export const ONSET_JUMP = 0.25;      // 직전 추세(ema) 대비 급등 문턱 → 박수·외침
export const ONSET_COOLDOWN = 0.5;   // 연속 발화 억제(초)
export const EMA_RATE = 4;           // 추세 추적 속도(1/s)

export function makeSoundState() { return { ema: 0, energy: 0, cool: 0 }; }

// level: mic.level() 0..1 (mic.js가 노이즈 플로어 제거·평활 완료). 반환 { energy, onset, strength }
//   energy   지속음 세기 0..1 — GATE 위를 attack/release 평활
//   onset    급등 1프레임 펄스 — true 인 프레임에서만 효과 발동, 쿨다운 동안 재발화 없음
//   strength 스파이크 크기 0..1 — onset 프레임에서만 > 0
export function soundStep(level, dt, s) {
  const raw = Math.max(0, Math.min(1, (level - GATE) / (1 - GATE)));
  const k = raw > s.energy ? ATTACK : RELEASE;
  s.energy += (raw - s.energy) * Math.min(1, k * dt);
  s.cool = Math.max(0, s.cool - dt);
  const jump = level - s.ema;
  let onset = false, strength = 0;
  if (jump >= ONSET_JUMP && s.cool <= 0) { onset = true; strength = Math.min(1, jump / 0.5); s.cool = ONSET_COOLDOWN; }
  s.ema += (level - s.ema) * Math.min(1, EMA_RATE * dt);
  return { energy: s.energy, onset, strength };
}
