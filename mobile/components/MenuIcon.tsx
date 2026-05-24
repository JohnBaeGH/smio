import { Text, View } from "react-native";

interface MenuItem {
  name: string;
  price?: number;
  category?: string;
  is_beverage?: boolean;
}

function resolveEmoji(item: MenuItem): string {
  const n = (item.name ?? "").toLowerCase();
  if (/라떼|카페라|카라멜|바닐라|헤이즐/.test(n)) return "☕";
  if (/아메리카|에스프레소|드립|콜드브루|아인슈페너|인크레드불/.test(n)) return "☕";
  if (/스무디|프라푸|프라페|블렌디|밀크티|버블티/.test(n)) return "🧋";
  if (/주스|에이드|레몬|자몽|오렌지/.test(n)) return "🥤";
  if (/바이젠|라거|에일|수제맥주|수입맥주|생맥주/.test(n)) return "🍺";
  if (/맥주|생맥|하이볼|소주|막걸리|와인|위스키|칵테일|사케/.test(n)) return "🍺";
  if (/케이크|티라미|마카롱|쿠키|브라우니|와플|몽블랑|츄러스|휘낭시에/.test(n)) return "🍰";
  if (/크로와상|소금빵|단팥빵|깜빠뉴|파니니|버터떡|빵/.test(n)) return "🥐";
  if (/아이스크림|소프트콘|젤라또/.test(n)) return "🍦";
  if (/피자/.test(n)) return "🍕";
  if (/파스타|스파게티|리조또/.test(n)) return "🍝";
  if (/햄버거|버거/.test(n)) return "🍔";
  if (/샌드위치|토스트/.test(n)) return "🥪";
  if (/샐러드/.test(n)) return "🥗";
  if (/치킨|닭|윙/.test(n)) return "🍗";
  if (/돈까스|포크|삼겹|갈비|육/.test(n)) return "🥩";
  if (/초밥|스시|회/.test(n)) return "🍣";
  if (/라멘|라면|우동|소바|냉면|국수/.test(n)) return "🍜";
  if (/칼국수|만두|떡국/.test(n)) return "🍲";
  if (/볶음밥|덮밥|비빔밥|밥/.test(n)) return "🍚";
  if (/국|탕|찌개|전골/.test(n)) return "🥣";
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
