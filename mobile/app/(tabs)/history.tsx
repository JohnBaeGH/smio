import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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

interface LogEntry {
  timestamp: string;
  room_id: string;
  restaurant_name: string;
  order: {
    user_name: string;
    menu: string;
    quantity: number;
    price: number;
  };
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/logs`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
      }
    } catch {
      // 로그 없음
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, []);

  const grouped = logs.reduce<Record<string, LogEntry[]>>((acc, log) => {
    const date = log.timestamp?.slice(0, 10) ?? "날짜 없음";
    if (!acc[date]) acc[date] = [];
    acc[date].push(log);
    return acc;
  }, {});

  const totalToday = logs.filter(
    (l) => l.timestamp?.slice(0, 10) === new Date().toISOString().slice(0, 10)
  ).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>주문 히스토리</Text>
        <View style={styles.todayBadge}>
          <Text style={styles.todayText}>오늘 {totalToday}건</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchLogs();
              }}
              tintColor={colors.primary}
            />
          }
        >
          {Object.keys(grouped).length === 0 ? (
            <View style={styles.empty}>
              <Feather name="inbox" size={48} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                아직 주문 기록이 없습니다
              </Text>
            </View>
          ) : (
            Object.entries(grouped)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([date, entries]) => (
                <View key={date} style={styles.dateGroup}>
                  <Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>{date}</Text>
                  {entries.map((log, i) => (
                    <View
                      key={i}
                      style={[styles.logCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    >
                      <View style={styles.logTop}>
                        <Text style={[styles.restaurantName, { color: colors.primary }]}>
                          {log.restaurant_name}
                        </Text>
                        <Text style={[styles.logTime, { color: colors.mutedForeground }]}>
                          {log.timestamp?.slice(11, 16)}
                        </Text>
                      </View>
                      <View style={styles.logRow}>
                        <Feather name="user" size={13} color={colors.mutedForeground} />
                        <Text style={[styles.logText, { color: colors.foreground }]}>
                          {log.order.user_name}
                        </Text>
                        <Text style={[styles.logMenuText, { color: colors.foreground }]}>
                          {log.order.menu} × {log.order.quantity}
                        </Text>
                        <Text style={[styles.logPrice, { color: colors.primary }]}>
                          {(log.order.price * log.order.quantity).toLocaleString()}원
                        </Text>
                      </View>
                    </View>
                  ))}
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
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#fff" },
  todayBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  todayText: { fontSize: 13, color: "#fff", fontWeight: "600" },
  empty: { alignItems: "center", marginTop: 80, gap: 12 },
  emptyText: { fontSize: 15 },
  dateGroup: { marginHorizontal: 16, marginTop: 20 },
  dateLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  logCard: {
    borderWidth: 1,
    borderRadius: colors.radius,
    padding: 14,
    marginBottom: 8,
    gap: 8,
  },
  logTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  restaurantName: { fontSize: 14, fontWeight: "700" },
  logTime: { fontSize: 12 },
  logRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  logText: { fontSize: 13, fontWeight: "600" },
  logMenuText: { fontSize: 13, flex: 1 },
  logPrice: { fontSize: 13, fontWeight: "700" },
});
