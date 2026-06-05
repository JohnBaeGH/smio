import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { MenuIcon } from "@/components/MenuIcon";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import colors from "@/constants/colors";
import { getApiBaseUrl } from "@/utils/api";
import { addFavorite, getFavorites, getProfile } from "@/utils/storage";

interface MenuItem {
  name: string;
  price: number;
  category?: string;
  is_beverage?: boolean;
}

interface Order {
  user_name: string;
  rank: string;
  menu: string;
  quantity: number;
  price: number;
  memo?: string;
  timestamp: string;
}

interface RoomData {
  room_id: string;
  restaurant_info: {
    name: string;
    address?: string;
    source_url?: string;
    menu: MenuItem[];
  };
  orders: Order[];
  is_closed: boolean;
}

type Size = "기본" | "S" | "M" | "L";
type Category = "drink" | "food" | "dessert" | "alcohol";

function getCategory(item: MenuItem): Category {
  const cat = (item.category ?? "").toLowerCase();
  const name = (item.name ?? "").toLowerCase();

  // 주류 먼저 체크
  if (
    cat.includes("주류") || cat.includes("맥주") || cat.includes("술") ||
    name.includes("맥주") || name.includes("생맥주") || name.includes("수제맥주") ||
    name.includes("수입맥주") || name.includes("소주") || name.includes("막걸리") ||
    name.includes("하이볼") || name.includes("와인") || name.includes("샴페인") ||
    name.includes("칵테일") || name.includes("사케") || name.includes("위스키") ||
    name.includes("보드카") || name.includes("럼") || name.includes("진 ") ||
    name.includes("바이젠") || name.includes("라거") || name.includes("에일")
  ) return "alcohol";

  if (
    item.is_beverage ||
    cat.includes("음료") || cat.includes("커피") || cat.includes("beverage") ||
    name.includes("커피") || name.includes("라떼") || name.includes("아메리카노") ||
    name.includes("에스프레소") || name.includes("콜드브루") || name.includes("콜드블루") ||
    name.includes("드립") || name.includes("카푸치노") ||
    name.includes("마키아또") || name.includes("마키아토") ||
    name.includes("프라페") || name.includes("프라푸치노") ||
    name.includes("아인슈페너") || name.includes("인크레드불") ||
    name.includes("콜드 브루") || name.includes("블렌디드") || name.includes("블렌디") ||
    name.includes("카라멜") || name.includes("스무디") || name.includes("쉐이크") ||
    name.includes("주스") || name.includes("에이드") ||
    name.includes("음료") || name.includes("음료수")
  ) return "drink";
  if (
    cat.includes("디저트") || cat.includes("케이크") ||
    cat.includes("빵") || cat.includes("쿠키") || cat.includes("와플") ||
    name.includes("케이크") || name.includes("쿠키") ||
    name.includes("와플") || name.includes("마카롱") || name.includes("빙수") ||
    name.includes("몽블랑") || name.includes("츄러스") || name.includes("휘낭시에") ||
    name.includes("크로와상") || name.includes("소금빵") || name.includes("단팥빵") ||
    name.includes("깜빠뉴") || name.includes("파니니") || name.includes("버터떡") ||
    name.includes("에그 베네딕트") || name.includes("에그인헬") ||
    name.includes("브랙퍼스트") || name.includes("브런치") || name.includes("선물세트")
  ) return "dessert";
  return "food";
}

const CATEGORY_TONE: Record<Category, { bg: string; fg: string; tag: string }> = {
  drink:   { bg: "#EDE0FF", fg: "#6B21CC", tag: "음료" },
  food:    { bg: "#ECF5D6", fg: "#3F5A1F", tag: "음식" },
  dessert: { bg: "#FFE6CD", fg: "#7A3D14", tag: "디저트" },
  alcohol: { bg: "#FDE8E8", fg: "#991B1B", tag: "주류" },
};

function getOwnCount(orders: Order[], menuName: string, myName: string | undefined): number {
  if (!myName) return 0;
  return orders
    .filter((o) => o.user_name === myName && o.menu.startsWith(menuName))
    .reduce((sum, o) => sum + o.quantity, 0);
}

function parseMenuStr(menu: string): { base: string; size: string; temp: string | null } {
  let s = menu.trim();
  let temp: string | null = null;
  let size = "기본";
  const tempM = s.match(/\s*\((아이스|핫)\)$/);
  if (tempM) { temp = tempM[1]; s = s.slice(0, s.length - tempM[0].length).trim(); }
  const sizeM = s.match(/\s+([SML])$/);
  if (sizeM) { size = sizeM[1]; s = s.slice(0, s.length - sizeM[0].length).trim(); }
  return { base: s, size, temp };
}

// ── Components ────────────────────────────────────────────────

function SummaryCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryCellLabel}>{label}</Text>
      <Text style={[styles.summaryCellValue, accent && styles.summaryCellAccent]}>{value}</Text>
    </View>
  );
}

