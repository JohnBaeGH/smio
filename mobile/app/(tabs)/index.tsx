import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import colors from "@/constants/colors";
import { getApiBaseUrl } from "@/utils/api";
import {
  FavoriteRestaurant,
  UserProfile,
  addFavorite,
  getFavorites,
  getProfile,
  removeFavorite,
} from "@/utils/storage";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteRestaurant[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = useCallback(async () => {
    const [p, f] = await Promise.all([getProfile(), getFavorites()]);
    setProfile(p);
    setFavorites(f);
  }, []);

  const handleStart = async (inputUrl?: string) => {
    const target = (inputUrl ?? url).trim();
    if (!target) {
      Alert.alert("알림", "네이버 플레이스 URL을 입력해 주세요.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      if (!res.ok) throw new Error("스크래핑 실패");
      const data = await res.json();

      const roomRes = await fetch(`${getApiBaseUrl()}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurant: data }),
      });
      if (!roomRes.ok) throw new Error("방 생성 실패");
      const room = await roomRes.json();
      setUrl("");
      router.push(`/room/${room.room_id}`);
    } catch (e) {
      Alert.alert("오류", "식당 정보를 불러오지 못했습니다. URL을 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddFavorite = async (name: string, targetUrl: string) => {
    await addFavorite({ name, url: targetUrl });
    const updated = await getFavorites();
    setFavorites(updated);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleRemoveFavorite = (id: string) => {
    Alert.alert("즐겨찾기 삭제", "삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          await removeFavorite(id);
          setFavorites(await getFavorites());
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 헤더 */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={styles.headerTitle}>Smio</Text>
          <Text style={styles.headerSub}>스마트 팀 주문</Text>
        </View>
        {profile && (
          <View style={styles.profileBadge}>
            <Text style={styles.profileText}>{profile.rank} {profile.name}</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* URL 입력 카드 */}
        <View style={[styles.card, styles.inputCard]}>
          <Text style={styles.cardTitle}>새 주문방 만들기</Text>
          <Text style={styles.cardSub}>
            네이버 플레이스 URL 또는 공유 링크를 붙여넣으세요
          </Text>
          <View style={[styles.inputRow, { borderColor: colors.border }]}>
            <Feather name="link" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="naver.me/xxxx 또는 map.naver.com/..."
              placeholderTextColor={colors.mutedForeground}
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {url.length > 0 && (
              <Pressable onPress={() => setUrl("")}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </Pressable>
            )}
          </View>
          <Pressable
            style={[styles.startBtn, loading && { opacity: 0.7 }]}
            onPress={() => handleStart()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Feather name="search" size={18} color="#fff" />
                <Text style={styles.startBtnText}>메뉴 불러오기</Text>
              </>
            )}
          </Pressable>
          {loading && (
            <Text style={[styles.loadingHint, { color: colors.mutedForeground }]}>
              메뉴를 가져오는 중입니다... (10~30초 소요)
            </Text>
          )}
        </View>

        {/* 즐겨찾기 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              즐겨찾기
            </Text>
            <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
              {favorites.length}개
            </Text>
          </View>

          {favorites.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="bookmark" size={32} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                자주 가는 식당을 즐겨찾기에 추가하면{"\n"}다음부터 바로 주문방을 열 수 있어요
              </Text>
            </View>
          ) : (
            favorites.map((fav) => (
              <View
                key={fav.id}
                style={[styles.favCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Pressable
                  style={styles.favMain}
                  onPress={() => handleStart(fav.url)}
                >
                  <View style={[styles.favIcon, { backgroundColor: colors.primaryLight }]}>
                    <Feather name="map-pin" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.favInfo}>
                    <Text style={[styles.favName, { color: colors.foreground }]}>{fav.name}</Text>
                    <Text style={[styles.favUrl, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {fav.url}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </Pressable>
                <Pressable
                  style={styles.favDelete}
                  onPress={() => handleRemoveFavorite(fav.id)}
                >
                  <Feather name="trash-2" size={15} color={colors.destructive} />
                </Pressable>
              </View>
            ))
          )}
        </View>

        {/* 사용법 안내 */}
        <View style={[styles.card, styles.guideCard, { backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.guideTitle, { color: colors.primary }]}>사용 방법</Text>
          {[
            "네이버 지도/플레이스 앱에서 식당 공유",
            "URL 붙여넣고 '메뉴 불러오기' 탭",
            "팀원들에게 주문방 링크 카카오톡 공유",
            "각자 메뉴 선택 → 자동 취합 완료!",
          ].map((step, i) => (
            <View key={i} style={styles.guideStep}>
              <View style={[styles.guideNum, { backgroundColor: colors.primary }]}>
                <Text style={styles.guideNumText}>{i + 1}</Text>
              </View>
              <Text style={[styles.guideStepText, { color: colors.primaryDark }]}>{step}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
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
  headerTitle: { fontSize: 24, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  profileBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  profileText: { fontSize: 13, color: "#fff", fontWeight: "600" },
  scroll: { flex: 1 },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: colors.card,
    borderRadius: colors.radius,
    padding: 20,
  },
  inputCard: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: { fontSize: 17, fontWeight: "700", color: colors.foreground, marginBottom: 4 },
  cardSub: { fontSize: 13, color: colors.mutedForeground, marginBottom: 14, lineHeight: 18 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: colors.radius,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 12,
  },
  input: { flex: 1, fontSize: 14 },
  startBtn: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: colors.radius,
    gap: 8,
  },
  startBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  loadingHint: { fontSize: 12, textAlign: "center", marginTop: 10 },
  section: { marginHorizontal: 16, marginTop: 24 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  sectionCount: { fontSize: 13 },
  emptyCard: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: colors.radius,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  emptyText: { fontSize: 13, textAlign: "center", lineHeight: 20 },
  favCard: {
    borderWidth: 1,
    borderRadius: colors.radius,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  favMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  favIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  favInfo: { flex: 1 },
  favName: { fontSize: 15, fontWeight: "600", marginBottom: 2 },
  favUrl: { fontSize: 12 },
  favDelete: {
    padding: 16,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  guideCard: { marginBottom: 8 },
  guideTitle: { fontSize: 14, fontWeight: "700", marginBottom: 12 },
  guideStep: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  guideNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  guideNumText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  guideStepText: { fontSize: 13, flex: 1 },
});
