import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  KeyboardAvoidingView,
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
    parking?: string;
    menu: MenuItem[];
  };
  orders: Order[];
  is_closed: boolean;
  host_id?: string;
}

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [room, setRoom] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"menu" | "orders">("menu");

  // 주문 입력 상태
  const [selectedMenu, setSelectedMenu] = useState<MenuItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 수정 상태
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  // 즐겨찾기 여부
  const [isFavorite, setIsFavorite] = useState(false);

  const [profile, setProfile] = useState<{ name: string; rank: string } | null>(null);

  useEffect(() => {
    getProfile().then(setProfile);
    checkFavorite();
    fetchRoom();
    // 5초마다 폴링
    pollRef.current = setInterval(fetchRoom, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id]);

  const checkFavorite = async () => {
    const favs = await getFavorites();
    setIsFavorite(favs.some((f) => f.url.includes(id ?? "")));
  };

  const fetchRoom = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/rooms/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setRoom(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [id]);

  const handleOrder = async () => {
    if (!selectedMenu || !profile) return;
    setSubmitting(true);
    try {
      const endpoint = editingOrder
        ? `${getApiBaseUrl()}/rooms/${id}/orders/${encodeURIComponent(profile.name)}`
        : `${getApiBaseUrl()}/rooms/${id}/orders`;
      const method = editingOrder ? "PUT" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_name: profile.name,
          rank: profile.rank,
          menu: selectedMenu.name,
          quantity,
          price: selectedMenu.price,
          memo: memo.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelectedMenu(null);
      setQuantity(1);
      setMemo("");
      setEditingOrder(null);
      setTab("orders");
      await fetchRoom();
    } catch {
      Alert.alert("오류", "주문 처리 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async () => {
    Alert.alert("주문 마감", "주문을 마감하시겠습니까?\n이후 추가 주문이 차단됩니다.", [
      { text: "취소", style: "cancel" },
      {
        text: "마감",
        style: "destructive",
        onPress: async () => {
          await fetch(`${getApiBaseUrl()}/rooms/${id}/close`, { method: "POST" });
          fetchRoom();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  const handleShare = async () => {
    const shareUrl = `${getApiBaseUrl().replace("/api", "")}?room_id=${id}`;
    try {
      await Share.share({
        message: `Smio 주문방에 참여하세요!\n${room?.restaurant_info.name} 주문 취합 중 🍽️\n\n${shareUrl}`,
        url: shareUrl,
      });
    } catch {}
  };

  const handleCopyUrl = () => {
    const shareUrl = `${getApiBaseUrl().replace("/api", "")}?room_id=${id}`;
    Clipboard.setString(shareUrl);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("복사 완료", "주문방 링크가 복사되었습니다.");
  };

  const handleAddFavorite = async () => {
    if (!room) return;
    await addFavorite({ name: room.restaurant_info.name, url: `https://smio2.johnbae.co.kr?room=${id}` });
    setIsFavorite(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("즐겨찾기 추가", `${room.restaurant_info.name}이(가) 즐겨찾기에 추가되었습니다.`);
  };

  const grandTotal = room?.orders.reduce((sum, o) => sum + o.price * o.quantity, 0) ?? 0;
  const totalCount = room?.orders.reduce((sum, o) => sum + o.quantity, 0) ?? 0;

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>주문방 불러오는 중...</Text>
      </View>
    );
  }

  if (!room) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={48} color={colors.destructive} />
        <Text style={[styles.loadingText, { color: colors.foreground }]}>주문방을 찾을 수 없습니다</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* 헤더 */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => router.back()} style={styles.headerBack}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerRestaurant} numberOfLines={1}>
              {room.restaurant_info.name}
            </Text>
            <View style={styles.headerMeta}>
              {room.is_closed ? (
                <View style={styles.closedBadge}>
                  <Text style={styles.closedBadgeText}>마감</Text>
                </View>
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
            <Pressable onPress={handleAddFavorite} style={styles.headerBtn}>
              <Feather name="bookmark" size={18} color={isFavorite ? "#fbbf24" : "#fff"} />
            </Pressable>
            <Pressable onPress={handleShare} style={styles.headerBtn}>
              <Feather name="share-2" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* 공유 바 */}
        <Pressable
          style={[styles.shareBar, { backgroundColor: colors.primaryLight }]}
          onPress={handleCopyUrl}
        >
          <Feather name="link" size={14} color={colors.primary} />
          <Text style={[styles.shareBarText, { color: colors.primary }]} numberOfLines={1}>
            링크 복사해서 팀원들에게 공유하세요
          </Text>
          <Feather name="copy" size={14} color={colors.primary} />
        </Pressable>

        {/* 탭 */}
        <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
          {(["menu", "orders"] as const).map((t) => (
            <Pressable
              key={t}
              style={[styles.tabBtn, tab === t && { borderBottomColor: colors.primary }]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
                {t === "menu" ? "메뉴 선택" : `주문 현황 (${room.orders.length}명)`}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {tab === "menu" ? (
            <View style={{ padding: 16, gap: 16 }}>
              {room.is_closed && (
                <View style={[styles.closedBanner, { backgroundColor: colors.destructiveLight }]}>
                  <Feather name="lock" size={16} color={colors.destructive} />
                  <Text style={[styles.closedBannerText, { color: colors.destructive }]}>
                    주문이 마감되었습니다
                  </Text>
                </View>
              )}

              {/* 메뉴 목록 */}
              {room.restaurant_info.menu.map((item, i) => (
                <Pressable
                  key={i}
                  style={[
                    styles.menuItem,
                    {
                      backgroundColor: colors.card,
                      borderColor: selectedMenu?.name === item.name ? colors.primary : colors.border,
                      borderWidth: selectedMenu?.name === item.name ? 2 : 1,
                    },
                  ]}
                  onPress={() => {
                    if (room.is_closed) return;
                    setSelectedMenu(selectedMenu?.name === item.name ? null : item);
                    Haptics.selectionAsync();
                  }}
                  disabled={room.is_closed}
                >
                  <View style={styles.menuItemLeft}>
                    <Text style={[styles.menuName, { color: colors.foreground }]}>{item.name}</Text>
                    {item.is_beverage && (
                      <Text style={[styles.beverageTag, { color: colors.primary, backgroundColor: colors.primaryLight }]}>
                        음료
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.menuPrice, { color: colors.primary }]}>
                    {item.price.toLocaleString()}원
                  </Text>
                </Pressable>
              ))}

              {/* 주문 입력 */}
              {selectedMenu && !room.is_closed && (
                <View style={[styles.orderPanel, { backgroundColor: colors.card, borderColor: colors.primary }]}>
                  <Text style={[styles.orderPanelTitle, { color: colors.foreground }]}>
                    {selectedMenu.name} 주문
                  </Text>

                  <View style={styles.qtyRow}>
                    <Text style={[styles.qtyLabel, { color: colors.mutedForeground }]}>수량</Text>
                    <Pressable
                      style={[styles.qtyBtn, { borderColor: colors.border }]}
                      onPress={() => setQuantity(Math.max(1, quantity - 1))}
                    >
                      <Feather name="minus" size={16} color={colors.foreground} />
                    </Pressable>
                    <Text style={[styles.qtyNum, { color: colors.foreground }]}>{quantity}</Text>
                    <Pressable
                      style={[styles.qtyBtn, { borderColor: colors.border }]}
                      onPress={() => setQuantity(quantity + 1)}
                    >
                      <Feather name="plus" size={16} color={colors.foreground} />
                    </Pressable>
                  </View>

                  <TextInput
                    style={[styles.memoInput, { borderColor: colors.border, color: colors.foreground }]}
                    placeholder="메모 (맵기 조절, 알레르기 등)"
                    placeholderTextColor={colors.mutedForeground}
                    value={memo}
                    onChangeText={setMemo}
                  />

                  <View style={styles.orderSummaryRow}>
                    <Text style={[styles.orderSummaryLabel, { color: colors.mutedForeground }]}>
                      {profile?.rank} {profile?.name}
                    </Text>
                    <Text style={[styles.orderSummaryPrice, { color: colors.primary }]}>
                      {(selectedMenu.price * quantity).toLocaleString()}원
                    </Text>
                  </View>

                  <Pressable
                    style={[styles.submitBtn, { opacity: submitting ? 0.7 : 1 }]}
                    onPress={handleOrder}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.submitBtnText}>
                        {editingOrder ? "주문 수정" : "주문 완료"}
                      </Text>
                    )}
                  </Pressable>
                </View>
              )}
            </View>
          ) : (
            <View style={{ padding: 16, gap: 12 }}>
              {/* 집계 요약 */}
              <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>총 인원</Text>
                  <Text style={[styles.summaryValue, { color: colors.foreground }]}>{room.orders.length}명</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>총 수량</Text>
                  <Text style={[styles.summaryValue, { color: colors.foreground }]}>{totalCount}개</Text>
                </View>
                <View style={[styles.summaryRow, styles.summaryTotal]}>
                  <Text style={[styles.summaryLabel, { color: colors.primary, fontWeight: "700" }]}>합계</Text>
                  <Text style={[styles.summaryTotalValue, { color: colors.primary }]}>
                    {grandTotal.toLocaleString()}원
                  </Text>
                </View>
              </View>

              {/* 개인별 주문 */}
              {room.orders.length === 0 ? (
                <View style={styles.emptyOrders}>
                  <Feather name="shopping-bag" size={40} color={colors.border} />
                  <Text style={[styles.emptyOrdersText, { color: colors.mutedForeground }]}>
                    아직 주문이 없습니다
                  </Text>
                </View>
              ) : (
                room.orders.map((order, i) => (
                  <View key={i} style={[styles.orderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.orderCardTop}>
                      <View style={[styles.rankBadge, { backgroundColor: colors.primaryLight }]}>
                        <Text style={[styles.rankBadgeText, { color: colors.primary }]}>{order.rank}</Text>
                      </View>
                      <Text style={[styles.orderUserName, { color: colors.foreground }]}>{order.user_name}</Text>
                      {profile?.name === order.user_name && !room.is_closed && (
                        <Pressable
                          style={styles.editBtn}
                          onPress={() => {
                            const menuItem = room.restaurant_info.menu.find((m) => m.name === order.menu);
                            if (menuItem) {
                              setSelectedMenu(menuItem);
                              setQuantity(order.quantity);
                              setMemo(order.memo ?? "");
                              setEditingOrder(order);
                              setTab("menu");
                            }
                          }}
                        >
                          <Feather name="edit-2" size={14} color={colors.mutedForeground} />
                          <Text style={[styles.editBtnText, { color: colors.mutedForeground }]}>수정</Text>
                        </Pressable>
                      )}
                    </View>
                    <View style={styles.orderCardBody}>
                      <Text style={[styles.orderMenuName, { color: colors.foreground }]}>
                        {order.menu} × {order.quantity}
                      </Text>
                      <Text style={[styles.orderPrice, { color: colors.primary }]}>
                        {(order.price * order.quantity).toLocaleString()}원
                      </Text>
                    </View>
                    {order.memo ? (
                      <Text style={[styles.orderMemo, { color: colors.mutedForeground }]}>
                        💬 {order.memo}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}

              {/* 방장 마감 버튼 */}
              {!room.is_closed && (
                <Pressable
                  style={[styles.closeBtn, { borderColor: colors.destructive }]}
                  onPress={handleClose}
                >
                  <Feather name="lock" size={16} color={colors.destructive} />
                  <Text style={[styles.closeBtnText, { color: colors.destructive }]}>주문 마감</Text>
                </Pressable>
              )}
            </View>
          )}
          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 15, marginTop: 8 },
  backBtn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: colors.radius,
  },
  backBtnText: { color: "#fff", fontWeight: "700" },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerBack: { padding: 4 },
  headerCenter: { flex: 1 },
  headerRestaurant: { fontSize: 17, fontWeight: "700", color: "#fff" },
  headerMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  closedBadge: { backgroundColor: colors.destructive, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  closedBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  openBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  openDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4ade80" },
  openBadgeText: { color: "rgba(255,255,255,0.9)", fontSize: 12 },
  headerRoomId: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
  headerActions: { flexDirection: "row", gap: 4 },
  headerBtn: { padding: 6 },
  shareBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  shareBarText: { flex: 1, fontSize: 13, fontWeight: "500" },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    backgroundColor: colors.card,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 13,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabText: { fontSize: 14, fontWeight: "600" },
  closedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: colors.radius,
  },
  closedBannerText: { fontSize: 14, fontWeight: "600" },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: colors.radius,
    padding: 14,
  },
  menuItemLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  menuName: { fontSize: 15, fontWeight: "500" },
  beverageTag: {
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  menuPrice: { fontSize: 15, fontWeight: "700" },
  orderPanel: {
    borderWidth: 2,
    borderRadius: colors.radius,
    padding: 16,
    gap: 12,
  },
  orderPanelTitle: { fontSize: 16, fontWeight: "700" },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  qtyLabel: { fontSize: 14, flex: 1 },
  qtyBtn: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyNum: { fontSize: 18, fontWeight: "700", minWidth: 28, textAlign: "center" },
  memoInput: {
    borderWidth: 1.5,
    borderRadius: colors.radius,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  orderSummaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderSummaryLabel: { fontSize: 13 },
  orderSummaryPrice: { fontSize: 18, fontWeight: "700" },
  submitBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: colors.radius,
    alignItems: "center",
  },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  summaryCard: {
    borderRadius: colors.radius,
    padding: 16,
    gap: 10,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 14, fontWeight: "600" },
  summaryTotal: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 4 },
  summaryTotalValue: { fontSize: 20, fontWeight: "800" },
  emptyOrders: { alignItems: "center", paddingVertical: 40, gap: 12 },
  emptyOrdersText: { fontSize: 15 },
  orderCard: {
    borderWidth: 1,
    borderRadius: colors.radius,
    padding: 14,
    gap: 8,
  },
  orderCardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  rankBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  rankBadgeText: { fontSize: 12, fontWeight: "600" },
  orderUserName: { fontSize: 15, fontWeight: "700", flex: 1 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  editBtnText: { fontSize: 12 },
  orderCardBody: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderMenuName: { fontSize: 15 },
  orderPrice: { fontSize: 15, fontWeight: "700" },
  orderMemo: { fontSize: 13 },
  closeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: colors.radius,
    borderWidth: 1.5,
    marginTop: 8,
  },
  closeBtnText: { fontSize: 15, fontWeight: "700" },
});
