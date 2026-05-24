import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";
import {
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
import { UserProfile, getProfile, saveProfile } from "@/utils/storage";

const RANKS = ["인턴", "사원", "대리", "과장", "차장", "부장", "이사", "대표"];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState("");
  const [rank, setRank] = useState("사원");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = useCallback(async () => {
    const p = await getProfile();
    if (p) {
      setProfile(p);
      setName(p.name);
      setRank(p.rank);
    }
  }, []);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("알림", "이름을 입력해 주세요.");
      return;
    }
    await saveProfile({ name: name.trim(), rank });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>설정</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 프로필 */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>내 프로필</Text>
          <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
            주문 시 자동으로 이름과 직급이 입력됩니다
          </Text>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>이름</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
              value={name}
              onChangeText={setName}
              placeholder="홍길동"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>직급</Text>
            <View style={styles.rankGrid}>
              {RANKS.map((r) => (
                <Pressable
                  key={r}
                  style={[
                    styles.rankBtn,
                    {
                      backgroundColor: rank === r ? colors.primary : colors.background,
                      borderColor: rank === r ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => {
                    setRank(r);
                    Haptics.selectionAsync();
                  }}
                >
                  <Text
                    style={[
                      styles.rankBtnText,
                      { color: rank === r ? "#fff" : colors.foreground },
                    ]}
                  >
                    {r}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable
            style={[styles.saveBtn, { backgroundColor: saved ? colors.success : colors.primary }]}
            onPress={handleSave}
          >
            <Feather name={saved ? "check" : "save"} size={16} color="#fff" />
            <Text style={styles.saveBtnText}>{saved ? "저장됨!" : "저장하기"}</Text>
          </Pressable>
        </View>

        {/* 앱 정보 */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>앱 정보</Text>
          {[
            { label: "버전", value: "1.0.0" },
            { label: "개발", value: "Smio Team" },
          ].map((item) => (
            <View key={item.label} style={[styles.infoRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>{item.value}</Text>
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
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#fff" },
  section: {
    borderRadius: colors.radius,
    padding: 20,
    marginBottom: 16,
    gap: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  sectionSub: { fontSize: 13, lineHeight: 18, marginTop: -4 },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600" },
  input: {
    borderWidth: 1.5,
    borderRadius: colors.radius,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  rankGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  rankBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  rankBtnText: { fontSize: 13, fontWeight: "600" },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: colors.radius,
    gap: 8,
    marginTop: 4,
  },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: "500" },
});
