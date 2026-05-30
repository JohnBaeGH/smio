import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Updates from "expo-updates";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import colors from "@/constants/colors";
import { UserProfile, getAdminPin, clearAdminPin, saveAdminPin, getProfile, saveProfile } from "@/utils/storage";

const CARD_SHADOW = {
  shadowColor: colors.shadowColor,
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.07,
  shadowRadius: 16,
  elevation: 3,
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [currentPin, setCurrentPin] = useState<string | null>(null);
  const [pinSaved, setPinSaved] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "downloading" | "up-to-date" | "error">("idle");
  const versionTapCount = useRef(0);
  const versionTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadProfile();
    getAdminPin().then(setCurrentPin);
  }, []);

  const loadProfile = useCallback(async () => {
    const p = await getProfile();
    if (p) {
      setProfile(p);
      setName(p.name);
    }
  }, []);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("알림", "이름을 입력해 주세요.");
      return;
    }
    await saveProfile({ name: name.trim() });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSavePin = async () => {
    if (adminPin.length !== 4 || !/^\d{4}$/.test(adminPin)) {
      Alert.alert("알림", "4자리 숫자 PIN을 입력해 주세요.");
      return;
    }
    await saveAdminPin(adminPin);
    setCurrentPin(adminPin);
    setAdminPin("");
    setPinSaved(true);
    setTimeout(() => setPinSaved(false), 2000);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleClearPin = async () => {
    await clearAdminPin();
    setCurrentPin(null);
    setAdminPin("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleCheckUpdate = async () => {
    if (Platform.OS === "web") {
      Alert.alert("알림", "웹 버전은 자동으로 최신 상태를 유지합니다.");
      return;
    }
    setUpdateStatus("checking");
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        setUpdateStatus("up-to-date");
        setTimeout(() => setUpdateStatus("idle"), 3000);
        return;
      }
      setUpdateStatus("downloading");
      await Updates.fetchUpdateAsync();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "업데이트 완료",
        "새 버전이 준비됐습니다. 지금 재시작할까요?",
        [
          { text: "나중에", onPress: () => setUpdateStatus("idle") },
          { text: "재시작", onPress: () => Updates.reloadAsync() },
        ]
      );
    } catch {
      setUpdateStatus("error");
      setTimeout(() => setUpdateStatus("idle"), 3000);
    }
  };

  const handleVersionTap = () => {
    versionTapCount.current += 1;
    if (versionTapTimer.current) clearTimeout(versionTapTimer.current);
    if (versionTapCount.current >= 5) {
      versionTapCount.current = 0;
      setShowAdmin(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      versionTapTimer.current = setTimeout(() => { versionTapCount.current = 0; }, 2000);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.eyebrow}>내 계정</Text>
        <Text style={styles.headerTitle}>설정</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 프로필 카드 */}
        <View style={styles.profileCard}>
          <View style={styles.profileCardTop}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{name ? name.charAt(0) : "?"}</Text>
            </View>
            <View style={styles.profileCardInfo}>
              <Text style={styles.profileCardName}>{name || "이름 없음"}</Text>
              <Text style={styles.profileCardSub}>주문 시 자동으로 이름이 입력됩니다</Text>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>이름</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="홍길동"
              placeholderTextColor="#b0a0c8"
            />
          </View>

          <Pressable
            style={[styles.saveBtn, saved && styles.saveBtnDone]}
            onPress={handleSave}
          >
            <Feather name={saved ? "check" : "save"} size={16} color="#fff" />
            <Text style={styles.saveBtnText}>{saved ? "저장됨!" : "저장하기"}</Text>
          </Pressable>
        </View>

        {/* 앱 정보 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>앱 정보</Text>
          <Pressable onPress={handleVersionTap} style={styles.infoRow}>
            <Text style={styles.infoLabel}>버전</Text>
            <Text style={styles.infoValue}>1.2.0</Text>
          </Pressable>
          <View style={[styles.infoRow, styles.infoRowLast]}>
            <Text style={styles.infoLabel}>개발</Text>
            <Text style={styles.infoValue}>John.B</Text>
          </View>
          <Pressable
            style={[styles.updateBtn, updateStatus === "up-to-date" && styles.updateBtnDone, updateStatus === "error" && styles.updateBtnError]}
            onPress={handleCheckUpdate}
            disabled={updateStatus === "checking" || updateStatus === "downloading"}
          >
            <Feather
              name={updateStatus === "up-to-date" ? "check" : updateStatus === "error" ? "alert-circle" : "refresh-cw"}
              size={15}
              color={updateStatus === "up-to-date" || updateStatus === "error" ? "#fff" : colors.primary}
            />
            <Text style={[styles.updateBtnText, (updateStatus === "up-to-date" || updateStatus === "error") && { color: "#fff" }]}>
              {updateStatus === "checking" ? "확인 중..."
                : updateStatus === "downloading" ? "다운로드 중..."
                : updateStatus === "up-to-date" ? "최신 버전입니다"
                : updateStatus === "error" ? "확인 실패"
                : "업데이트 확인"}
            </Text>
          </Pressable>
        </View>

        {/* 관리자 설정 — 버전 5회 탭으로 노출 */}
        {showAdmin && (
          <View style={styles.section}>
            <View style={styles.adminHeader}>
              <Feather name="shield" size={15} color={colors.primary} />
              <Text style={styles.sectionTitle}>관리자 설정</Text>
              <Pressable onPress={() => setShowAdmin(false)} style={{ marginLeft: "auto" }}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <Text style={styles.sectionSub}>히스토리 삭제에 사용할 4자리 PIN을 설정하세요</Text>

            {currentPin ? (
              <View style={styles.pinStatus}>
                <Feather name="check-circle" size={15} color="#16a34a" />
                <Text style={styles.pinStatusText}>PIN 설정됨</Text>
                <Pressable style={styles.pinClearBtn} onPress={handleClearPin}>
                  <Text style={styles.pinClearText}>해제</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.label}>새 PIN (4자리 숫자)</Text>
              <TextInput
                style={styles.input}
                value={adminPin}
                onChangeText={(t) => setAdminPin(t.replace(/\D/g, "").slice(0, 4))}
                placeholder="0000"
                placeholderTextColor="#b0a0c8"
                keyboardType="numeric"
                secureTextEntry
                maxLength={4}
              />
            </View>

            <Pressable
              style={[styles.saveBtn, pinSaved && styles.saveBtnDone]}
              onPress={handleSavePin}
            >
              <Feather name={pinSaved ? "check" : "lock"} size={16} color="#fff" />
              <Text style={styles.saveBtnText}>{pinSaved ? "저장됨!" : "PIN 저장"}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
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

  profileCard: {
    backgroundColor: colors.card,
    borderRadius: colors.radius,
    padding: 20,
    marginBottom: 16,
    gap: 16,
    shadowColor: colors.shadowColor,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  profileCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    fontFamily: "Pretendard-Bold",
  },
  profileCardInfo: { flex: 1 },
  profileCardName: {
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "Pretendard-Bold",
    color: colors.foreground,
    marginBottom: 3,
  },
  profileCardSub: {
    fontSize: 12,
    color: colors.mutedForeground,
    lineHeight: 17,
  },

  section: {
    backgroundColor: colors.card,
    borderRadius: colors.radius,
    padding: 20,
    marginBottom: 16,
    gap: 12,
    shadowColor: colors.shadowColor,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Pretendard-Bold",
    color: colors.foreground,
  },
  sectionSub: { fontSize: 13, lineHeight: 18, color: colors.mutedForeground, marginTop: -4 },

  field: { gap: 7 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Pretendard-SemiBold",
    color: colors.foreground,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.foreground,
    backgroundColor: colors.background,
  },

  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    backgroundColor: colors.primary,
    marginTop: 4,
  },
  saveBtnDone: { backgroundColor: colors.success },
  saveBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Pretendard-Bold",
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  infoRowLast: {},
  infoLabel: { fontSize: 14, color: colors.mutedForeground },
  infoValue: { fontSize: 14, fontWeight: "500", color: colors.foreground },

  updateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
    marginTop: 4,
  },
  updateBtnDone: { backgroundColor: colors.success, borderColor: colors.success },
  updateBtnError: { backgroundColor: colors.destructive, borderColor: colors.destructive },
  updateBtnText: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Pretendard-SemiBold",
    color: colors.primary,
  },

  adminHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  pinStatus: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  pinStatusText: { fontSize: 14, fontWeight: "600", color: "#16a34a", flex: 1 },
  pinClearBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  pinClearText: { fontSize: 13, fontWeight: "700", color: colors.destructive },
});
