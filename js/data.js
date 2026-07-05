// js/data.js — 전시관·작품 메타데이터 (단일 소스)
export const WINGS = [
  { id: "wave",  index: "Ⅰ", name: "The Wave Hall",      sub: "파도의 방", accent: "#5aa7d8" },
  { id: "light", index: "Ⅱ", name: "Light & Atmosphere", sub: "빛의 방",   accent: "#e8b46a" },
  { id: "dream", index: "Ⅲ", name: "Form & Dream",       sub: "꿈의 방",   accent: "#b48ad8" },
  { id: "korea", index: "Ⅳ", name: "Korean Masters", sub: "한국의 방", accent: "#63b8a0" },
];

export const WORKS = [
  // ---- Ⅰ관 · 파도의 방 — Hokusai 입자 기법 (응집 ↔ 흩어짐 ↔ 복원) ----
  {
    no: "01", wing: "wave", title: "After Hokusai — Great Wave", ko: "가나가와 해변의 높은 파도",
    medium: "Particle fluid · after Hokusai (c.1831, public domain)", year: "2026",
    note: "호쿠사이의 파도가 수천 개의 물 입자로 다시 태어난다. 갈고리 같은 물보라는 주기적으로 스스로 부서져 포말로 흩어지고, 후지산은 그 너머에서 미동도 없다. 손으로 휘저으면 파도는 무너졌다가 — 다시 그 불멸의 형상으로 되돌아온다.",
    hint: "드래그로 물을 휘저으세요 · 클릭으로 물보라 · 파도는 스스로도 부서집니다",
    module: "./pieces/01-great-wave.js", asset: "assets/targets/01-great-wave.jpg",
  },
  {
    no: "02", wing: "wave", title: "After Botticelli — Birth of Venus", ko: "비너스의 탄생",
    medium: "Sea-foam particles · after Botticelli (c.1485, public domain)", year: "2026",
    note: "보티첼리의 비너스가 바다 거품으로 빚어진다. 서풍의 신이 그랬듯 당신의 드래그가 바람이 되어 여신의 머리칼과 옷자락을 흩날리고, 장미 꽃잎이 화면을 가로지른다. 바람이 멎으면 거품은 다시 여신의 형상으로 피어오른다.",
    hint: "드래그로 바람을 일으키세요 · 클릭으로 돌풍",
    module: "./pieces/02-birth-of-venus.js", asset: "assets/targets/02-birth-of-venus.jpg",
  },
  {
    no: "03", wing: "wave", title: "After Vermeer — Girl with a Pearl Earring", ko: "진주 귀걸이를 한 소녀",
    medium: "Light-dust particles · after Vermeer (c.1665, public domain)", year: "2026",
    note: "페르메이르의 소녀가 어둠 속 빛 먼지로 나타난다. 촛불 바람에 먼지가 흩날려도 소녀는 언제나 되돌아오는데 — 진주만은 늘 마지막에, 가장 밝게 돌아온다. 어둠이 깊을수록 빛나는 단 하나의 점.",
    hint: "드래그로 빛 먼지를 흩으세요 · 클릭으로 촛불 깜빡임",
    module: "./pieces/03-pearl-earring.js", asset: "assets/targets/03-pearl-earring.jpg",
  },
  {
    no: "04", wing: "wave", title: "After Leonardo — Mona Lisa", ko: "모나리자",
    medium: "Sfumato smoke particles · after Leonardo (c.1503, public domain)", year: "2026",
    note: "레오나르도의 스푸마토 — '연기처럼 사라지는' 기법 그대로, 모나리자가 안개 입자로 흩어지고 응결된다. 휘저으면 초상은 갈색 연무가 되고, 안개가 걷히며 얼굴이 돌아올 때 그 미소는 언제나 가장 늦게 완성된다.",
    hint: "드래그로 안개를 휘저으세요 · 클릭으로 흩뜨리기 · 미소를 기다리세요",
    module: "./pieces/04-mona-lisa.js", asset: "assets/targets/04-mona-lisa.jpg",
  },

  // ---- Ⅱ관 · 빛의 방 — 빛과 대기의 재해석 ----
  {
    no: "05", wing: "light", title: "After Monet — Impression, Sunrise", ko: "인상, 해돋이",
    medium: "Living seascape · after Monet (1872, public domain)", year: "2026",
    note: "인상주의라는 이름을 낳은 르아브르의 새벽이 실시간으로 다시 밝아온다. 주황 태양이 고동치고, 부서진 반사광이 수면 위에서 명멸하며, 조각배는 안개 속을 느리게 지난다. 물결을 만지면 빛의 인상이 번져나간다.",
    hint: "수면을 드래그해 물결을 만드세요 · 클릭으로 큰 파문",
    module: "./pieces/05-impression-sunrise.js",
  },
  {
    no: "06", wing: "light", title: "After Rembrandt — The Night Watch", ko: "야경",
    medium: "Lantern chiaroscuro · after Rembrandt (1642, public domain)", year: "2026",
    note: "렘브란트의 대작이 온전한 어둠에 잠겨 있다. 당신의 커서가 등불이 되어 어둠을 밝히면, 빛이 닿는 자리에서만 대원들의 얼굴이 떠오른다. 등불이 지나간 자리엔 잔광이 머물다 스러진다 — 빛과 어둠의 화가에게 바치는 오마주.",
    hint: "커서로 어둠을 비추세요 · 클릭으로 화약 섬광",
    module: "./pieces/06-night-watch.js", asset: "assets/targets/06-night-watch.jpg",
  },
  {
    no: "07", wing: "light", title: "After Van Gogh — Sunflowers", ko: "해바라기",
    medium: "Impasto bloom cycle · after Van Gogh (1888, public domain)", year: "2026",
    note: "반 고흐가 아를의 노란 집에서 그린 해바라기들이 임파스토 붓질로 피어난다. 꽃들은 저마다의 속도로 피고 시들기를 반복하고 — 시든 꽃을 클릭하면 다시 만개하며 꽃가루를 터뜨린다. 생명과 소멸을 오가는 노랑의 순환.",
    hint: "꽃을 클릭해 피워보세요 · 드래그로 붓바람",
    module: "./pieces/07-sunflowers.js",
  },
  {
    no: "08", wing: "light", title: "After Turner — Rain, Steam and Speed", ko: "비, 증기, 속도",
    medium: "Vapor flow field · after Turner (1844, public domain)", year: "2026",
    note: "터너의 금빛 폭풍 속에서 증기기관차가 다가온다. 안개와 비와 증기가 한 덩어리의 유동장이 되어 소용돌이치고, 기차는 소실점에서부터 화실의 불꽃을 키우며 끝없이 달려온다. 산업 시대의 속도를 화폭에 담아낸 가장 이른 그림 중 하나 — 그 속도 그대로.",
    hint: "드래그로 안개를 휘저으세요 · 클릭으로 기적 소리 없는 증기",
    module: "./pieces/08-rain-steam-speed.js",
  },

  // ---- Ⅲ관 · 꿈의 방 — 형태와 상상 ----
  {
    no: "09", wing: "dream", title: "After Michelangelo — Creation of Adam", ko: "아담의 창조",
    medium: "Spark of life · after Michelangelo (c.1512, public domain)", year: "2026",
    note: "시스티나 천장화에서 가장 유명한 순간 — 닿을 듯 닿지 않는 두 손끝의 간극. 커서를 그 사이에 가져가면 정전기가 일고, 간극을 이어주면 생명의 불꽃이 방전된다. 신이 아담에게 건넨 그 순간을, 당신의 손으로.",
    hint: "두 손끝 사이에 커서를 · 간극을 이으면 불꽃이 튑니다",
    module: "./pieces/09-creation-of-adam.js", asset: "assets/targets/09-creation-of-adam.jpg",
  },
  {
    no: "10", wing: "dream", title: "After Bruegel — Tower of Babel", ko: "바벨탑",
    medium: "Endless construction · after Bruegel (1563, public domain)", year: "2026",
    note: "브뤼헐의 바벨탑은 완성되지 못할 것을 알면서도 쌓아 올려진다. 벽돌은 저절로 한 장씩 놓이고, 당신은 클릭으로 건설을 거들 수도, 길게 눌러 무너뜨릴 수도 있다. 무너진 자리에서도 건설은 계속된다 — 인간의 끝없는 오만과 열망.",
    hint: "클릭으로 벽돌을 쌓으세요 · 길게 누르면 무너집니다",
    module: "./pieces/10-tower-of-babel.js",
  },
  {
    no: "11", wing: "dream", title: "After Kandinsky — Composition VIII", ko: "구성 8",
    medium: "Geometric orchestra · WebAudio · after Kandinsky (1923, public domain)", year: "2026",
    note: "칸딘스키는 색과 형태에서 소리를 들었다. 크림색 캔버스 위 원과 삼각형과 선들이 느리게 부유하다가, 손끝이 닿으면 저마다의 음색으로 울린다 — 원은 부드럽게, 삼각형은 날카롭게. 그림이 악보가 되는 공감각의 방.",
    hint: "도형을 클릭해 연주하세요 · 우상단 사운드를 켜면 소리가 납니다",
    module: "./pieces/11-composition-viii.js",
  },
  {
    no: "12", wing: "dream", title: "After Lee Jung-seob — Bull", ko: "황소",
    medium: "Paper puppet theatre · after Lee Jung-seob (c.1953)", year: "2026",
    note: "이중섭의 황소가 가위로 오려낸 종이 인형이 되어 작은 무대에 오른다. 굵은 윤곽과 황토빛 붓질의 조각들이 막대 끝에서 움직이며 느릿하게 걷고, 고개를 흔들고, 이따금 온몸으로 울부짖는다. 막대를 잡아 직접 조종해보라 — 소는 당신의 손끝에서도 이중섭의 소로 남는다.",
    hint: "드래그로 막대를 잡아 조종하세요 · 클릭으로 돌진 · 가만두면 소극이 계속됩니다",
    module: "./pieces/12-bull-puppet.js",
  },

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
];

export const wingOf = (work) => WINGS.find((w) => w.id === work.wing);
