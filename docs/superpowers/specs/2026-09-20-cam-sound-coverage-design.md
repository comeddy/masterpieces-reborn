# 📷/🎤 전작품 커버리지 설계 — 05·06·07·16 손짓, 08·13·14·15 소리

- 날짜: 2026-09-20 · 브랜치 `feature/cam-sound-coverage` (worktree `.worktrees/cam-sound`) · master 4a09db7 기반
- 대상: `js/data.js`, `js/main.js`, `index.html`, `js/sound-gesture.js`(신규), `test/sound-gesture.test.mjs`(신규),
  `test/data.test.mjs`, `js/pieces/08-rain-steam-speed.js`, `13-inwang-after-rain.js`, `14-ssireum.js`, `15-lovers-moonlight.js`
- 구조 맵(작품별 ptr 사용·앵커·위험): 스크래치패드 `cam-sound/interaction-map.json`, `cam-sound/sound-ideas.md`

## 목표

📷도 🎤도 없는 8작품에 하나씩 적용한다(사용자 승인 4:4).
- 📷 손짓(셸 손 합성, 작품 코드 무변경): **05 해돋이·06 야경·07 해바라기·16 몽유도원도**
- 🎤 소리(작품 코드에 소리 반응): **08 비·증기·속도·13 인왕제색도·14 씨름·15 월하정인**
마우스는 모두 폴백으로 유지.

## 공용

### data.js
- 📷 4작품: `cam: true, handPointer: true, camHands: 1`. hint는 "📷를 켜고 …(손짓) · 마우스는 …(기존 조작)" 패턴, note 말미에 카메라 문장 1개.
- 🎤 4작품: `mic: true`. hint는 "🎤를 켜고 …(소리) · 마우스는 …(기존 조작)" 패턴, note 말미에 소리 문장 1개.
- 작품별 문구:

| 번호 | hint | note 추가 문장 |
|---|---|---|
| 05 | 📷를 켜고 손을 펼쳐 수면을 휘저으세요 · 주먹을 쥐었다 펼치면 태양이 눈부시게 빛납니다 · 마우스는 드래그로 물결, 클릭으로 태양 | 카메라 앞에서 펼친 손이 수면을 휘젓고, 주먹을 쥐었다 펼치면 태양이 광선을 뿜는다. |
| 06 | 📷를 켜고 손을 들어 어둠을 비추세요 · 주먹을 쥐었다 펼치면 화약 섬광 · 마우스는 커서로 비추고 클릭으로 섬광 | 카메라 앞에서는 당신의 손이 등불이 되어 어둠 속 인물들을 비추고, 주먹을 쥐었다 펼치면 화약이 번쩍인다. |
| 07 | 📷를 켜고 손을 좌우로 흔들어 붓바람을 일으키세요 · 주먹을 쥐었다 펼치면 가까운 꽃이 만개 · 마우스는 드래그로 붓바람, 클릭으로 개화 | 카메라 앞에서 손을 흔들면 붓바람이 꽃대를 눕히고, 주먹을 쥐었다 펼치면 손 아래 꽃이 활짝 핀다. |
| 16 | 📷를 켜고 펼친 손을 옆으로 움직여 두루마리를 펼치세요 · 손을 내리면 꿈이 다시 스스로 흐릅니다 · 마우스는 드래그로 펼치고 클릭으로 꽃잎 | 카메라 앞에서 펼친 손을 옆으로 움직이면 두루마리가 손을 따라 펴지고, 손을 내리면 꿈이 다시 제 속도로 흐른다. |
| 08 | 🎤를 켜고 숨을 불면 굴뚝이 증기를 뿜고 안개가 밀려납니다 · 외치거나 박수 치면 기적 · 마우스는 드래그로 안개, 클릭으로 기적 | 마이크에 숨을 불어 넣으면 기차가 숨을 쉬듯 증기를 뿜고 안개가 밀려나며, 외침이나 박수에 기적이 터진다. |
| 13 | 🎤를 켜고 숨을 불면 산허리 안개가 걷힙니다 · 박수를 치면 먹 한 방울 · 마우스는 드래그로 안개, 누르면 먹 | 마이크에 숨을 불면 비 갠 산의 안개가 걷히고 조용해지면 다시 차오르며, 박수 소리에 먹 한 방울이 떨어진다. |
| 14 | 🎤를 켜고 환호하세요 — 소리가 클수록 관중이 들썩입니다 · 외치거나 박수 치면 기술 · 마우스는 클릭으로 기술, 드래그로 파도응원 | 마이크에 환호를 보내면 소리 크기만큼 구경꾼이 들썩이고, 외침이나 박수에 씨름꾼이 기술을 건다. |
| 15 | 🎤를 켜고 "후—" 바람 소리를 내면 구름이 달을 가립니다 · 박수를 치면 초롱불이 깜빡 · 마우스는 커서로 구름, 클릭으로 초롱불 | 마이크에 바람 소리를 내면 구름이 달로 흘러가 밤이 깊어지고, 박수 소리에 초롱불이 깜빡인다. |

