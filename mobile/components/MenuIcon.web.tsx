// @ts-nocheck
// Web-only: renders actual SVG icons for menu cards
import React from "react";
import { View } from "react-native";

interface MenuItem {
  name: string;
  price?: number;
  category?: string;
  is_beverage?: boolean;
}

// ── icon path data ────────────────────────────────────────────
// Each entry: [tag, attrs, filled?]
// filled=true → fill=color, stroke=none (for dot circles)
type El = [string, Record<string, string | number>, boolean?];

const ICONS: Record<string, El[]> = {
  coffee: [
    ["path", { d: "M5 8h11v6a4 4 0 01-4 4H9a4 4 0 01-4-4V8z" }],
    ["path", { d: "M16 9h2.5a2 2 0 010 4H16" }],
    ["path", { d: "M8 3v2M11 3v2M14 3v2" }],
  ],
  milk: [
    ["path", { d: "M6 8h12l-1 12H7L6 8z" }],
    ["path", { d: "M8 8V4h8v4" }],
    ["path", { d: "M9 13c1.5-1 4.5-1 6 0" }],
  ],
  foam: [
    ["path", { d: "M6 10h12l-1 9a2 2 0 01-2 2H9a2 2 0 01-2-2l-1-9z" }],
    ["circle", { cx: 8.5, cy: 7, r: 2 }],
    ["circle", { cx: 13, cy: 6, r: 2.4 }],
    ["circle", { cx: 17, cy: 7.5, r: 1.8 }],
  ],
  leaf: [
    ["path", { d: "M5 19c0-8 6-14 14-14 0 8-6 14-14 14z" }],
    ["path", { d: "M5 19c2.5-4 6-7.5 10-10" }],
  ],
  fruit: [
    ["circle", { cx: 12, cy: 14, r: 7 }],
    ["path", { d: "M12 7c-1-1.5-1-3 0-4 1 1 1 2.5 0 4z" }],
    ["path", { d: "M11 11l3 3M14 11l-3 3" }],
  ],
  cake: [
    ["path", { d: "M4 19l8-13 8 13H4z" }],
    ["path", { d: "M8 13l4-2 4 2" }],
    ["path", { d: "M8 16l4-2 4 2" }],
  ],
  swirl: [
    ["path", { d: "M12 4a8 8 0 11-8 8 5 5 0 015-5 3 3 0 013 3 1.5 1.5 0 01-3 0" }],
  ],
  biscuit: [
    ["circle", { cx: 12, cy: 12, r: 8 }],
    ["circle", { cx: 9, cy: 10, r: 0.8 }, true],
    ["circle", { cx: 14, cy: 9, r: 0.8 }, true],
    ["circle", { cx: 13, cy: 14, r: 0.8 }, true],
    ["circle", { cx: 9, cy: 14.5, r: 0.8 }, true],
  ],
  sandwich: [
    ["path", { d: "M3 19l9-14 9 14H3z" }],
    ["path", { d: "M6 14h12" }],
    ["path", { d: "M8.5 10.5h7" }],
  ],
  bagel: [
    ["circle", { cx: 12, cy: 12, r: 8 }],
    ["circle", { cx: 12, cy: 12, r: 2.5 }],
    ["path", { d: "M6 7.5c1 .5 2 .5 3 0M16 8c.8.6 1.8.7 2.7.3M5.5 16.5c1 .4 2 .3 2.8-.2M15.5 16.8c.8.5 1.8.5 2.7 0" }],
  ],
  bowl: [
    ["path", { d: "M3 11h18a9 9 0 01-18 0z" }],
    ["path", { d: "M7 11c0-2 2-3.5 5-3.5s5 1.5 5 3.5" }],
    ["path", { d: "M10 4.5c-.8.8-.8 1.7 0 2.5" }],
    ["path", { d: "M14 4c-.8.8-.8 1.7 0 2.5" }],
  ],
  toast: [
    ["path", { d: "M5 7c0-2 3-3 7-3s7 1 7 3v12a2 2 0 01-2 2H7a2 2 0 01-2-2V7z" }],
    ["path", { d: "M8 11h8M8 14.5h8" }],
  ],
  salad: [
    ["path", { d: "M3 12h18a9 9 0 01-18 0z" }],
    ["path", { d: "M7 11c.5-2.5 3-4 5-2.5" }],
    ["path", { d: "M11 10c1-2 3-2.5 4.5-1" }],
    ["path", { d: "M15 11c1.5-1 3-.5 3.5 1" }],
    ["circle", { cx: 9, cy: 9, r: 0.6 }, true],
    ["circle", { cx: 13, cy: 7, r: 0.6 }, true],
  ],
  noodle_warm: [
    ["path", { d: "M3 12h18a9 9 0 01-18 0z" }],
    ["path", { d: "M7 13c1-1.5 2-1.5 3 0s2 1.5 3 0 2-1.5 3 0 2 1.5 3 0" }],
    ["path", { d: "M9 6c-.5-1 .5-2 0-3M13 6c-.5-1 .5-2 0-3M17 6c-.5-1 .5-2 0-3" }],
  ],
  noodle_cold: [
    ["path", { d: "M3 12h18a9 9 0 01-18 0z" }],
    ["path", { d: "M7 13c1-1.5 2-1.5 3 0s2 1.5 3 0 2-1.5 3 0 2 1.5 3 0" }],
    ["path", { d: "M12 3v6M9 5l3-2 3 2M9 7l3-2 3 2" }],
  ],
  noodle_mixed: [
    ["path", { d: "M3 12h18a9 9 0 01-18 0z" }],
    ["path", { d: "M7 13c1-1.5 2-1.5 3 0s2 1.5 3 0 2-1.5 3 0 2 1.5 3 0" }],
    ["circle", { cx: 8.5, cy: 9.5, r: 0.9 }, true],
    ["circle", { cx: 12, cy: 8.5, r: 0.9 }, true],
    ["circle", { cx: 15.5, cy: 9.5, r: 0.9 }, true],
  ],
  soup_clear: [
    ["path", { d: "M3 12h18a9 9 0 01-18 0z" }],
    ["path", { d: "M9 6c-.5-1 .5-2 0-3M13 6c-.5-1 .5-2 0-3M17 6c-.5-1 .5-2 0-3" }],
    ["path", { d: "M2 12h2M20 12h2" }],
  ],
  stew_pot: [
    ["rect", { x: 4, y: 10, width: 16, height: 9, rx: 1.5 }],
    ["path", { d: "M2 12h2M20 12h2" }],
    ["path", { d: "M4 14h16" }],
    ["path", { d: "M9 6c-.5-1 .5-2 0-3M13 6c-.5-1 .5-2 0-3M17 6c-.5-1 .5-2 0-3" }],
  ],
  rice: [
    ["path", { d: "M4 14h16a8 8 0 01-16 0z" }],
    ["path", { d: "M6 14c1-1.5 2.5-2 4-2s2-1 3-1 1.5 1 3 1 3 .5 4 2" }],
  ],
  soda: [
    ["path", { d: "M7 5h10l-1.5 16H8.5z" }],
    ["circle", { cx: 10, cy: 11, r: 0.6 }, true],
    ["circle", { cx: 13, cy: 13, r: 0.6 }, true],
    ["circle", { cx: 14.5, cy: 9, r: 0.6 }, true],
    ["circle", { cx: 11, cy: 16, r: 0.6 }, true],
  ],
  tea: [
    ["path", { d: "M6 9h11v6a4 4 0 01-4 4h-3a4 4 0 01-4-4V9z" }],
    ["path", { d: "M17 10h2a2 2 0 010 4h-2" }],
    ["path", { d: "M10 4c-.5-1 .5-2 0-3M13 4c-.5-1 .5-2 0-3" }],
  ],
  ricedrink: [
    ["path", { d: "M7 5h10l-1.5 16H8.5z" }],
    ["path", { d: "M8 9h8" }],
    ["circle", { cx: 10, cy: 14, r: 0.55 }, true],
    ["circle", { cx: 13, cy: 13.5, r: 0.55 }, true],
    ["circle", { cx: 14, cy: 16, r: 0.55 }, true],
    ["circle", { cx: 11, cy: 17, r: 0.55 }, true],
  ],
};