function SmioToast({ message, onHide }: { message: string; onHide: () => void }) {
  useEffect(() => {
    const t = setTimeout(onHide, 2200);
    return () => clearTimeout(t);
  }, [onHide]);
  return (
    <View style={styles.toast} pointerEvents="none">
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [room, setRoom] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"menu" | "orders" | "sheet">("menu");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState<MenuItem | null>(null);
  const [temperature, setTemperature] = useState<"아이스" | "핫" | null>(null);
  const [size, setSize] = useState<Size>("기본");
  const [quantity, setQuantity] = useState(1);
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  const [isFavorite, setIsFavorite] = useState(false);
  const [profile, setProfile] = useState<{ name: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // 메뉴 직접 추가
  const [addMenuVisible, setAddMenuVisible] = useState(false);
  const [newMenuName, setNewMenuName] = useState("");
  const [newMenuPrice, setNewMenuPrice] = useState("");
  const [newMenuCategory, setNewMenuCategory] = useState<Category>("food");
  const [addingMenu, setAddingMenu] = useState(false);

  useEffect(() => {
    getProfile().then(setProfile);
    fetchRoom();
    pollRef.current = setInterval(fetchRoom, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [id]);

  const showToast = (msg: string) => {
    setToast(msg);
  };

  const checkFavorite = useCallback(async (sourceUrl?: string) => {
    const favs = await getFavorites();
    if (sourceUrl) setIsFavorite(favs.some((f) => f.url === sourceUrl));
  }, []);

  const fetchRoom = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/rooms/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setRoom(data);
      setLastUpdated(new Date());
      checkFavorite(data.restaurant_info?.source_url);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [id]);

  const openMenuDetail = (item: MenuItem) => {
    setSelectedMenu(item);
    setTemperature(null);
    setSize("기본");
    setQuantity(1);
    setMemo("");
    setEditingOrder(null);
    setModalVisible(true);
    Haptics.selectionAsync();
  };

  const openEditDetail = (order: Order) => {
    const menuItem = room?.restaurant_info.menu.find((m) => order.menu.startsWith(m.name));
    if (!menuItem) return;
    setSelectedMenu(menuItem);
    setQuantity(order.quantity);
    setMemo(order.memo ?? "");
    setTemperature(null);
    setSize("기본");
    setEditingOrder(order);
    setModalVisible(true);
    Haptics.selectionAsync();
  };

  const handleOrder = async () => {
    if (!selectedMenu || !profile) return;
    if (selectedMenu.is_beverage && !temperature) {
      Alert.alert("온도 선택", "아이스 또는 핫을 선택해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const parts = [
        selectedMenu.name,
        size !== "기본" ? size : null,
        selectedMenu.is_beverage && temperature ? `(${temperature})` : null,
      ].filter(Boolean);
      const menuName = parts.join(" ");

      const endpoint = editingOrder
        ? `${getApiBaseUrl()}/rooms/${id}/orders/${encodeURIComponent(profile.name)}`
        : `${getApiBaseUrl()}/rooms/${id}/orders`;
      const res = await fetch(endpoint, {
        method: editingOrder ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_name: profile.name,
          rank: "",
          menu: menuName,
          quantity,
          price: selectedMenu.price,
          memo: memo.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModalVisible(false);
      setTab("orders");
      showToast(editingOrder ? "주문을 수정했어요" : `${selectedMenu.name} 담았어요 ✓`);
      await fetchRoom();
    } catch {
      Alert.alert("오류", "주문 처리 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const openAddMenu = () => {
    setNewMenuName("");
    setNewMenuPrice("");
    setNewMenuCategory("food");
    setAddMenuVisible(true);
    Haptics.selectionAsync();
  };

  const handleAddMenu = async () => {
    const name = newMenuName.trim();
    const price = parseInt(newMenuPrice.replace(/[^0-9]/g, ""), 10);
    if (!name) { Alert.alert("메뉴 이름", "메뉴 이름을 입력해 주세요."); return; }
    if (!Number.isFinite(price) || price < 0) {
      Alert.alert("가격", "올바른 가격을 입력해 주세요."); return;
    }
    setAddingMenu(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/rooms/${id}/menu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          price,
          category: CATEGORY_TONE[newMenuCategory].tag,
          is_beverage: newMenuCategory === "drink",
        }),
      });
      if (res.status === 409) { Alert.alert("중복", "이미 같은 이름의 메뉴가 있습니다."); return; }
      if (!res.ok) throw new Error();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAddMenuVisible(false);
      showToast(`${name} 메뉴를 추가했어요 ✓`);
      await fetchRoom();
    } catch {
      Alert.alert("오류", "메뉴 추가 중 오류가 발생했습니다.");
    } finally {
      setAddingMenu(false);
    }
  };

  const handleClose = async () => {
    const confirmed =
      Platform.OS === "web"
        ? window.confirm("주문을 마감하시겠습니까?")
        : await new Promise<boolean>((resolve) =>
            Alert.alert("주문 마감", "주문을 마감하시겠습니까?\n이후 추가 주문이 차단됩니다.", [
              { text: "취소", onPress: () => resolve(false) },
              { text: "마감", style: "destructive", onPress: () => resolve(true) },
            ])
          );
    if (!confirmed) return;
    await fetch(`${getApiBaseUrl()}/rooms/${id}/close`, { method: "POST" });
    fetchRoom();
    showToast("주문을 마감했어요");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  };

  const handleReopen = async () => {
    const confirmed =
      Platform.OS === "web"
        ? window.confirm("주문 마감을 취소하시겠습니까?")
        : await new Promise<boolean>((resolve) =>
            Alert.alert("마감 취소", "주문 마감을 취소하시겠습니까?", [
              { text: "아니오", onPress: () => resolve(false) },
              { text: "취소하기", style: "destructive", onPress: () => resolve(true) },
            ])
          );
    if (!confirmed) return;
    await fetch(`${getApiBaseUrl()}/rooms/${id}/reopen`, { method: "POST" });
    fetchRoom();
    showToast("마감을 취소했어요");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDeleteOrder = async () => {
    if (!profile || !editingOrder) return;
    const confirmed =
      Platform.OS === "web"
        ? window.confirm("주문을 취소하시겠습니까?")
        : await new Promise<boolean>((resolve) =>
            Alert.alert("주문 취소", "주문을 취소하시겠습니까?", [
              { text: "아니오", onPress: () => resolve(false) },
              { text: "취소하기", style: "destructive", onPress: () => resolve(true) },
            ])
          );
    if (!confirmed) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `${getApiBaseUrl()}/rooms/${id}/orders/${encodeURIComponent(profile.name)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModalVisible(false);
      showToast("주문을 취소했어요");
      await fetchRoom();
    } catch {
      Alert.alert("오류", "주문 취소 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const apiBase = getApiBaseUrl();
  const appOrigin = apiBase.startsWith("http")
    ? apiBase.replace("/api", "")
    : typeof window !== "undefined"
    ? window.location.origin
    : "https://smio-mobile.johnbae.co.kr";
  const roomUrl = `${appOrigin}/room/${id}`;

  const handleShare = async () => {
    const storeName = room?.restaurant_info.name ?? "";
    try {
      await Share.share({
        message: `[${storeName}] 주문방이 열렸습니다. 접속해서 주문하세요!\n${roomUrl}`,
      });
    } catch {}
  };

  const handleCopyUrl = () => {
    Clipboard.setString(roomUrl);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast("링크를 복사했어요");
  };

  const handleAddFavorite = async () => {
    if (!room) return;
    const sourceUrl = room.restaurant_info.source_url ?? "";
    if (!sourceUrl) { Alert.alert("오류", "상점 URL 정보가 없습니다."); return; }
    await addFavorite({ name: room.restaurant_info.name, url: sourceUrl });
    setIsFavorite(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast("즐겨찾기에 저장했어요 ★");
  };

  const grandTotal = room?.orders.reduce((s, o) => s + o.price * o.quantity, 0) ?? 0;
  const totalCount = room?.orders.reduce((s, o) => s + o.quantity, 0) ?? 0;

  const sheetGroups = useMemo(() => {
    if (!room?.orders.length) return [];
    const map: Record<string, {
      menuName: string;
      items: Record<string, { temp: string | null; size: string; qty: number; people: string[] }>;
    }> = {};
    for (const order of room.orders) {
      const { base, size: sz, temp } = parseMenuStr(order.menu);
      if (!map[base]) map[base] = { menuName: base, items: {} };
      const itemKey = `${temp ?? ""}__${sz}`;
      if (!map[base].items[itemKey]) map[base].items[itemKey] = { temp, size: sz, qty: 0, people: [] };
      map[base].items[itemKey].qty += order.quantity;
      map[base].items[itemKey].people.push(order.user_name);
    }
    return Object.values(map).map((g) => ({
      menuName: g.menuName,
      items: Object.values(g.items).sort((a, b) => {
        const tOrder = (t: string | null) => t === "아이스" ? 0 : t === "핫" ? 1 : 2;
        return tOrder(a.temp) - tOrder(b.temp) || a.size.localeCompare(b.size);
      }),
    })).sort((a, b) => a.menuName.localeCompare(b.menuName));
  }, [room?.orders]);

  // Per-person grouped orders for live tab
  const groupedByPerson = useMemo(() => {
    if (!room?.orders) return [];
    const people = Array.from(new Set(room.orders.map((o) => o.user_name)));
    return people.map((name) => ({
      name,
      orders: room.orders.filter((o) => o.user_name === name),
      subtotal: room.orders
        .filter((o) => o.user_name === name)
        .reduce((s, o) => s + o.price * o.quantity, 0),
    }));
  }, [room?.orders]);

  // Categorized menu sections
  const menuSections = useMemo(() => {
    if (!room?.restaurant_info.menu) return [];
    const drinks  = room.restaurant_info.menu.filter((m) => getCategory(m) === "drink");
    const foods   = room.restaurant_info.menu.filter((m) => getCategory(m) === "food");
    const deserts = room.restaurant_info.menu.filter((m) => getCategory(m) === "dessert");
    const alcohol = room.restaurant_info.menu.filter((m) => getCategory(m) === "alcohol");
    return [
      { key: "drink"   as Category, label: "음료",   items: drinks },
      { key: "food"    as Category, label: "음식",   items: foods },
      { key: "dessert" as Category, label: "디저트", items: deserts },
      { key: "alcohol" as Category, label: "주류",   items: alcohol },
    ].filter((s) => s.items.length > 0);
  }, [room?.restaurant_info.menu]);

  const handleCopySheet = () => {
    if (!room) return;
    const lines: string[] = [`[총무 주문서] ${room.restaurant_info.name}`, ""];
    for (const group of sheetGroups) {
      lines.push(`▶ ${group.menuName}`);
      for (const it of group.items) {
        const tempLabel = it.temp === "아이스" ? "🧊 아이스" : it.temp === "핫" ? "☕ 핫" : "";
        const sizeLabel = it.size !== "기본" ? ` ${it.size}` : "";
        const peopleStr = it.people.join(", ");
        lines.push(`  ${tempLabel}${sizeLabel}  × ${it.qty}개  (${peopleStr})`);
      }
      lines.push("");
    }
    lines.push(`합계: ${grandTotal.toLocaleString()}원 / 총 ${totalCount}개 / ${room.orders.length}명`);
    Clipboard.setString(lines.join("\n"));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast("주문서를 복사했어요");
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>주문방 불러오는 중...</Text>
      </View>
    );
  }
  if (!room) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={44} color={colors.destructive} />
        <Text style={[styles.loadingText, { color: colors.foreground }]}>주문방을 찾을 수 없습니다</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  const uniquePeople = Array.from(new Set(room.orders.map((o) => o.user_name)));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>

        {/* 헤더 */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => router.back()} style={styles.headerBack}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerRestaurant} numberOfLines={1}>{room.restaurant_info.name}</Text>
            <View style={styles.headerMeta}>
              {room.is_closed ? (
                <View style={styles.closedBadge}><Text style={styles.closedBadgeText}>마감</Text></View>
              ) : (
                <View style={styles.openBadge}>
                  <View style={styles.openDot} />
                  <Text style={styles.openBadgeText}>주문 중</Text>
                </View>
              )}
              <Text style={styles.headerRoomId}>#{id?.slice(0, 6)}</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable onPress={isFavorite ? undefined : handleAddFavorite} style={styles.headerBtn}>
              <Feather name="bookmark" size={19} color={isFavorite ? "#f59e0b" : colors.mutedForeground} />
            </Pressable>
            <Pressable onPress={handleShare} style={styles.headerBtn}>
              <Feather name="share-2" size={17} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        {/* 링크 복사 바 */}
        <Pressable style={styles.shareBar} onPress={handleCopyUrl}>
          <Feather name="link-2" size={13} color={colors.primary} />
          <Text style={styles.shareBarText} numberOfLines={1}>
            링크 복사해서 팀원들에게 공유하세요
          </Text>
          <Feather name="copy" size={13} color={colors.primary} />
        </Pressable>

        {/* 탭 */}
        <View style={styles.tabBar}>
          {([
            { key: "menu", label: "메뉴" },
            { key: "orders", label: `현황 ${uniquePeople.length}명`, live: true },
            { key: "sheet", label: "주문서" },
          ] as const).map(({ key, label, live }) => (
            <Pressable
              key={key}
              style={[styles.tabPill, tab === key && styles.tabPillActive]}
              onPress={() => setTab(key)}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                {live && !room.is_closed && (
                  <View style={[styles.liveDot, tab === key && { backgroundColor: "#fff" }]} />
                )}
                <Text style={[styles.tabPillText, tab === key && styles.tabPillTextActive]}>
                  {label}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* 네이버 매장 링크 */}
        {room?.restaurant_info?.source_url ? (
          <Pressable
            style={styles.naverLinkBtn}
            onPress={() => Linking.openURL(room.restaurant_info.source_url!)}
          >
            <Text style={styles.naverLinkText}>🔗 실제 매장에서 메뉴 확인하기</Text>
          </Pressable>
        ) : null}

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* ── 메뉴 탭 ── */}
          {tab === "menu" ? (
            <View>
              {room.is_closed && (
                <View style={[styles.closedBanner, { margin: 12 }]}>
                  <Feather name="lock" size={15} color={colors.destructive} />
                  <Text style={styles.closedBannerText}>주문이 마감되었습니다</Text>
                </View>
              )}

              {menuSections.map((section) => {
                const tone = CATEGORY_TONE[section.key];
                return (
                  <View key={section.key} style={styles.menuSection}>
                    {/* Section header */}
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionEyebrow}>{section.label}</Text>
                      <Text style={styles.sectionCount}>{section.items.length}</Text>
                    </View>

                    {/* 2-column grid */}
                    <View style={styles.menuGrid}>
                      {section.items.map((item, i) => {
                        const ownCount = getOwnCount(room.orders, item.name, profile?.name);
                        return (
                          <Pressable
                            key={i}
                            style={[
                              styles.menuCard,
                              ownCount > 0 && styles.menuCardOwned,
                            ]}
                            onPress={() => { if (!room.is_closed) openMenuDetail(item); }}
                            disabled={room.is_closed}
                          >
                            {/* Art block — Pattern D: soft gradient bg + line icon */}
                            <View style={[styles.menuArtBlock, { backgroundColor: tone.bg }]}>
                              <MenuIcon item={item} color={tone.fg} size={Platform.OS === "android" ? 34 : 68} />
                              <View style={[styles.menuCategoryTag, { backgroundColor: "rgba(255,255,255,0.78)" }]}>
                                <Text style={[styles.menuCategoryTagText, { color: tone.fg }]}>{tone.tag}</Text>
                              </View>
                            </View>

                            <View style={styles.menuCardBody}>
                              <Text style={styles.menuCardName} numberOfLines={2}>{item.name}</Text>
                              <Text style={styles.menuCardPrice}>{item.price.toLocaleString()}원</Text>
                            </View>

                            {/* Own-count badge */}
                            {ownCount > 0 && (
                              <View style={styles.ownBadge}>
                                <Text style={styles.ownBadgeText}>{ownCount}</Text>
                              </View>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              {!room.is_closed && (
                <View style={{ paddingHorizontal: 14, marginTop: 6 }}>
                  <Pressable style={styles.addMenuBtn} onPress={openAddMenu}>
                    <Feather name="plus" size={16} color={colors.primary} />
                    <Text style={styles.addMenuBtnText}>메뉴 직접 추가</Text>
                  </Pressable>
                  <Text style={styles.addMenuHint}>
                    메뉴에 없는 항목은 직접 추가해서 함께 주문할 수 있어요.
                  </Text>
                </View>
              )}
            </View>

          /* ── 현황 탭 ── */
          ) : tab === "orders" ? (
            <View style={{ padding: 16, gap: 14 }}>
              {/* 실시간 상태 + SummaryCell */}
              <View style={[styles.summaryCard, CARD_SHADOW]}>
                <View style={styles.liveBarInCard}>
                  <View style={[styles.liveDotBar, { backgroundColor: room.is_closed ? colors.destructive : "#16a34a" }]} />
                  <Text style={[styles.liveBarText, { color: room.is_closed ? colors.destructive : "#16a34a" }]}>
                    {room.is_closed ? "주문 마감됨" : "실시간 · 5초마다 갱신"}
                  </Text>
                  <Text style={styles.liveBarTime}>
                    {lastUpdated.getHours().toString().padStart(2, "0")}:{lastUpdated.getMinutes().toString().padStart(2, "0")}
                  </Text>
                </View>
                <View style={styles.summaryCellRow}>
                  <SummaryCell label="인원" value={`${uniquePeople.length}명`} />
                  <View style={styles.summaryCellDivider} />
                  <SummaryCell label="수량" value={`${totalCount}개`} />
                  <View style={styles.summaryCellDivider} />
                  <SummaryCell label="합계" value={`${grandTotal.toLocaleString()}원`} accent />
                </View>
              </View>

              {/* Empty state */}
              {room.orders.length === 0 ? (
                <View style={styles.emptyOrders}>
                  <View style={styles.emptyIcon}>
                    <Feather name="clock" size={28} color={colors.primary} />
                  </View>
                  <Text style={styles.emptyOrdersTitle}>아직 들어온 주문이 없어요</Text>
                  <Text style={styles.emptyOrdersSub}>
                    팀원에게 링크를 공유해서{"\n"}주문을 받아보세요.
                  </Text>
                </View>
              ) : (
                <>
                  {/* Per-person grouped orders */}
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionEyebrow}>참여자 주문</Text>
                    <Text style={styles.sectionCount}>{uniquePeople.length}</Text>
                    <Text style={styles.sectionMeta}>본인 주문만 수정 가능</Text>
                  </View>

                  {groupedByPerson.map((person) => {
                    const isMe = person.name === profile?.name;
                    return (
                      <View key={person.name} style={[styles.personCard, CARD_SHADOW]}>
                        {/* Avatar + name row */}
                        <View style={styles.personHeader}>
                          <View style={[styles.avatarCircle, { backgroundColor: isMe ? colors.primary : colors.primaryLight }]}>
                            <Text style={[styles.avatarText, { color: isMe ? "#fff" : colors.primary }]}>
                              {person.name.charAt(0)}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <Text style={styles.personName}>{person.name}</Text>
                              {isMe && (
                                <View style={styles.meTag}>
                                  <Text style={styles.meTagText}>나</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.personMeta}>{person.orders.length}개 항목</Text>
                          </View>
                          <Text style={styles.personSubtotal}>{person.subtotal.toLocaleString()}원</Text>
                        </View>

                        {/* Order items */}
                        {person.orders.map((order, i) => (
                          <View key={i} style={[styles.personOrderRow, i > 0 && styles.personOrderRowBorder]}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.personOrderMenu}>{order.menu}</Text>
                              {order.memo ? (
                                <Text style={styles.personOrderMemo}>💬 {order.memo}</Text>
                              ) : null}
                            </View>
                            <Text style={styles.personOrderQty}>× {order.quantity}</Text>
                            <Text style={styles.personOrderPrice}>{(order.price * order.quantity).toLocaleString()}원</Text>
                            {isMe && !room.is_closed && (
                              <Pressable style={styles.editBtn} onPress={() => openEditDetail(order)}>
                                <Feather name="edit-2" size={13} color={colors.primary} />
                              </Pressable>
                            )}
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </>
              )}

              {/* 마감 버튼 */}
              {!room.is_closed ? (
                <Pressable style={[styles.closeBtn, { borderColor: colors.destructive }]} onPress={handleClose}>
                  <Feather name="lock" size={15} color={colors.destructive} />
                  <Text style={[styles.closeBtnText, { color: colors.destructive }]}>주문 마감하기</Text>
                </Pressable>
              ) : (
                <Pressable style={[styles.closeBtn, { borderColor: colors.primary }]} onPress={handleReopen}>
                  <Feather name="unlock" size={15} color={colors.primary} />
                  <Text style={[styles.closeBtnText, { color: colors.primary }]}>마감 취소 (주문 재개)</Text>
                </Pressable>
              )}
            </View>

          /* ── 주문서 탭 ── */
          ) : tab === "sheet" ? (
            <View style={{ padding: 16, gap: 12 }}>
              <View style={[styles.sheetHeader, CARD_SHADOW]}>
                <View>
                  <Text style={styles.sheetTitle}>총무 주문서</Text>
                  <Text style={styles.sheetSub}>{room.restaurant_info.name} · {room.orders.length}명 · 총 {totalCount}개</Text>
                </View>
                <Pressable style={styles.copyBtn} onPress={handleCopySheet}>
                  <Feather name="copy" size={13} color={colors.primary} />
                  <Text style={styles.copyBtnText}>복사</Text>
                </Pressable>
              </View>

              {room.orders.length === 0 ? (
                <View style={styles.emptyOrders}>
                  <Feather name="clipboard" size={36} color="#c9b8e8" />
                  <Text style={styles.emptyOrdersTitle}>주문이 없습니다</Text>
                </View>
              ) : (
                sheetGroups.map((group) => (
                  <View key={group.menuName} style={[styles.sheetGroup, CARD_SHADOW]}>
                    <Text style={styles.sheetMenuName}>{group.menuName}</Text>
                    {group.items.map((it, i) => (
                      <View key={i} style={[styles.sheetItem, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                        <View style={styles.sheetItemLeft}>
                          {it.temp && (
                            <View style={[styles.tempChip, { backgroundColor: it.temp === "아이스" ? "#dbeafe" : "#fee2e2" }]}>
                              <Text style={[styles.tempChipText, { color: it.temp === "아이스" ? colors.primary : colors.destructive }]}>
                                {it.temp === "아이스" ? "🧊 아이스" : "☕ 핫"}
                              </Text>
                            </View>
                          )}
                          {it.size !== "기본" && (
                            <View style={[styles.sizeChip, { backgroundColor: colors.primaryLight }]}>
                              <Text style={[styles.sizeChipText, { color: colors.primary }]}>{it.size}</Text>
                            </View>
                          )}
                          {!it.temp && it.size === "기본" && (
                            <Text style={styles.sheetItemOption}>기본</Text>
                          )}
                        </View>
                        <View style={styles.sheetItemRight}>
                          <Text style={styles.sheetItemQty}>× {it.qty}개</Text>
                          <Text style={styles.sheetItemPeople}>{it.people.join(", ")}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ))
              )}

              {room.orders.length > 0 && (
                <View style={[styles.sheetTotal, CARD_SHADOW]}>
                  <Text style={styles.sheetTotalLabel}>총 합계</Text>
                  <Text style={styles.sheetTotalValue}>{grandTotal.toLocaleString()}원</Text>
                </View>
              )}

              {/* 주문서 힌트 */}
              <View style={styles.sheetHint}>
                <Text style={styles.sheetHintText}>
                  💡 [복사] 버튼을 누르면 전화 주문 시 읽기 좋은 형태로 클립보드에 담겨요.
                </Text>
              </View>
            </View>
          ) : null}

          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>

        {/* Toast notification */}
        {toast && (
          <SmioToast message={toast} onHide={() => setToast(null)} />
        )}
      </View>

      {/* 메뉴 상세 바텀 시트 */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <Pressable style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
              <View style={styles.modalHandle} />

              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle} numberOfLines={2}>{selectedMenu?.name}</Text>
                <Pressable onPress={() => setModalVisible(false)} style={styles.modalCloseBtn}>
                  <Feather name="x" size={16} color={colors.mutedForeground} />
                </Pressable>
              </View>

              <Text style={styles.modalPriceRow}>{((selectedMenu?.price ?? 0) * quantity).toLocaleString()}원</Text>

              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                <View style={{ gap: 18 }}>

                  {selectedMenu?.is_beverage && (
                    <View style={styles.optionSection}>
                      <Text style={styles.optionSectionLabel}>온도</Text>
                      <View style={styles.optionRow}>
                        {(["아이스", "핫"] as const).map((t) => (
                          <Pressable
                            key={t}
                            style={[
                              styles.optionBtn,
                              {
                                borderColor: temperature === t ? (t === "아이스" ? colors.primary : colors.destructive) : colors.border,
                                backgroundColor: temperature === t ? (t === "아이스" ? colors.primaryLight : "#fee2e2") : colors.background,
                              },
                            ]}
                            onPress={() => setTemperature(temperature === t ? null : t)}
                          >
                            <Text style={[
                              styles.optionBtnText,
                              { color: temperature === t ? (t === "아이스" ? colors.primary : colors.destructive) : colors.mutedForeground, fontWeight: temperature === t ? "700" : "400" },
                            ]}>
                              {t === "아이스" ? "🧊 아이스" : "☕ 핫"}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}

                  <View style={styles.optionSection}>
                    <Text style={styles.optionSectionLabel}>사이즈</Text>
                    <View style={styles.optionRow}>
                      {(["기본", "S", "M", "L"] as const).map((s) => (
                        <Pressable
                          key={s}
                          style={[
                            styles.optionBtn,
                            {
                              borderColor: size === s ? colors.primary : colors.border,
                              backgroundColor: size === s ? colors.primaryLight : colors.background,
                            },
                          ]}
                          onPress={() => setSize(s)}
                        >
                          <Text style={[
                            styles.optionBtnText,
                            { color: size === s ? colors.primary : colors.mutedForeground, fontWeight: size === s ? "700" : "400" },
                          ]}>
                            {s}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <View style={styles.optionSection}>
                    <Text style={styles.optionSectionLabel}>수량</Text>
                    <View style={styles.stepperRow}>
                      <View style={styles.stepper}>
                        <Pressable
                          style={styles.stepperBtn}
                          onPress={() => setQuantity(Math.max(1, quantity - 1))}
                          disabled={quantity <= 1}
                        >
                          <Text style={styles.stepperBtnText}>−</Text>
                        </Pressable>
                        <Text style={styles.stepperQty}>{quantity}</Text>
                        <Pressable style={styles.stepperBtn} onPress={() => setQuantity(quantity + 1)}>
                          <Text style={styles.stepperBtnText}>＋</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>

                  <View style={styles.optionSection}>
                    <Text style={styles.optionSectionLabel}>
                      요청사항 <Text style={{ color: colors.mutedForeground, fontWeight: "400" }}>(선택)</Text>
                    </Text>
                    <TextInput
                      style={styles.memoInput}
                      placeholder="예) 샷 추가요, 시럽 빼주세요, 곱빼기"
                      placeholderTextColor="#b0a0c8"
                      value={memo}
                      onChangeText={setMemo}
                    />
                  </View>

                  {/* 이름 확인 row */}
                  <View style={styles.nameConfirmRow}>
                    <Text style={styles.nameConfirmIcon}>⚡</Text>
                    <Text style={styles.nameConfirmText}>
                      <Text style={styles.nameConfirmName}>{profile?.name}</Text>
                      님 이름으로 주문돼요
                    </Text>
                  </View>
                </View>
              </ScrollView>

              <View style={styles.modalBtns}>
                {editingOrder && (
                  <Pressable
                    style={[styles.deleteBtn, { opacity: submitting ? 0.5 : 1 }]}
                    onPress={handleDeleteOrder}
                    disabled={submitting}
                  >
                    <Feather name="trash-2" size={15} color={colors.destructive} />
                    <Text style={styles.deleteBtnText}>취소</Text>
                  </Pressable>
                )}
                <Pressable
                  style={[styles.cartBtn, { opacity: submitting ? 0.7 : 1, flex: editingOrder ? 1 : undefined }]}
                  onPress={handleOrder}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.cartBtnText}>
                      {editingOrder ? "수정 완료" : `담기 · ${((selectedMenu?.price ?? 0) * quantity).toLocaleString()}원`}
                    </Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* 메뉴 직접 추가 바텀 시트 */}
      <Modal visible={addMenuVisible} transparent animationType="slide" onRequestClose={() => setAddMenuVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setAddMenuVisible(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <Pressable style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
              <View style={styles.modalHandle} />

              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>메뉴 직접 추가</Text>
                <Pressable onPress={() => setAddMenuVisible(false)} style={styles.modalCloseBtn}>
                  <Feather name="x" size={16} color={colors.mutedForeground} />
                </Pressable>
              </View>

              <View style={{ gap: 18, marginTop: 8 }}>
                <View style={styles.optionSection}>
                  <Text style={styles.optionSectionLabel}>메뉴 이름</Text>
                  <TextInput
                    style={styles.memoInput}
                    placeholder="예) 아메리카노, 김치찌개"
                    placeholderTextColor="#b0a0c8"
                    value={newMenuName}
                    onChangeText={setNewMenuName}
                  />
                </View>

                <View style={styles.optionSection}>
                  <Text style={styles.optionSectionLabel}>가격</Text>
                  <TextInput
                    style={styles.memoInput}
                    placeholder="예) 4500"
                    placeholderTextColor="#b0a0c8"
                    keyboardType="number-pad"
                    value={newMenuPrice}
                    onChangeText={(t) => setNewMenuPrice(t.replace(/[^0-9]/g, ""))}
                  />
                </View>

                <View style={styles.optionSection}>
                  <Text style={styles.optionSectionLabel}>분류</Text>
                  <View style={styles.optionRow}>
                    {(["drink", "food", "dessert", "alcohol"] as const).map((c) => (
                      <Pressable
                        key={c}
                        style={[
                          styles.optionBtn,
                          {
                            borderColor: newMenuCategory === c ? colors.primary : colors.border,
                            backgroundColor: newMenuCategory === c ? colors.primaryLight : colors.background,
                          },
                        ]}
                        onPress={() => setNewMenuCategory(c)}
                      >
                        <Text style={[
                          styles.optionBtnText,
                          { color: newMenuCategory === c ? colors.primary : colors.mutedForeground, fontWeight: newMenuCategory === c ? "700" : "400" },
                        ]}>
                          {CATEGORY_TONE[c].tag}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>

              <View style={styles.modalBtns}>
                <Pressable
                  style={[styles.cartBtn, { opacity: addingMenu ? 0.7 : 1 }]}
                  onPress={handleAddMenu}
                  disabled={addingMenu}
                >
                  {addingMenu ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.cartBtnText}>메뉴 추가</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const CARD_SHADOW = {
  shadowColor: colors.shadowColor,
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.07,
  shadowRadius: 16,
  elevation: 3,
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 15, marginTop: 8, color: colors.mutedForeground },
  backBtn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: colors.radius,
  },
  backBtnText: { color: "#fff", fontWeight: "700" },

  // Header
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.background,
  },
  headerBack: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.card,
    alignItems: "center", justifyContent: "center",
    ...CARD_SHADOW,
  },
  headerCenter: { flex: 1 },
  headerRestaurant: {
    fontSize: 17, fontWeight: "700", fontFamily: "Pretendard-Bold",
    color: colors.foreground,
  },
  headerMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  closedBadge: {
    backgroundColor: colors.destructiveLight,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
  },
  closedBadgeText: { color: colors.destructive, fontSize: 11, fontWeight: "700" },
  openBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  openDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#16a34a" },
  openBadgeText: { color: "#16a34a", fontSize: 12 },
  headerRoomId: { color: colors.mutedForeground, fontSize: 12 },
  headerActions: { flexDirection: "row", gap: 4 },
  headerBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.card,
    alignItems: "center", justifyContent: "center",
    ...CARD_SHADOW,
  },

  shareBar: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, marginBottom: 14,
    backgroundColor: colors.primaryLight,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 8,
  },
  shareBarText: { flex: 1, fontSize: 13, fontWeight: "500", color: colors.primary },

  naverLinkBtn: {
    marginHorizontal: 16, marginTop: 8, marginBottom: 4,
    paddingVertical: 9, paddingHorizontal: 14,
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    alignItems: "center",
  },
  naverLinkText: {
    fontSize: 13, fontWeight: "600", color: colors.primary,
    fontFamily: "Pretendard-SemiBold",
  },

  // Tab pills
  tabBar: {
    flexDirection: "row", marginHorizontal: 16, marginBottom: 14,
    backgroundColor: colors.card, borderRadius: 999, padding: 4, gap: 2,
    ...CARD_SHADOW,
  },
  tabPill: { flex: 1, paddingVertical: 9, borderRadius: 999, alignItems: "center" },
  tabPillActive: { backgroundColor: colors.primary },
  tabPillText: {
    fontSize: 13, fontWeight: "600", fontFamily: "Pretendard-SemiBold",
    color: colors.mutedForeground,
  },
  tabPillTextActive: { color: "#fff" },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#16a34a" },

  closedBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderRadius: colors.radius, backgroundColor: colors.destructiveLight,
  },
  closedBannerText: { fontSize: 14, fontWeight: "600", color: colors.destructive },

  // Menu section
  menuSection: { paddingHorizontal: 14, marginBottom: 8 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginBottom: 10, marginTop: 10,
  },
  sectionEyebrow: {
    fontSize: 11, fontWeight: "700", fontFamily: "Pretendard-Bold",
    letterSpacing: 0.06 * 11, textTransform: "uppercase",
    color: colors.mutedForeground,
  },
  sectionCount: {
    fontSize: 11, fontWeight: "700",
    backgroundColor: colors.primaryLight,
    color: colors.primary,
    paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999,
  },
  sectionMeta: { fontSize: 11, color: colors.mutedForeground, marginLeft: "auto" },

  menuGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 10,
  },
  menuCard: {
    width: "47.5%",
    backgroundColor: colors.card,
    borderRadius: colors.radius,
    overflow: "visible",
    position: "relative",
    ...CARD_SHADOW,
  },
  menuCardOwned: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  menuArtBlock: {
    aspectRatio: 16 / 10,
    borderTopLeftRadius: colors.radius,
    borderTopRightRadius: colors.radius,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  menuCategoryTag: {
    position: "absolute", top: 7, left: 7,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999,
  },
  menuCategoryTagText: { fontSize: 10, fontWeight: "700" },
  menuCardBody: { padding: 10, gap: 3, alignItems: "center" },
  menuCardName: {
    fontSize: Platform.OS === "android" ? 9 : 17,
    fontWeight: "600", fontFamily: "Pretendard-SemiBold",
    color: colors.foreground,
    lineHeight: Platform.OS === "android" ? 13 : 23,
    textAlign: "center",
  },
  menuCardPrice: {
    fontSize: Platform.OS === "android" ? 10 : 20,
    fontWeight: "800", fontFamily: "Pretendard-ExtraBold",
    color: colors.primary,
    textAlign: "center",
  },
  addMenuBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 14, borderRadius: colors.radius,
    borderWidth: 1.5, borderColor: colors.primary, borderStyle: "dashed",
    backgroundColor: colors.primaryLight,
  },
  addMenuBtnText: {
    fontSize: 14, fontWeight: "700", fontFamily: "Pretendard-Bold",
    color: colors.primary,
  },
  addMenuHint: {
    fontSize: 12, color: colors.mutedForeground, textAlign: "center",
    marginTop: 8, lineHeight: 17,
  },
  ownBadge: {
    position: "absolute", top: 6, right: 6,
    minWidth: 22, height: 22, borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: 6,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 6,
    elevation: 4,
  },
  ownBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },

  // Orders tab — summary
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: colors.radius,
    padding: 14,
    gap: 10,
  },
  liveBarInCard: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDotBar: { width: 7, height: 7, borderRadius: 4 },
  liveBarText: { fontSize: 12, fontWeight: "600", flex: 1 },
  liveBarTime: { fontSize: 11, color: colors.mutedForeground },
  summaryCellRow: {
    flexDirection: "row", alignItems: "center",
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingTop: 12, marginTop: 4,
  },
  summaryCell: { flex: 1, alignItems: "center" },
  summaryCellLabel: { fontSize: 11, color: colors.mutedForeground, marginBottom: 4 },
  summaryCellValue: {
    fontSize: 17, fontWeight: "800", fontFamily: "Pretendard-ExtraBold",
    color: colors.foreground,
  },
  summaryCellAccent: { color: colors.primary, fontSize: 18 },
  summaryCellDivider: { width: 1, height: 28, backgroundColor: colors.border },

  // Empty orders
  emptyOrders: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 999,
    backgroundColor: colors.primaryLight,
    alignItems: "center", justifyContent: "center",
    marginBottom: 8,
  },
  emptyOrdersTitle: {
    fontSize: 17, fontWeight: "700", fontFamily: "Pretendard-Bold",
    color: colors.foreground,
  },
  emptyOrdersSub: {
    fontSize: 13, color: colors.mutedForeground, textAlign: "center", lineHeight: 20,
  },

  // Per-person cards
  personCard: {
    backgroundColor: colors.card,
    borderRadius: colors.radius,
    padding: 14,
  },
  personHeader: {
    flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10,
  },
  avatarCircle: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 15, fontWeight: "700", fontFamily: "Pretendard-Bold" },
  personName: {
    fontSize: 14, fontWeight: "700", fontFamily: "Pretendard-Bold",
    color: colors.foreground,
  },
  meTag: {
    backgroundColor: colors.primary,
    paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999,
  },
  meTagText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  personMeta: { fontSize: 12, color: colors.mutedForeground, marginTop: 1 },
  personSubtotal: {
    fontSize: 15, fontWeight: "800", fontFamily: "Pretendard-ExtraBold",
    color: colors.primary,
  },
  personOrderRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 8,
  },
  personOrderRowBorder: {
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  personOrderMenu: { fontSize: 14, fontWeight: "600", color: colors.foreground },
  personOrderMemo: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
  personOrderQty: { fontSize: 13, color: colors.mutedForeground },
  personOrderPrice: { fontSize: 13, fontWeight: "700", color: colors.foreground },
  editBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.primaryLight,
    alignItems: "center", justifyContent: "center",
  },

  closeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, borderRadius: colors.radius,
    borderWidth: 1.5, marginTop: 4,
  },
  closeBtnText: { fontSize: 15, fontWeight: "700" },

  // Sheet tab
  sheetHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: colors.card, borderRadius: colors.radius, padding: 14, gap: 8,
  },
  sheetTitle: {
    fontSize: 16, fontWeight: "800", fontFamily: "Pretendard-ExtraBold",
    color: colors.foreground,
  },
  sheetSub: { fontSize: 12, marginTop: 2, color: colors.mutedForeground },
  copyBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: colors.primaryLight,
  },
  copyBtnText: { fontSize: 13, fontWeight: "700", color: colors.primary },
  sheetGroup: {
    backgroundColor: colors.card, borderRadius: colors.radius, overflow: "hidden",
  },
  sheetMenuName: {
    fontSize: 15, fontWeight: "800", fontFamily: "Pretendard-ExtraBold",
    color: colors.foreground,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: colors.background,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sheetItem: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 10, gap: 8,
  },
  sheetItemLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  tempChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  tempChipText: { fontSize: 12, fontWeight: "700" },
  sizeChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  sizeChipText: { fontSize: 12, fontWeight: "700" },
  sheetItemOption: { fontSize: 13, color: colors.mutedForeground },
  sheetItemRight: { alignItems: "flex-end", gap: 2 },
  sheetItemQty: { fontSize: 16, fontWeight: "800", color: colors.primary },
  sheetItemPeople: { fontSize: 11, color: colors.mutedForeground },
  sheetTotal: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 16, borderRadius: colors.radius, backgroundColor: colors.primary,
  },
  sheetTotalLabel: { color: "#fff", fontSize: 15, fontWeight: "700" },
  sheetTotalValue: { color: "#fff", fontSize: 22, fontWeight: "800" },
  sheetHint: {
    padding: 14, borderRadius: colors.radius, backgroundColor: colors.primaryLight,
  },
  sheetHintText: { fontSize: 12, color: colors.primary, lineHeight: 18 },

  // Modal bottom sheet
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20,
  },
  modalHandle: {
    width: 36, height: 4, backgroundColor: colors.border,
    borderRadius: 2, alignSelf: "center", marginBottom: 16,
  },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: 4, gap: 12,
  },
  modalTitle: {
    fontSize: 20, fontWeight: "800", fontFamily: "Pretendard-ExtraBold",
    color: colors.foreground, flex: 1, lineHeight: 28,
  },
  modalCloseBtn: {
    width: 32, height: 32, borderRadius: 999,
    backgroundColor: colors.background,
    alignItems: "center", justifyContent: "center",
  },
  modalPriceRow: {
    fontSize: 20, fontWeight: "800", fontFamily: "Pretendard-ExtraBold",
    color: colors.primary, marginBottom: 16,
  },

  optionSection: { gap: 8 },
  optionSectionLabel: {
    fontSize: 13, fontWeight: "700", fontFamily: "Pretendard-Bold",
    color: colors.foreground,
  },
  optionRow: { flexDirection: "row", gap: 8 },
  optionBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1.5, alignItems: "center", justifyContent: "center",
  },
  optionBtnText: { fontSize: 14 },

  stepperRow: { flexDirection: "row" },
  stepper: {
    flexDirection: "row", alignItems: "center", gap: 16,
    backgroundColor: colors.background, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 999,
  },
  stepperBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.card, alignItems: "center", justifyContent: "center",
    ...CARD_SHADOW,
  },
  stepperBtnText: { fontSize: 20, fontWeight: "700", color: colors.foreground, lineHeight: 24 },
  stepperQty: {
    minWidth: 28, textAlign: "center",
    fontSize: 16, fontWeight: "700", fontFamily: "Pretendard-Bold", color: colors.foreground,
  },

  memoInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: colors.foreground, backgroundColor: colors.background,
  },

  // Name confirm row
  nameConfirmRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderRadius: 10, backgroundColor: colors.background,
  },
  nameConfirmIcon: { fontSize: 14 },
  nameConfirmText: { fontSize: 13, color: colors.mutedForeground, fontWeight: "500" },
  nameConfirmName: { color: colors.foreground, fontWeight: "700" },

  modalBtns: { flexDirection: "row", gap: 10, marginTop: 16 },
  deleteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 16, paddingHorizontal: 18,
    borderRadius: 12, borderWidth: 1.5, borderColor: colors.destructive,
  },
  deleteBtnText: { fontSize: 14, fontWeight: "700", color: colors.destructive },
  cartBtn: {
    flex: 1, backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 12,
    alignItems: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 4,
  },
  cartBtnText: { color: "#fff", fontSize: 17, fontWeight: "800", fontFamily: "Pretendard-ExtraBold" },

  // Toast
  toast: {
    position: "absolute",
    bottom: 24, alignSelf: "center",
    backgroundColor: "rgba(26,22,35,0.88)",
    paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 999,
  },
  toastText: { color: "#fff", fontSize: 14, fontWeight: "600", fontFamily: "Pretendard-SemiBold" },
});