### main.js · index.html (🎤 버튼 작품 중립화, 📷 버튼과 대칭)
- `MIC_LABEL = "🎤 소리로 체험하기"`, 활성 "🎤 듣는 중 — 소리를 내보세요"(유지), 실패 "마이크를 사용할 수 없어요 — 마우스로 체험하세요".
- `index.html` `#v-mic` 초기 텍스트 "🎤 소리로 체험하기", `title="소리는 브라우저 안에서만 분석되며 녹음·전송되지 않습니다"`.
- 09번 hint의 "🎤를 켜고 소리로 생명을 불어넣으세요"는 작품 문구이므로 유지.

### test/data.test.mjs
- mic 플래그 테스트의 `["09"]` 하드코딩을 제거하고 typeof boolean 검사만 남긴다(cam 테스트와 동일 형태). handPointer→cam 의존 테스트는 그대로.

### js/sound-gesture.js — 신규 순수 모듈(node:test 대상, 브라우저 API 미참조)
```js
export const GATE = 0.08;            // 이하 무시(배경 소음)
export const ATTACK = 10, RELEASE = 2.5;   // energy 상승/하강 반응(1/s)
export const ONSET_JUMP = 0.25;      // 직전 추세(ema) 대비 급등 문턱 → 박수·외침
export const ONSET_COOLDOWN = 0.5;   // 연속 발화 억제(초)
export const EMA_RATE = 4;           // 추세 추적 속도(1/s)
export function makeSoundState() { return { ema: 0, energy: 0, cool: 0 }; }
// level: mic.level() 0..1 (mic.js가 노이즈 플로어 제거·평활 완료). 반환 { energy, onset, strength }
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
```
- `energy` = 지속음 세기(숨·목소리), `onset` = 순간 스파이크(박수·외침) 1프레임 펄스, `strength` = 스파이크 크기 0..1.
- 테스트: 무음→energy 0·onset 없음; 0.5 지속 → 0.5s 안에 energy ≥ 0.35, 멎으면 2s 안에 < 0.05; 0→0.6 급등 → onset 1회(strength>0), 쿨다운 내 재급등 무시, 쿨다운 뒤 새 급등엔 재발화; 프레임당 +0.02 완만 상승은 onset 없음; GATE 이하 지속음은 energy 0; 반환 필드 존재; energy·strength 0..1 클램프.

### 작품 통합 패턴(4작품 공통)
```js
import { makeSoundState, soundStep } from "../sound-gesture.js";
let mic = null, snd = makeSoundState(), sound = { energy: 0, onset: false, strength: 0 };
// init: mic = (opts.audio && opts.audio.mic) || null; snd = makeSoundState();
// tick 첫머리: sound = soundStep(mic && mic.active() ? mic.level() : 0, dt, snd);   // 비활성이면 0으로 스텝 → 자연 감쇠
// dispose: mic = null;
```
- reducedMotion이면 소리 진폭 계수를 절반으로. 마이크 비활성·거부 시 기존 마우스 동작 100% 유지.
- 작품은 타이머·이벤트를 쓰지 않는다(기존 규약).

## 작품별 소리 매핑(구조 맵 근거, 기존 클릭 효과 재사용)

