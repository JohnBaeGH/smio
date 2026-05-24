import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
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

  const loadData = useCallback(async () => {
    const [p, f] = await Promise.all([getProfile(), getFavorites()]);
    setProfile(p);
    setFavorites(f);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

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
      Alert.alert("오류", "상점 정보를 불러오지 못했습니다. URL을 확인해 주세요.");
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

  const handleRemoveFavorite = async (id: string) => {
    await removeFavorite(id);
    setFavorites(await getFavorites());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 헤더 — lavender canvas, no colored bar */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View>
          <Text style={styles.eyebrow}>SMIO</Text>
          <Text style={styles.headerTitle}>팀 주문을{"\n"}스마트하게</Text>
        </View>
        {profile && (
          <View style={styles.profileBadge}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>{profile.name.charAt(0)}</Text>
            </View>
            <Text style={styles.profileText}>{profile.name}</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* URL 입력 카드 */}
        <View style={styles.inputCard}>
          <Text style={styles.cardTitle}>새 주문방 만들기</Text>
          <Text style={styles.cardSub}>
            네이버 플레이스 URL을 붙여넣으세요
          </Text>
          <View style={styles.inputRow}>
            <Feather name="link" size={16} color={colors.mutedForeground} />
            <TextInput
              style={styles.input}
              placeholder="naver.me/xxxx 또는 map.naver.com/..."
              placeholderTextColor="#b0a0c8"
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
            <Text style={styles.loadingHint}>
              메뉴를 가져오는 중입니다... (10~30초 소요)
            </Text>
          )}
        </View>

        {/* 즐겨찾기 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>즐겨찾기</Text>
            <Text style={styles.sectionCount}>{favorites.length}개</Text>
          </View>

          {favorites.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather name="bookmark" size={28} color="#c9b8e8" />
              <Text style={styles.emptyText}>
                자주 가는 상점을 즐겨찾기에 추가하면{"\n"}다음부터 바로 주문방을 열 수 있어요
              </Text>
            </View>
          ) : (
            favorites.map((fav) => (
              <View key={fav.id} style={styles.favCard}>
                <Pressable
                  style={styles.favMain}
                  onPress={() => handleStart(fav.url)}
                >
                  <View style={styles.favIcon}>
                    <Feather name="map-pin" size={17} color={colors.primary} />
                  </View>
                  <View style={styles.favInfo}>
                    <Text style={styles.favName}>{fav.name}</Text>
                    <Text style={styles.favUrl} numberOfLines={1}>
                      {fav.url}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={17} color="#c9b8e8" />
                </Pressable>
                <Pressable
                  style={styles.favDelete}
                  onPress={() => handleRemoveFavorite(fav.id)}
                >
                  <Feather name="trash-2" size={14} color={colors.destructive} />
                </Pressable>
              </View>
            ))
          )}
        </View>

        {/* 사용법 */}
        <View style={styles.guideCard}>
          <Text style={styles.guideTitleText}>사용 방법</Text>
          {[
            "네이버 지도 앱에서 상점 공유",
            "URL 붙여넣고 '메뉴 불러오기' 탭",
            "팀원들에게 주문방 링크 공유",
            "각자 메뉴 선택 → 자동 취합!",
          ].map((step, i) => (
            <View key={i} style={styles.guideStep}>
              <View style={styles.guideNum}>
                <Text style={styles.guideNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.guideStepText}>{step}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const CARD_SHADOW = {
  shadowColor: colors.shadowColor,
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 4,
};

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Pretendard-Bold",
    letterSpacing: 0.06 * 11,
    color: colors.primary,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    fontFamily: "Pretendard-ExtraBold",
    letterSpacing: -0.6,
    color: colors.foreground,
    lineHeight: 34,
  },
  profileBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    ...CARD_SHADOW,
  },
  profileAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "Pretendard-Bold",
  },
  profileText: {
    fontSize: 14,
    color: colors.foreground,
    fontWeight: "600",
    fontFamily: "Pretendard-SemiBold",
  },

  scroll: { flex: 1 },

  inputCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: colors.card,
    borderRadius: colors.radius,
    padding: 20,
    ...CARD_SHADOW,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    fontFamily: "Pretendard-Bold",
    color: colors.foreground,
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginBottom: 14,
    lineHeight: 18,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 12,
    backgroundColor: colors.background,
  },
  input: { flex: 1, fontSize: 14, color: colors.foreground },
  startBtn: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 12,
    gap: 8,
  },
  startBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Pretendard-Bold",
  },
  loadingHint: { fontSize: 12, textAlign: "center", marginTop: 10, color: colors.mutedForeground },

  section: { marginHorizontal: 16, marginTop: 24 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Pretendard-Bold",
    letterSpacing: 0.06 * 11,
    textTransform: "uppercase",
    color: colors.mutedForeground,
  },
  sectionCount: { fontSize: 12, color: colors.mutedForeground },

  emptyCard: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: colors.radius,
    padding: 24,
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  emptyText: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    color: colors.mutedForeground,
  },

  favCard: {
    backgroundColor: colors.card,
    borderRadius: colors.radius,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    ...CARD_SHADOW,
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
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  favInfo: { flex: 1 },
  favName: {
    fontSize: 15,
    fontWeight: "600",
    fontFamily: "Pretendard-SemiBold",
    color: colors.foreground,
    marginBottom: 2,
  },
  favUrl: { fontSize: 12, color: colors.mutedForeground },
  favDelete: {
    padding: 16,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },

  guideCard: {
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 8,
    backgroundColor: colors.primaryLight,
    borderRadius: colors.radius,
    padding: 18,
    gap: 0,
  },
  guideTitleText: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "Pretendard-Bold",
    color: colors.primary,
    marginBottom: 12,
  },
  guideStep: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  guideNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  guideNumText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  guideStepText: { fontSize: 13, flex: 1, color: colors.primaryDark },
});
