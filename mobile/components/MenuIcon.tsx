import { Text, View } from "react-native";

interface MenuItem {
  name: string;
  price?: number;
  category?: string;
  is_beverage?: boolean;
}

function resolveEmoji(item: MenuItem): string {
  const n = (item.name ?? "").toLowerCase();

  // ── 음료 ──
  if (/블랙티|얼그레이|민트티|민트/.test(n)) return "🍵";
  if (/라떼|카페라|카라멜|바닐라|헤이즐/.test(n)) return "🥤";
  if (/아메리카|에스프레소|드립|콜드브루|아인슈페너|인크레드불/.test(n)) return "🥤";
  if (/스무디|프라푸|프라페|블렌디|밀크티|버블티/.test(n)) return "🧋";
  if (/주스|에이드|레몬|자몽|오렌지/.test(n)) return "🥤";

  // ── 주류 ──
  if (/레드.?와인|화이트.?와인|와인/.test(n)) return "🍷";
  if (/바이젠|라거|에일|수제맥주|수입맥주|생맥주/.test(n)) return "🍺";
  if (/맥주|생맥|하이볼|소주|막걸리|위스키|칵테일|사케/.test(n)) return "🍺";

  // ── 디저트 ──
  if (/케이크|티라미|마카롱|쿠키|브라우니|와플|몽블랑|츄러스|휘낭시에/.test(n)) return "🍰";
  if (/크로와상|소금빵|단팥빵|깜빠뉴|파니니|버터떡/.test(n)) return "🥐";
  if (/아이스크림|소프트콘|젤라또/.test(n)) return "🍦";

  // ── 감자튀김 ──
  if (/감자.{0,3}튀김/.test(n)) return "🍟";

  // ── 피자 ──
  if (/피자/.test(n)) return "🍕";

  // ── 파스타류 ──
  if (/파스타|스파게티|리조또|알리오|올리오|까르보나라|봉골레|쉬림프로제|감베로니|포모도로|비프토마토|명란.{0,3}프리토/.test(n)) return "🍝";

  // ── 햄버거 / 샌드위치 ──
  if (/햄버거|버거/.test(n)) return "🍔";
  if (/샌드위치|토스트/.test(n)) return "🥪";

  // ── 샐러드 ──
  if (/샐러드/.test(n)) return "🥗";

  // ── 치킨 ──
  if (/치킨|닭|윙/.test(n)) return "🍗";

  // ── 스테이크 / 육류 ──
  if (/스테이크|부채살|안심|돈까스|포크|삼겹|갈비|육/.test(n)) return "🥩";

  // ── 초밥 ──
  if (/초밥|스시|회/.test(n)) return "🍣";

  // ── 국수류 ──
  if (/라멘|라면|우동|소바|냉면|국수|우육/.test(n)) return "🍜";
  if (/칼국수|만두|떡국/.test(n)) return "🍲";

  // ── 국밥류 (밥 패턴보다 먼저) ──
  if (/짬뽕.{0,3}밥|순두부.{0,3}밥|국밥/.test(n)) return "🥣";

  // ── 밥류 ──
  if (/볶음밥|덮밥|비빔밥|밥/.test(n)) return "🍚";

  // ── 국 / 탕 ──
  if (/국|탕|찌개|전골/.test(n)) return "🥣";

  // ── 빵류 ──
  if (/빵|베이글|크루아상|머핀/.test(n)) return "🥐";

  if (item.is_beverage) return "🥤";
  if (item.category === "drink") return "🥤";
  return "🍽️";
}

export function MenuIcon({ item, color, size = 32 }: { item: MenuItem; color: string; size?: number }) {
  const emoji = resolveEmoji(item);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: size * 0.72, lineHeight: size * 1.1 }}>
        {emoji}
      </Text>
    </View>
  );
}
