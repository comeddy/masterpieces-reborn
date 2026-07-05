# 한국 확장 (황소 교체 + Ⅳ관) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 12번 작품을 이중섭 〈황소〉 종이 인형극으로 교체하고, Ⅳ관 "한국의 방"에 조선 회화 4점(인왕제색도·씨름·월하정인·몽유도원도)을 신규 기법으로 추가한 뒤 재배포한다.

**Architecture:** 기존 전시 셸(main.js)·엔진은 무변경 — 셸은 data.js 주도라 데이터 확장만으로 카드/뷰어가 자동 반영된다. 창작 모듈 5개는 **구현 에이전트가 원작 이미지를 직접 검색·수집해 렌더와 나란히 비교·보정하며 제작**한다(스펙 명시 프로세스 — 계획서는 코드 대신 행동 계약과 수용 기준을 제공). 구조 변경(데이터/문구/테스트/스텁)은 본 계획의 코드가 정본이다.

**Tech Stack:** 기존과 동일 (Vanilla ES Modules, Canvas 2D, Node 20 테스트, Playwright MCP 검증, AWS CLI 배포).

## Global Constraints

- 작품 모듈 계약(기존과 동일): default export `{init(opts), tick(dt, pointer), resize(w,h), dispose()}`. opts=`{canvas, ctx, width, height, assets:{target}, reducedMotion, audio}`. 모듈 내 addEventListener/requestAnimationFrame/setInterval/setTimeout 금지, 시간은 dt 누적, 입력은 pointer만, document는 함수 내부 오프스크린 캔버스 생성만 허용, CSS px 좌표, `assets.target` null 시 절차적 폴백, reducedMotion 감쇠.
- **원작 수집 프로세스(스펙 핵심)**: 창작 태스크(1, 3~6)의 구현 에이전트는 원작 이미지를 컨트롤러에게 받지 않고 **직접 웹에서 검색·수집**한다. 렌더 스크린샷과 원작을 나란히 비교하며 보정하고, **비교 라운드 최소 2회**(라운드별 발견한 차이 → 반영한 수정)를 보고서에 기록한다.
- 저작권: 12번 황소(이중섭, 1916–1956)는 원작 이미지를 **스크래치패드에만** 저장 — 저장소·assets·사이트 포함 금지, medium에 "public domain" 문구 금지. 13~16번 조선 회화는 완전 PD — `assets/targets/`에 번들하고 확보한 안정 URL을 `tools/fetch-targets.sh`에 추가.
- 외부 JS 라이브러리 금지(폰트만 Google Fonts 허용). 커밋 메시지는 한국어 + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` 푸터.
- 로컬 검증: `python3 -m http.server 8090` 이미 구동 중(**8080 사용 금지**). Playwright MCP로 브라우저 검증.
- 사실 표기: 이중섭 1916–1956 〈황소〉 c.1953 / 정선 1676–1759 〈인왕제색도〉 1751 / 김홍도 1745–c.1806 〈씨름〉 c.1780 / 신윤복 1758–c.1813 〈월하정인〉 c.1793 / 안견 15세기 〈몽유도원도〉 1447.

## 작품 태스크 공통 검증 절차 (창작 태스크의 "브라우저 검증")

1. `node --check js/pieces/<파일>` 통과 + `node --test test/` 전체 통과
2. http://127.0.0.1:8090 → 해당 카드 클릭 → 3초 → 스크린샷 (형상 확인 — 빈/검은 화면 실패)
3. 드래그 시뮬레이션 → 유휴와 다른 화면인지 스크린샷 비교
4. 클릭 1회 → 반응 확인 → 5초 → 안정 스크린샷
5. 콘솔 에러 0 (이 세션 신규 발생분 기준)
6. ✕ 닫기 → 아트리움 → 같은 작품 재진입 (dispose/재init)
7. **원작 비교 라운드 ≥2**: [렌더 스크린샷 ↔ 원작] 나란히 검토 → 실루엣/팔레트/질감 차이 기록 → 수정 → 재비교. 보고서에 라운드별 기록.

---

### Task 1: 작품 12 교체 — After Lee Jung-seob, Bull (황소 인형극)

**Files:**
- Create: `js/pieces/12-bull-puppet.js`
- Modify: `js/data.js` (12번 항목 교체)
- Modify: `tools/fetch-targets.sh` (12번 fetch 줄+주석 2줄 삭제, 마지막 `…/7` → `…/6`)
- Delete: `js/pieces/12-sudden-shower.js`, `assets/targets/12-sudden-shower.jpg`

**Interfaces:**
- Consumes: main.js 구동 규약(Global Constraints의 모듈 계약).
- Produces: 없음 (말단 작품 모듈).

- [ ] **Step 1: 원작 조사 (에이전트 직접 수행)**

WebSearch/WebFetch(또는 Playwright)로 이중섭 〈황소〉(c.1953) 원작 이미지를 직접 검색·확보한다. 후보: Wikimedia Commons, 미술관 아카이브, 언론 보도 이미지. **스크래치패드 디렉터리에만 다운로드** (`/tmp/claude-1000/-home-ec2-user-media-art2/*/scratchpad/ref-bull/` 권장) — 저장소·assets에 절대 포함 금지. 관찰 기록: 실루엣(등선의 각, 뿔 방향, 벌린 입, 앞다리 자세), 팔레트(황토·주홍 배경, 먹빛 윤곽, 흰 하이라이트), 붓질(굵고 빠른 획).

- [ ] **Step 2: data.js 12번 항목 교체**

기존 12번(After Hiroshige) 객체를 다음으로 교체:

```js
  {
    no: "12", wing: "dream", title: "After Lee Jung-seob — Bull", ko: "황소",
    medium: "Paper puppet theatre · after Lee Jung-seob (c.1953)", year: "2026",
    note: "이중섭의 황소가 가위로 오려낸 종이 인형이 되어 작은 무대에 오른다. 굵은 윤곽과 황토빛 붓질의 조각들이 막대 끝에서 움직이며 느릿하게 걷고, 고개를 흔들고, 이따금 온몸으로 울부짖는다. 막대를 잡아 직접 조종해보라 — 소는 당신의 손끝에서도 이중섭의 소로 남는다.",
    hint: "드래그로 막대를 잡아 조종하세요 · 클릭으로 돌진 · 가만두면 소극이 계속됩니다",
    module: "./pieces/12-bull-puppet.js",
  },
```

(asset 필드 없음 주의.) 구 파일 2개 삭제 + fetch-targets.sh 정리(12번 줄과 그 위 주석 2줄 삭제, `완료:` 줄의 `/7`→`/6`).

- [ ] **Step 3: js/pieces/12-bull-puppet.js 구현 (창작 — 코드는 에이전트 작성)**

행동 계약 (전부 충족):
- **무대**: 프로시니엄 아치 + 양옆 붉은 커튼(주름) + 각광 3~5개(아래→위 글로우) + 이중섭풍 주홍 노을 배경막(거친 붓결, init/resize 시 오프스크린 베이크 권장) + 나무 판자 바닥.
- **인형**: 황소를 오려낸 조각들 — 몸통(루트), 머리+목(1관절), 앞다리 2·뒷다리 2(각 1~2관절), 꼬리(1관절). 각 조각: 굵은 먹빛 윤곽 + 황토/주홍 방향성 붓질 텍스처 + **가위 단면(흰 종이 테두리, 미세하게 삐뚤한 절단선)** + 조각에서 무대 아래로 뻗는 가는 나무 막대. 배경막에 부드러운 오프셋 그림자.
- **자동 공연(유휴)**: 걷기(다리 위상 보행+몸통 보빙) → 고개 젓기 → 울부짖기(머리 들어올림+온몸 들썩+각광 밝아짐) 루프, dt 기반 이징 전환.
- **드래그**: 커서에서 가장 가까운 막대(조각)를 잡아 조종 — 잡힌 조각은 커서 추종, 나머지 관절은 스프링 추종. 놓으면 공연 자세로 서서히 복귀.
- **클릭**: 돌진 — 무대를 가로질러 달림 + 커튼 들썩 + 무대 미세 진동. **reducedMotion**: 들썩임·돌진·진동 감쇠.
- 분량 가이드 150~320줄. 60fps 목표.

- [ ] **Step 4: 브라우저 검증** — 공통 검증 절차(원작 비교 라운드 ≥2 포함). 특화: 자동 공연 3동작이 순환하는지 시간차 스크린샷 3장.

- [ ] **Step 5: 커밋**

```bash
git add js/data.js js/pieces/12-bull-puppet.js tools/fetch-targets.sh
git rm js/pieces/12-sudden-shower.js assets/targets/12-sudden-shower.jpg
git commit -m "feat: 작품 12 교체 — 이중섭 황소 종이 인형극 (히로시게 소나기 제거)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Ⅳ관 구조 확장 — 데이터·문구·테스트·스텁

**Files:**
- Modify: `js/data.js` (WINGS Ⅳ관 + WORKS 13~16 추가)
- Modify: `index.html` (hero 문구·메타·콜로폰)
- Modify: `test/data.test.mjs` (16작품/4관 기준)
- Create: `js/pieces/13-inwang-after-rain.js`, `js/pieces/14-ssireum.js`, `js/pieces/15-lovers-moonlight.js`, `js/pieces/16-dream-journey.js` (임시 스텁 — Task 3~6에서 실제 구현으로 교체)

**Interfaces:**
- Consumes: Task 1 완료 상태(12번 황소).
- Produces: 13~16번 data 항목(아래 코드가 정본 — Task 3~6이 이 메타데이터에 의존), 스텁 모듈 파일명.

- [ ] **Step 1: 테스트 수정 (RED 먼저)**

`test/data.test.mjs`에서 다음 3곳 수정:

```js
// (1) "전시관은 3개이고..." 테스트
  assert.equal(WINGS.length, 4);
  // ... (아래 Set 크기도)
  assert.equal(new Set(WINGS.map(w => w.id)).size, 4);

// (2) "작품은 12점이고..." 테스트 → 16점
test("작품은 16점이고 번호 01..16이 정확하다", () => {
  assert.equal(WORKS.length, 16);
  const nos = WORKS.map(w => w.no);
  assert.deepEqual(nos, Array.from({ length: 16 }, (_, i) => String(i + 1).padStart(2, "0")));
});
```

(3) "관별 작품 수는 4점씩" 테스트는 WINGS 루프라 수정 불필요 — 4관 모두 4점이면 통과.

Run: `node --test test/data.test.mjs` → Expected: FAIL (아직 3관/12작품)

- [ ] **Step 2: data.js 확장**

WINGS 배열에 추가:

```js
  { id: "korea", index: "Ⅳ", name: "Korean Masters", sub: "한국의 방", accent: "#63b8a0" },
```

WORKS 배열 끝(12번 뒤)에 추가:

```js
  // ---- Ⅳ관 · 한국의 방 — 조선 회화, 신규 기법 ----
  {
    no: "13", wing: "korea", title: "After Jeong Seon — Inwang After Rain", ko: "인왕제색도",
    medium: "Ink-wash diffusion · after Jeong Seon (1751, public domain)", year: "2026",
    note: "비 갠 인왕산의 물기 어린 공기가 되살아난다. 안개가 산허리를 감싸며 흘렀다 걷히기를 반복하고, 화면을 누르면 먹 한 방울이 화선지에 스며 번져나간다. 진경산수의 바위 절벽은 먹빛이 깊을수록 단단해진다 — 겸재가 그린 비 갠 아침 그대로.",
    hint: "화면을 눌러 먹을 떨어뜨리세요 · 드래그로 안개를 밀어내세요",
    module: "./pieces/13-inwang-after-rain.js", asset: "assets/targets/13-inwang-after-rain.jpg",
  },
  {
    no: "14", wing: "korea", title: "After Kim Hong-do — Ssireum", ko: "씨름",
    medium: "Living crowd · after Kim Hong-do (c.1780, public domain)", year: "2026",
    note: "단원의 씨름판이 실제로 벌어진다. 구경꾼 하나하나가 저마다의 리듬으로 들썩이고 부채를 부치다가, 씨름꾼이 기술을 거는 순간 환호가 물결처럼 번져나간다. 그 소란 속에서도 엿장수만은 무심히 제 갈 길을 간다 — 단원이 숨겨둔 웃음 그대로.",
    hint: "클릭으로 기술을 거세요 · 환호가 물결처럼 번집니다 · 드래그로 파도응원",
    module: "./pieces/14-ssireum.js", asset: "assets/targets/14-ssireum.jpg",
  },
  {
    no: "15", wing: "korea", title: "After Shin Yun-bok — Lovers under the Moon", ko: "월하정인",
    medium: "Moonlight narrative · after Shin Yun-bok (c.1793, public domain)", year: "2026",
    note: "'달빛 침침한 삼경, 두 사람 마음은 두 사람만 안다(月沈沈夜三更 兩人心事兩人知).' 혜원이 담벼락에 적어둔 그 밤이 흐른다. 초승달이 천천히 차고 기울며 밤의 깊이가 변하고, 당신의 커서가 구름이 되어 달을 가리면 — 초롱불 하나만 남은 어둠 속에서 밀회는 조금 더 깊어진다.",
    hint: "커서가 구름이 되어 달을 가립니다 · 클릭으로 초롱불 깜빡임",
    module: "./pieces/15-lovers-moonlight.js", asset: "assets/targets/15-lovers-moonlight.jpg",
  },
  {
    no: "16", wing: "korea", title: "After An Gyeon — Dream Journey", ko: "몽유도원도",
    medium: "Scroll journey · after An Gyeon (1447, public domain)", year: "2026",
    note: "안평대군이 꿈에서 본 복사꽃 이상향을 안견이 사흘 만에 그렸다. 두루마리를 펼치듯 화면을 끌면 왼쪽의 현실 세계에서 험준한 기암절벽을 지나 오른쪽 도원경으로 여행이 이어진다. 가만히 두면 꿈이 스스로 흘러간다 — 도원에 이르면 복사꽃잎이 바람에 날린다.",
    hint: "드래그로 두루마리를 펼치세요 · 꿈은 왼쪽에서 오른쪽으로 흐릅니다",
    module: "./pieces/16-dream-journey.js", asset: "assets/targets/16-dream-journey.jpg",
  },
```

- [ ] **Step 3: 스텁 모듈 4개 생성**

각 파일에 아래 패턴(제목만 다르게). 13번 예시 — 14/15/16은 fillText의 제목 문자열만 각각 `"After Kim Hong-do"`, `"After Shin Yun-bok"`, `"After An Gyeon"`으로:

```js
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
```

주의: 스텁 단계에서는 asset 이미지가 아직 없어 `loadImage`가 null을 반환하지만 스텁은 assets를 사용하지 않으므로 무해. **integrity 테스트의 asset 존재 검사는 13~16 이미지가 없어 FAIL한다 — 이 태스크에서는 아직 이미지를 받지 않으므로, integrity 테스트의 asset 검사가 실패하면 안 되게 이미지 4개를 먼저 placeholder로 두는 대신, Task 3~6에서 각자 이미지를 확보한다. 따라서 이 태스크의 test 실행은 `node --test test/data.test.mjs test/particle-engine.test.mjs`로 한정하고, integrity는 Task 6 완료 후부터 전체 실행.**

- [ ] **Step 4: index.html 문구 수정**

- meta description: `12점` → `16점`
- hero__lead: `호쿠사이의 파도에서 칸딘스키의 도형까지` → `호쿠사이의 파도에서 안견의 도원경까지`, `열두 점` → `열여섯 점`, `세 개의 전시관` → `네 개의 전시관`
- hero__meta: `12 WORKS` → `16 WORKS`, `3 WINGS` → `4 WINGS`
- 콜로폰: `모든 원작은 퍼블릭 도메인입니다` → `원작은 저작권이 만료되었거나 재해석으로만 참조했습니다`

- [ ] **Step 5: 테스트 GREEN 확인 + 브라우저 확인**

Run: `node --test test/data.test.mjs test/particle-engine.test.mjs` → PASS (8 tests)
브라우저: 아트리움에 Ⅳ관 섹션 + 16카드(13~16은 스텁 "준비 중" 화면), hero가 16 WORKS/4 WINGS.

- [ ] **Step 6: 커밋**

```bash
git add js/data.js index.html test/data.test.mjs js/pieces/1[3-6]-*.js
git commit -m "feat: Ⅳ관 '한국의 방' 구조 확장 — 16작품/4관 (13~16 스텁)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### 창작 태스크 공통: 원작 이미지 확보 절차 (Task 3~6의 "Step 1")

1. WebSearch/WebFetch(또는 Playwright)로 해당 원작의 공개 이미지를 직접 검색 — 우선 Wikimedia Commons(`Special:FilePath/<파일명>?width=<크기>`), 다음 국립중앙박물관 e뮤지엄 등.
2. 확보한 URL로 `assets/targets/<파일명>.jpg` 다운로드 (data.js asset 경로와 파일명 일치). JPEG 매직바이트(`ffd8ff`)·크기(10KB~600KB) 검증. Wikimedia는 **허용 썸네일 버킷만 리사이즈**함(비허용 크기는 원본 폴백) — 원하는 폭에 가장 가까운 허용 버킷을 probe로 찾아 채택.
3. `tools/fetch-targets.sh`에 fetch 줄 추가(짧은 한국어 주석 포함) + 마지막 `완료: …/N` 분모 +1. 재실행 재현성 확보.
4. 다운로드가 끝내 실패하면: data.js에서 해당 asset 필드 제거, 절차적 폴백으로 구현, 보고서에 명시.

---

### Task 3: 작품 13 — After Jeong Seon, 인왕제색도 (수묵 번짐)

**Files:**
- Modify: `js/pieces/13-inwang-after-rain.js` (스텁 → 실제 구현)
- Create: `assets/targets/13-inwang-after-rain.jpg` (폭 ~1024px)
- Modify: `tools/fetch-targets.sh`

**Interfaces:** Consumes: 모듈 계약, Task 2의 data 항목. Produces: 없음.

- [ ] **Step 1: 원작 확보** — 공통 절차. 관찰 기록: 비에 젖은 검은 바위 절벽(적묵법), 산 아래 띠처럼 걸린 안개, 화면 전체의 묵직한 먹빛 대비.
- [ ] **Step 2: 구현 (창작)** — 행동 계약:
  - 원작을 contain-fit 배경으로(한지 톤 여백), 반투명 안개 층 2~3겹이 산허리를 수평으로 흐르며 자욱→걷힘 사이클(dt 기반, 주기 상이).
  - 클릭 = 먹 방울: 캔버스 1/8~1/6 해상도 오프스크린 격자에서 농도 확산 시뮬레이션(인접 셀 확산 + 미세 증발), 업스케일 후 어둡게 합성(multiply 계열) — 화선지에 스며드는 번짐. 격자 크기는 성능(60fps)과 번짐 질감의 균형으로 조정.
  - 드래그 = 커서 주변 안개 밀도 감소(밀어내기), 손을 떼면 서서히 회복.
  - reducedMotion: 안개 흐름 속도 절반.
- [ ] **Step 3: 브라우저 검증** — 공통 검증 절차(비교 라운드 ≥2: 특히 안개 위치가 원작의 안개 띠와 어울리는지, 먹빛 톤). 특화: 먹 방울 3회 연속 클릭 시 번짐이 서로 합쳐지는지.
- [ ] **Step 4: 커밋**

```bash
git add js/pieces/13-inwang-after-rain.js assets/targets/13-inwang-after-rain.jpg tools/fetch-targets.sh
git commit -m "feat: 작품 13 — 인왕제색도 (수묵 번짐·안개)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 작품 14 — After Kim Hong-do, 씨름 (살아있는 군중)

**Files:**
- Modify: `js/pieces/14-ssireum.js` (스텁 → 실제 구현)
- Create: `assets/targets/14-ssireum.jpg` (폭 ~1024px)
- Modify: `tools/fetch-targets.sh`

**Interfaces:** Consumes: 모듈 계약, Task 2의 data 항목. Produces: 없음.

- [ ] **Step 1: 원작 확보** — 공통 절차. 관찰 기록: 원형으로 둘러앉은 구경꾼(위쪽 8명·왼쪽 5명·오른쪽 5명·아래 2명 대략), 중앙 씨름꾼 2명(들배지기 직전), 오른쪽에 갓 벗어둔 것·신발, **왼쪽의 엿장수**(구경꾼과 반대로 바깥을 봄).
- [ ] **Step 2: 구현 (창작)** — 행동 계약:
  - 원작을 contain-fit 배경으로. 인물별 타원 영역을 상수 배열로 정의(u,v 정규화 — **원작 비교로 좌표 확정**, 구경꾼 15~20명 + 씨름꾼 1쌍 + 엿장수 1명).
  - 각 구경꾼 영역: 원본에서 크롭한 조각이 개별 위상으로 미세 들썩·기울임(±1~3px/±1~2도) — 살아있는 웅성거림.
  - 클릭 = 기술: 씨름꾼 쌍 조각이 함께 들리며 기울어졌다 내려옴(들배지기 모션, 0.8초 이징) + 클릭 지점에서 방사형 환호 파동(도달한 구경꾼의 들썩임 진폭 일시 증폭).
  - 드래그 = 파도응원: 커서가 지나간 구경꾼들이 순차로 크게 들썩.
  - **엿장수는 어떤 파동에도 반응하지 않음**(무심함 연출 — 자기 리듬만).
  - reducedMotion: 들썩임 진폭 절반, 기술 모션 완화.
- [ ] **Step 3: 브라우저 검증** — 공통 검증 절차(비교 라운드 ≥2: 인물 영역 좌표가 실제 인물과 일치하는지 마커 오버레이로 확인). 특화: 환호 파동의 방사형 전파 시간차 스크린샷.
- [ ] **Step 4: 커밋**

```bash
git add js/pieces/14-ssireum.js assets/targets/14-ssireum.jpg tools/fetch-targets.sh
git commit -m "feat: 작품 14 — 씨름 (살아있는 군중·환호 파동)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 작품 15 — After Shin Yun-bok, 월하정인 (달빛 내러티브)

**Files:**
- Modify: `js/pieces/15-lovers-moonlight.js` (스텁 → 실제 구현)
- Create: `assets/targets/15-lovers-moonlight.jpg` (폭 ~1024px)
- Modify: `tools/fetch-targets.sh`

**Interfaces:** Consumes: 모듈 계약, Task 2의 data 항목. Produces: 없음.

- [ ] **Step 1: 원작 확보** — 공통 절차. 관찰 기록: 담벼락 아래 초롱을 든 남자와 쓰개치마를 쓴 여인, 하늘의 **눈썹달(아래로 볼록한 형태 — 원작 그대로 재현)**, 담장 옆 화제(畵題) 글씨 위치.
- [ ] **Step 2: 구현 (창작)** — 행동 계약:
  - 원작을 contain-fit 배경으로, 밤 색조 오버레이. 광원 2개: 달(원작 위치 기준, 아주 느리게 차고 기울며 장면 밝기·색온 변화)과 초롱불(연인 옆, 따뜻한 플리커 — 국소 글로우).
  - 커서 = 구름: 부드러운 구름 형상이 커서를 lerp 추종. 구름이 달과 겹치면 전체 조도 하강(달빛 성분 소멸) + 초롱불 글로우만 남음. 걷히면 서서히 복귀.
  - 어두워질수록 연인 영역이 서로 살짝 기울어지는 미세 오버레이(2~3px 변위 크롭 조각).
  - 클릭 = 초롱불 깜빡임(짧은 밝기 파동).
  - reducedMotion: 플리커·변위 감쇠.
- [ ] **Step 3: 브라우저 검증** — 공통 검증 절차(비교 라운드 ≥2: 달·초롱·연인 좌표 정합, 밤 색조가 원작 분위기를 해치지 않는지). 특화: 구름으로 달을 가린 상태/걷힌 상태 대비 스크린샷.
- [ ] **Step 4: 커밋**

```bash
git add js/pieces/15-lovers-moonlight.js assets/targets/15-lovers-moonlight.jpg tools/fetch-targets.sh
git commit -m "feat: 작품 15 — 월하정인 (달빛 내러티브·구름 커서)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 작품 16 — After An Gyeon, 몽유도원도 (두루마리 여행)

**Files:**
- Modify: `js/pieces/16-dream-journey.js` (스텁 → 실제 구현)
- Create: `assets/targets/16-dream-journey.jpg` (두루마리 가로형 — 폭 ~1600px, 허용 버킷 내 최대)
- Modify: `tools/fetch-targets.sh`

**Interfaces:** Consumes: 모듈 계약, Task 2의 data 항목. Produces: 없음.

- [ ] **Step 1: 원작 확보** — 공통 절차. 관찰 기록: 왼쪽 아래 야산(현실), 중앙 험준한 기암, 오른쪽 넓은 도원(복사꽃 만발) — **좌→우 전개**(일반 두루마리와 반대인 이 작품의 특징).
- [ ] **Step 2: 구현 (창작)** — 행동 계약:
  - 이미지를 화면 높이 기준 스케일(상하 여백 한지 톤), 가로 카메라: 드래그 = 카메라 이동(관성 + 양끝 이징 바운스), 유휴 = 느린 자동 유람(좌→우, 끝에서 반대로).
  - 패럴랙스: 이미지를 2~3 깊이 층(수평 밴드 + 부드러운 그라데이션 마스크 — 하늘/원경/근경)으로 분리해 시차 이동. **원작 비교로 밴드 경계 확정**.
  - 도원 구간(오른쪽 1/3) 진입 시 복사꽃잎 입자(연분홍, 나풀나풀) 날림, 클릭 = 꽃잎 버스트.
  - 화면 좌우에 옅은 족자 축(卷軸) 프레임.
  - reducedMotion: 자동 유람 속도 절반, 꽃잎 수 절반.
- [ ] **Step 3: 브라우저 검증** — 공통 검증 절차(드래그 검증은 카메라 이동으로 대체, 비교 라운드 ≥2: 층 분리 경계가 산세를 어색하게 자르지 않는지). 특화: 왼쪽 끝/중앙/오른쪽 도원 3구간 스크린샷 + 꽃잎 확인.
- [ ] **Step 4: 커밋**

```bash
git add js/pieces/16-dream-journey.js assets/targets/16-dream-journey.jpg tools/fetch-targets.sh
git commit -m "feat: 작품 16 — 몽유도원도 (두루마리 여행·패럴랙스)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 통합 검증 — 16작품 스윕

**Files:** 없음 (검증 태스크 — 수정 발견 시 보고만, 컨트롤러가 처리)

- [ ] **Step 1:** `node --test test/` 전체 PASS (data 4 + engine 4 + integrity 3 — 16작품 기준)
- [ ] **Step 2:** 브라우저(8090)에서 아트리움 확인: 4관 × 4카드 = 16카드, hero 16 WORKS/4 WINGS, 콜로폰 새 문구.
- [ ] **Step 3:** 신규 5작품(12~16) 각각 공통 검증 절차 1~6 경량 수행(카드 클릭→렌더→클릭 반응→콘솔→재진입). 기존 01~11 중 3점(01·06·11) 스팟 재확인(회귀 없음).
- [ ] **Step 4:** 뷰어에서 › 연속 전환 16회(01→…→16) — 콘솔 에러 0.
- [ ] **Step 5:** 모바일 390×844: Ⅳ관 카드 1열 + 작품 13 정상 구동 → 데스크톱 복귀.
- [ ] **Step 6:** 결과를 보고서로 남김 (커밋 없음 — 수정 필요 발견 시 BLOCKED 보고)

---

### Task 8: 품질 게이트 — content-review 스팟 (신규 콘텐츠)

- [ ] **Step 1:** `aws-content-plugin:content-review-agent` 디스패치 — 대상: 신규 5작품의 data.js 문구(작가·연도·작품명 사실 검증 — Global Constraints의 사실 표기 기준), index.html 변경 문구, 저작권 표기 일관성(12번은 public domain 문구 없음 / 13~16은 있음), 접근성 회귀 없음. 85점 이상 필수.
- [ ] **Step 2:** 85 미만이면 지적 사항 수정 커밋 → 재리뷰 (최대 3회).

---

### Task 9: 재배포 + 라이브 스모크

- [ ] **Step 1:** `./tools/deploy.sh` 실행 (기존 인프라 재사용 — sync + 무효화). Expected: `URL: https://d6czm97xwldpf.cloudfront.net/`
- [ ] **Step 2:** 캐시 무효화 전파 대기(2~4분) 후:

```bash
for p in "/" "/js/pieces/12-bull-puppet.js" "/js/pieces/16-dream-journey.js" "/assets/targets/13-inwang-after-rain.jpg"; do
  curl -s -o /dev/null -w "%{http_code}  $p\n" "https://d6czm97xwldpf.cloudfront.net$p"; done
# 전부 200. 구 파일 제거 확인:
curl -s -o /dev/null -w "%{http_code}  /js/pieces/12-sudden-shower.js (403/404 기대)\n" "https://d6czm97xwldpf.cloudfront.net/js/pieces/12-sudden-shower.js"
```

- [ ] **Step 3:** 라이브 URL 브라우저 스모크: 아트리움 16카드 + 작품 12(황소)·16(몽유도원도) 열어 정상 구동 스크린샷, 콘솔 에러 0.
- [ ] **Step 4:** 최종 보고: URL, 리뷰 점수, 스크린샷.

---
