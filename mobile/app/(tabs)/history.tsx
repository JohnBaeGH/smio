import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import colors from "@/constants/colors";
import { getApiBaseUrl } from "@/utils/api";
import { getAdminPin, getOrCreateDeviceId } from "@/utils/storage";

interface RoomSummary {
  room_id: string;
  restaurant_name: string;
  created_at: string;
  is_closed: boolean;
  closed_at?: string;
  order_count: number;
  total_amount: number;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${d.getFullYear()}.${mm}.${dd} ${hh}:${min}`;
}

function dateKey(iso: string): string {
  if (!iso) return "날짜 없음";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

const CARD_SHADOW = {
  shadowColor: colors.shadowColor,
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.07,
  shadowRadius: 16,
  elevation: 3,
};

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [adminMode, setAdminMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const fetchRooms = useCallback(async () => {
    try {
      const deviceId = await getOrCreateDeviceId();
      const res = await fetch(`${getApiBaseUrl()}/rooms?owner_id=${encodeURIComponent(deviceId)}`);
      if (res.ok) setRooms(await res.json());
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchRooms(); }, [fetchRooms]));

  const enterAdminMode = async () => {
    const pin = await getAdminPin();
    if (!pin) {
      Alert.alert("관리자 PIN 미설정", "설정 탭에서 관리자 PIN을 먼저 설정해 주세요.");
      return;
    }
    const verify = () => {
      if (Platform.OS === "web") {
        const input = window.prompt("관리자 PIN을 입력하세요");
        if (input === pin) {
          setAdminMode(true);
          setSelected(new Set());
        } else if (input !== null) {
          alert("PIN이 올바르지 않습니다.");
        }
      } else {
        Alert.prompt?.("관리자 인증", "PIN을 입력하세요", [
          { text: "취소", style: "cancel" },
          {
            text: "확인",
            onPress: (input) => {
              if (input === pin) {
                setAdminMode(true);
                setSelected(new Set());
              } else {
                Alert.alert("오류", "PIN이 올바르지 않습니다.");
              }
            },
          },
        ], "secure-text");
      }
    };
    verify();
  };

  const exitAdminMode = () => {
    setAdminMode(false);
    setSelected(new Set());
  };

  const toggleSelect = (room_id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(room_id) ? next.delete(room_id) : next.add(room_id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(rooms.map((r) => r.room_id)));
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    const confirmed =
      Platform.OS === "web"
        ? window.confirm(`선택한 ${selected.size}개의 주문방을 삭제하시겠습니까?`)
        : await new Promise<boolean>((resolve) =>
            Alert.alert("삭제 확인", `선택한 ${selected.size}개를 삭제하시겠습니까?`, [
              { text: "취소", onPress: () => resolve(false) },
              { text: "삭제", style: "destructive", onPress: () => resolve(true) },
            ])
          );
    if (!confirmed) return;
    setDeleting(true);
    try {
      const deviceId = await getOrCreateDeviceId();
      await Promise.all(
        Array.from(selected).map((room_id) =>
          fetch(`${getApiBaseUrl()}/rooms/${room_id}?owner_id=${encodeURIComponent(deviceId)}`, { method: "DELETE" })
        )
      );
      await fetchRooms();
      setSelected(new Set());
    } catch {
      Alert.alert("오류", "삭제 중 오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  const grouped = rooms.reduce<Record<string, RoomSummary[]>>((acc, room) => {
    const key = dateKey(room.created_at);
    if (!acc[key]) acc[key] = [];
    acc[key].push(room);
    return acc;
  }, {});

  const todayKey = dateKey(new Date().toISOString());
  const todayCount = (grouped[todayKey] ?? []).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        {adminMode ? (
          <>
            <View>
              <Text style={styles.eyebrow}>관리자 모드</Text>
              <Text style={styles.headerTitle}>주문 히스토리</Text>
            </View>
            <View style={styles.adminActions}>
              <Pressable style={styles.adminChip} onPress={selectAll}>
                <Text style={styles.adminChipText}>전체</Text>
              </Pressable>
              {selected.size > 0 && (
                <Pressable
                  style={[styles.adminChip, styles.adminChipDanger]}
                  onPress={handleDeleteSelected}
                  disabled={deleting}
                >
                  {deleting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={[styles.adminChipText, { color: "#fff" }]}>{selected.size}개 삭제</Text>
                  }
                </Pressable>
              )}
              <Pressable style={styles.adminExitBtn} onPress={exitAdminMode}>
                <Feather name="x" size={14} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View>
              <Text style={styles.eyebrow}>주문 히스토리</Text>
              <Text style={styles.headerTitle}>오늘 {todayCount}개 방</Text>
            </View>
            <Pressable style={styles.adminEntryBtn} onPress={enterAdminMode}>
              <Feather name="shield" size={13} color={colors.primary} />
              <Text style={styles.adminEntryText}>관리</Text>
            </Pressable>
          </>
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchRooms(); }}
              tintColor={colors.primary}
            />
          }
        >
          {rooms.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="inbox" size={40} color="#c9b8e8" />
              <Text style={styles.emptyText}>아직 주문 기록이 없습니다</Text>
            </View>
          ) : (
            Object.entries(grouped)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([date, list]) => (
                <View key={date} style={styles.dateGroup}>
                  <Text style={styles.dateLabel}>{date}</Text>
                  {list.map((room) => {
                    const isSelected = selected.has(room.room_id);
                    return (
                      <Pressable
                        key={room.room_id}
                        style={[
                          styles.roomCard,
                          isSelected && styles.roomCardSelected,
                        ]}
                        onPress={() => {
                          if (adminMode) {
                            toggleSelect(room.room_id);
                          } else {
                            router.push(`/room/${room.room_id}`);
                          }
                        }}
                      >
                        {adminMode && (
                          <View style={[
                            styles.checkbox,
                            isSelected && styles.checkboxOn,
                          ]}>
                            {isSelected && <Feather name="check" size={11} color="#fff" />}
                          </View>
                        )}

                        <View style={{ flex: 1 }}>
                          <View style={styles.cardTop}>
                            <Text style={styles.restaurantName} numberOfLines={1}>
                              {room.restaurant_name}
                            </Text>
                            <View style={[
                              styles.statusBadge,
                              { backgroundColor: room.is_closed ? "#fee2e2" : "#dcfce7" },
                            ]}>
                              <View style={[
                                styles.statusDot,
                                { backgroundColor: room.is_closed ? colors.destructive : "#16a34a" },
                              ]} />
                              <Text style={[
                                styles.statusText,
                                { color: room.is_closed ? colors.destructive : "#16a34a" },
                              ]}>
                                {room.is_closed ? "마감" : "주문 중"}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.cardMeta}>
                            <Feather name="clock" size={11} color={colors.mutedForeground} />
                            <Text style={styles.metaText}>{formatDate(room.created_at)}</Text>
                          </View>

                          <View style={styles.cardStats}>
                            <View style={styles.statItem}>
                              <Feather name="users" size={12} color={colors.primary} />
                              <Text style={styles.statText}>{room.order_count}명 주문</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statItem}>
                              <Text style={styles.statTotal}>{room.total_amount.toLocaleString()}원</Text>
                            </View>
                            {!adminMode && (
                              <View style={styles.enterHint}>
                                <Text style={styles.enterText}>입장하기</Text>
                                <Feather name="chevron-right" size={13} color="#c9b8e8" />
                              </View>
                            )}
                          </View>

                          <Text style={styles.roomId}>#{room.room_id.slice(0, 6)}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Pretendard-Bold",
    letterSpacing: 0.06 * 11,
    textTransform: "uppercase",
    color: colors.primary,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    fontFamily: "Pretendard-ExtraBold",
    letterSpacing: -0.5,
    color: colors.foreground,
  },

  adminActions: { flexDirection: "row", gap: 8, alignItems: "center" },
  adminChip: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  adminChipDanger: { backgroundColor: colors.destructive },
  adminChipText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "700",
    fontFamily: "Pretendard-Bold",
  },
  adminExitBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    ...CARD_SHADOW,
  },

  adminEntryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    ...CARD_SHADOW,
  },
  adminEntryText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: "600",
    fontFamily: "Pretendard-SemiBold",
  },

  empty: { alignItems: "center", marginTop: 80, gap: 12 },
  emptyText: { fontSize: 15, color: colors.mutedForeground },

  dateGroup: { marginHorizontal: 16, marginTop: 20 },
  dateLabel: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Pretendard-Bold",
    letterSpacing: 0.05 * 11,
    textTransform: "uppercase",
    color: colors.mutedForeground,
    marginBottom: 10,
  },

  roomCard: {
    backgroundColor: colors.card,
    borderRadius: colors.radius,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    ...CARD_SHADOW,
  },
  roomCardSelected: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },

  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  restaurantName: {
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Pretendard-Bold",
    color: colors.foreground,
    flex: 1,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: "700" },

  cardMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  metaText: { fontSize: 12, color: colors.mutedForeground },

  cardStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
  },
  statItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  statText: { fontSize: 13, fontWeight: "600", color: colors.foreground },
  statTotal: { fontSize: 14, fontWeight: "800", color: colors.primary },
  statDivider: { width: 1, height: 14, backgroundColor: colors.border },
  enterHint: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: "auto" },
  enterText: { fontSize: 12, color: colors.mutedForeground },
  roomId: { fontSize: 11, marginTop: 4, color: colors.mutedForeground },
});