- **08 비·증기·속도**: `energy` → 굴뚝(trainPose(trainT).stackX/Y)에서 초당 `4 + 12·energy`개의 작은 증기(puff) 지속 방출(누적 카운터), 기차 위치를 앵커로 한 방사형 안개 밀어내기 `breath`(stir와 별도 변수, 반경 W·0.35, 세기 ∝ energy), 빗줄기 속도·알파 ×(1 + 0.3·energy). `onset` → 기존 `whistle()`. **whistle에 0.6s 쿨다운 추가**(클릭 연타에도 적용), `puffs` 상한 200(초과 시 오래된 것 제거).
- **13 인왕제색도**: `energy` → 안개 3밴드 `baseA` 승수 `1 − 0.7·energy`(energy는 이미 평활). `onset` → `stampInk` 먹 방울 1개(peak 0.9 + 0.5·strength, r 3 + 1.5·strength) — 앵커: `ptr.inside`면 포인터 위치, 아니면 fit 사각형 안 전경(y 0.5~0.9)에서 의사난수 위치(`T` 기반 결정적). 소리용 스팟은 `spots` 배열에 넣지 않는다(드래그 스팟 32캡 보호).
- **14 씨름**: `energy` → 구경꾼(엿장수 제외) `f.exc = max(f.exc, 1.2·energy)`(덧셈 금지 — 포화 방지), 씨름꾼 유휴 rock/bob 진폭 ×(1 + 0.6·energy). `onset` → `tech < 0`(진행 중 아님)일 때만 `tech = 0` + `waves.push` 중심 = 씨름꾼 피벗(puppet pivot). waves 6캡 유지.
- **15 월하정인**: `wind = energy` → 구름 목표를 `lerp(기본 목표, MOON, wind)`로 단일 목표(tx,ty)로 합산해 한 번만 lerp(포인터 추종 코드와 통합). 기본 목표 = 커서 안이면 커서, 밖이면 소리로 움직인 뒤(`soundMoved`)라면 초기 위치(W·0.5, H·0.86 — 소리가 멎으면 구름이 물러나 달빛 회복), 아니면 현재 위치(마우스 기존 동작 유지). 소리로 움직일 때 `seeded = true`, `cloudR`·churn ×(1 + 0.4·wind). `onset` → `lanternPulse = 0.5`(기존 클릭 효과), 헬퍼 쿨다운으로 연발 억제.

## 📷 4작품(코드 무변경) 확인 사항
- 05: 펼친 손 정지 시 EMA 미세 진동으로 약한 리플이 드물게 생길 수 있음 — 허용(20px 문턱).
- 06: 등불 위치 추종·justDown 섬광 모두 손 합성과 호환. 잔광 스팟은 `ptr.inside`(손 합성 시 true) 조건 — 동작함.
- 07: 펼친 손의 미세 dx로 붓바람이 약하게 지속될 수 있음 — 임펄스가 dx에 비례해 시각 영향 미미, 허용.
- 16: 펼친 손을 든 채 정지하면 자동 유람이 멈춤(주먹/손 내림 후 1.6s 재개) — hint에 명시("손을 내리면 꿈이 다시 스스로 흐릅니다").

## 검증
1. `node --test test/` 전부 통과(신규 sound-gesture 테스트 포함).
2. 가짜 카메라 대본(`cam.js` 스텁, 단계 제어 `window.__handPhase`)으로 05·06·07·16: 펼친 손 이동 구간에서 손 주변 캔버스 변화(기준 프레임 대비), 주먹→펼침 직후 작품별 효과(05 태양 밝기 급증, 06 등불 반경 확장, 07 꽃 개화 영역 변화, 16 camX 이동은 손 이동 시 두루마리 이동으로) 확인, 콘솔 에러 0, 📷 버튼 노출·hint 일치.
3. 가짜 마이크 대본(`mic.js` 스텁: `active/request/level/stop` + 시간표 또는 `window.__micLevel`)으로 08·13·14·15: 무음 기준 프레임 → 지속음(0.5) 3초 → 스파이크(0.9) → 무음. 지속음 구간에서 작품별 지표(08 굴뚝 위 증기 픽셀 증가, 13 안개 밴드 밝기 감소, 14 관중 영역 움직임 증가, 15 구름이 달 쪽으로 이동·달 가림) 확인, 스파이크 직후 클릭 효과 발동(08 기적 puff·진동, 13 먹 방울, 14 파문·기술, 15 초롱 펄스), 콘솔 에러 0, 🎤 버튼 노출·중립 문구·hint 일치.
4. 콘텐츠 게이트(≥85) 후 배포는 사용자 지시 시.

## 하지 않는 것
- 09번 변경, 작품별 별도 버튼, 설명 패널 자동 숨김과의 상호작용 변경, 두 채널 동시 적용, 마이크 주파수 분석.