// ── keyword → icon name ───────────────────────────────────────
function resolveIconName(item: MenuItem): string {
  const n = (item.name ?? "").toLowerCase();
  const c = (item.category ?? "").toLowerCase();

  if (item.is_beverage) {
    if (n.includes("라테") || n.includes("라떼") || n.includes("밀크") || n.includes("우유")) return "milk";
    if (n.includes("카푸치노") || n.includes("크림") || n.includes("폼")) return "foam";
    if (n.includes("말차") || n.includes("녹차") || n.includes("허브") || n.includes("티") || n.includes("홍차")) return "leaf";
    if (n.includes("주스") || n.includes("에이드") || n.includes("스무디") || n.includes("레몬") || n.includes("딸기") || n.includes("망고")) return "fruit";
    if (n.includes("콜라") || n.includes("사이다") || n.includes("탄산")) return "soda";
    if (n.includes("식혜") || n.includes("수정과")) return "ricedrink";
    if (n.includes("차") && !n.includes("아메")) return "tea";
    return "coffee";
  }

  // Dessert
  if (n.includes("케이크") || n.includes("타르트") || n.includes("마카롱") || n.includes("브라우니")) return "cake";
  if (n.includes("쿠키") || n.includes("비스킷") || n.includes("스콘") || n.includes("와플")) return "biscuit";
  if (n.includes("빙수") || n.includes("아이스크림") || n.includes("젤라또")) return "swirl";

  // Food: noodles
  if (n.includes("냉면") || n.includes("막국수") || (n.includes("냉") && n.includes("면"))) return "noodle_cold";
  if (n.includes("비빔") && n.includes("면")) return "noodle_mixed";
  if (n.includes("칼국수") || n.includes("라면") || n.includes("파스타") || n.includes("우동") || n.includes("소면") || n.includes("국수")) return "noodle_warm";
  if (n.includes("냉") && (n.includes("짬뽕") || n.includes("짜장"))) return "noodle_cold";
  if (n.includes("짬뽕") || n.includes("짜장")) return "noodle_warm";

  // Soups / stews
  if (n.includes("찌개") || n.includes("전골") || n.includes("부대")) return "stew_pot";
  if (n.includes("국") || n.includes("탕") || n.includes("곰탕") || n.includes("설렁탕") || n.includes("순두부")) return "soup_clear";

  // Rice
  if (n.includes("볶음밥") || n.includes("덮밥") || n.includes("비빔밥") || n.includes("솥밥") || n.includes("김밥")) return "rice";

  // Sandwich / bread
  if (n.includes("토스트") || n.includes("식빵") || n.includes("브런치")) return "toast";
  if (n.includes("샌드위치") || n.includes("버거") || n.includes("랩")) return "sandwich";
  if (n.includes("베이글")) return "bagel";

  // Salad
  if (n.includes("샐러드") || n.includes("야채") || n.includes("채소")) return "salad";

  // Category fallbacks
  if (c.includes("면") || c.includes("국수")) return "noodle_warm";
  if (c.includes("밥") || c.includes("한식")) return "rice";
  if (c.includes("국") || c.includes("탕")) return "soup_clear";
  if (c.includes("찌개")) return "stew_pot";
  if (c.includes("샐러드")) return "salad";

  return "bowl";
}

// ── Component ─────────────────────────────────────────────────
export function MenuIcon({ item, color, size = 32 }: { item: MenuItem; color: string; size?: number }) {
  const iconName = resolveIconName(item);
  const elements = ICONS[iconName] ?? ICONS.bowl;

  const children = elements.map(([tag, attrs, filled], i) => {
    const elAttrs: Record<string, any> = {
      key: i,
      fill: filled ? color : "none",
      stroke: filled ? "none" : color,
      ...attrs,
    };
    return React.createElement(tag, elAttrs);
  });

  const svg = React.createElement(
    "svg",
    {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: color,
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      width: size,
      height: size,
    },
    ...children
  );

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {svg}
    </View>
  );
}
