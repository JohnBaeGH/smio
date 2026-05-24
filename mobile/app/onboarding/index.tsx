import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import colors from "@/constants/colors";
import { saveProfile } from "@/utils/storage";

const RANKS = ["인턴", "사원", "대리", "과장", "차장", "부장", "이사", "대표"];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [name, setName] = useState("");
  const [rank, setRank] = useState("사원");
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    if (!name.trim()) {
      setError("이름을 입력해 주세요");
      return;
    }
    await saveProfile({ name: name.trim(), rank });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/(tabs)");
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        {/* 상단 로고 */}
        <View style={styles.top}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>S</Text>
          </View>
          <Text style={styles.appName}>Smio</Text>
          <Text style={styles.appSub}>팀 주문을 스마트하게</Text>
        </View>

        {/* 입력 폼 */}
        <View style={styles.form}>
          <Text style={styles.formTitle}>프로필 설정</Text>
          <Text style={styles.formSub}>
            한 번만 설정하면 주문할 때마다 자동으로 입력됩니다
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>이름</Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: error ? colors.destructive : colors.border },
              ]}
              placeholder="홍길동"
              placeholderTextColor={colors.mutedForeground}
              value={name}
              onChangeText={(v) => {
                setName(v);
                setError("");
              }}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>직급</Text>
            <View style={styles.rankGrid}>
              {RANKS.map((r) => (
                <Pressable
                  key={r}
                  style={[
                    styles.rankBtn,
                    {
                      backgroundColor: rank === r ? colors.primary : colors.card,
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
        </View>

        {/* 확인 버튼 */}
        <Pressable style={styles.confirmBtn} onPress={handleConfirm}>
          <Feather name="check-circle" size={20} color="#fff" />
          <Text style={styles.confirmBtnText}>시작하기</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  top: { alignItems: "center", paddingTop: 20 },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  logoText: { fontSize: 36, fontWeight: "800", color: "#fff" },
  appName: { fontSize: 28, fontWeight: "800", color: colors.foreground, letterSpacing: -1 },
  appSub: { fontSize: 15, color: colors.mutedForeground, marginTop: 6 },
  form: {
    backgroundColor: colors.card,
    borderRadius: colors.radius,
    padding: 24,
    gap: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  formTitle: { fontSize: 18, fontWeight: "700", color: colors.foreground },
  formSub: { fontSize: 13, color: colors.mutedForeground, lineHeight: 18, marginTop: -12 },
  fieldGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: "600", color: colors.foreground },
  input: {
    borderWidth: 1.5,
    borderRadius: colors.radius,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  errorText: { fontSize: 12, color: colors.destructive },
  rankGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  rankBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  rankBtnText: { fontSize: 14, fontWeight: "600" },
  confirmBtn: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: colors.radius,
    gap: 10,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmBtnText: { fontSize: 17, fontWeight: "700", color: "#fff" },
});
