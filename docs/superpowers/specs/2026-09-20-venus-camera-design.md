# 02번 After Botticelli — Birth of Venus 카메라 체험 설계 — 펼친 손이 서풍이 된다

- 날짜: 2026-09-20
- 대상: `js/pieces/02-birth-of-venus.js`, `js/data.js`(02번 항목), `test/venus-gesture.test.mjs`(신규),
  `test/data.test.mjs`, `README.md`
- 브랜치: `feature/venus-camera` (master `779aa0f` 기반, worktree `.worktrees/venus-camera`)
- 선례·정본: `2026-09-18-wave-hand-gesture-design.md`(01번 — 셸 손 합성 `handPointer` 규약),
  `2026-09-18-babel-camera-design.md`(10번 — 공용 `cam.js` 계약 정본), `2026-09-19-pearl-perf-design.md`(워커 추론)

## 요구 (사용자, 2026-09-20)

"After Botticelli — Birth of Venus에도 '카메라로 체험하기' 기능 넣어줘." 02번은 원래 드래그=바람,
클릭=돌풍의 입자 작품이다. 원작에서 바람은 왼쪽의 서풍 제피로스가 불어 여신을 해안으로 밀고
장미를 흩뿌린다 — 관객의 손이 그 서풍이 되는 것이 자연스러운 치환이다.

## 설계

### 입력 — 셸 손 합성 재사용 (작품에 손 인식 코드 없음)

01번과 같은 방식으로 `data.js` 02번에 `cam: true, handPointer: true, camHands: 1`을 켠다. 셸이
`hand-pointer.js`로 손을 포인터 규약에 합성하므로 기존 코드가 그대로 동작한다:

| 손 | 포인터 | 02번 반응 |
|---|---|---|
| 펼친 손 이동 | `down` + `dx,dy` | 방향성 바람(반경 내 입자를 이동 방향으로 밀기) |
| 주먹 → 펼침 | `justDown` | 돌풍(방사형 산란) |
| 펼친 손 정지 | `down`, `dx≈0` | **숨결**(신규, 손 전용) |
| 빠른 펼친 손 | `hand.speed ≥ 320px/s` | **손 꽃잎**(신규, 손 전용) |

카메라 영상은 화면에 그리지 않는다(코너 미러 없음 — 03·10·11·12번과 동일한 사용자 지시). 조준 피드백은
셸의 링 커서(`#hand-cursor`)만.

### 순수 함수 (`02-birth-of-venus.js` named export, node:test 대상)

```
HAND = { pushRadius 1.5, pushGain 1.25, gust 1.4, breathRadius 120, breathForce 80,
         petalSpeedMin 320, petalCool 0.16, petalMax 90 }
windParams(ptr, reduced)   → { radius, gain }        마우스 155/13(저모션 110/6) 그대로, 손이면 ×1.5/×1.25
gustParams(ptr, reduced)   → { radius, strength }    마우스 210/540(130/260), 손이면 ×1.4 (01번 물보라와 같은 손맛 상수)
breathParams(ptr, reduced) → { radius, force } | null 펼친 손(visible·down)에만, 저모션 힘 절반
petalEmit(state, ptr, dt, reduced, petalCount) → { n, dirx, diry, speed } | null
```

- 손 판정은 `ptr.hand && ptr.hand.visible`만 사용한다(01번 규약). 마우스 값은 어느 함수도 바꾸지 않는다.
- **왜 넓고 조금 세게**: 손은 EMA 평활(SMOOTH 14/s)·REACH 확대를 거친 포인터라 마우스보다 느리게 움직이고,
  펼친 손바닥은 점이 아니라 숨결의 면이다.
- **숨결**: 손 중심에서 방사형 가속 `force·(1−d/R)·dt`. 스프링(2.3~4.4)과 평형을 이뤄 손 아래 거품이
  20~35px 살짝 갈라지는 정도 — 구멍이 아니라 입김에 일렁이는 느낌. 마우스에는 없다.
- **손 꽃잎**: `hand.speed ≥ petalSpeedMin`인 펼친 손이 `petalCool`마다 2장(`petalSpeedMin×2` 이상이면 3장,
  저모션 1장·간격 2배)을 손 위치에서 진행 방향 ±0.45rad 부채로 날린다. 손 속도의 30%를 물려받아 튀어나간 뒤
  `drag 1.6`으로 느려지고 `g 24`로 가볍게 내려앉아 기존 바람·팔랑임에 실린다. `petals.length ≥ petalMax`면
  방출하지 않는다(비용 상한; 가장자리 꽃잎은 기존 주기 그대로). 쿨다운은 손이 없어도 dt만큼 흐른다.
- **NaN 가드**: `tick`은 `Number.isFinite(ptr.x/y)`가 아니면 그 프레임의 상호작용(돌풍·바람·숨결·꽃잎)을 건너뛴다
  — `field.scatter(NaN…)`가 전체 입자를 오염시키는 회귀 방지(11·12번과 같은 가드).
- 꽃잎 컬링에 상단(`y < −120`)을 추가한다 — 위로 날아간 손 꽃잎이 배열에 영구 잔류하지 않도록.

### 데이터·문구

- note 말미: "카메라 앞에서 펼친 손이 서풍이 되어 거품을 흩날리고, 주먹을 쥐었다 펼치면 돌풍이 몰아치며,
  손이 빠르게 지나간 자리에는 장미 꽃잎이 날린다."
- hint: "📷를 켜고 손을 펼쳐 바람을 일으키세요 · 주먹을 쥐었다 펼치면 돌풍 · 마우스는 드래그로 바람, 클릭으로 돌풍"
- 공용 버튼 문구(대기/준비 중/활성/실패)는 셸 중립 문구를 그대로 쓴다. 공용 파일(`cam.js`·`main.js`·
  `index.html`·`css`)은 변경하지 않는다.

### 무변경

응집·스프링·배경·가장자리 꽃잎 주기·렌더, 마우스 인터랙션 수치, 다른 작품·셸.

## 검증

- node:test `test/venus-gesture.test.mjs` 10건(마우스 불변·손 배율·숨결 조건·꽃잎 임계/쿨다운/총량 상한/NaN)
  + `test/data.test.mjs`에 02번 `handPointer·camHands·힌트 📷` 확인 + 전체 회귀.
- 헤드리스 Chrome E2E(스크래치, 저장소 밖): `--use-fake-device-for-media-stream` + `__CAM_CDN__` 시임의 가짜
  MediaPipe 번들로 실제 셸 경로(📷 → 워커 → 합성 → 02번 tick)를 통과 — 펼친 손 정지(링 커서·숨결) →
  빠른 스윕(바람·꽃잎 증가) → 주먹→펼침(돌풍) → 손 소실(커서 숨김) → 닫기/재진입, 콘솔 에러 0.
- **실제 웹캠 검증은 이 EC2에서 불가** — 사용자가 로컬/라이브에서 1회 확인(손 방향 일치, 주먹·펼침 판정,
  숨결 세기·꽃잎 빈도 체감). 부족하면 `HAND` 상수만 조정.

## YAGNI

두 손·핀치 등 추가 제스처, 손 방향에 따른 전역 바람 편향, 카메라 미리보기, 다른 작품 적용, 공용 계층 수정.
