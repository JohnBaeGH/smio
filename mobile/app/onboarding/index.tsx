import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Image,
  Keyboard,
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

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const handleConfirm = async () => {
    if (!name.trim()) {
      setError("이름을 입력해 주세요");
      return;
    }
    await saveProfile({ name: name.trim() });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace((redirect as any) ?? "/(tabs)");
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.container}>
        {/* 키보드 열릴 때 이미지 숨김 */}
        {!keyboardVisible && (
          <View style={styles.heroWrap}>
            <Image
              source={require("../../assets/images/onboarding.png")}
              style={styles.heroImage}
              resizeMode="cover"
            />
          </View>
        )}

        {/* 하단 시트 */}
        <View style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 24 },
          keyboardVisible && styles.sheetKeyboard,
        ]}>
          <View style={styles.formArea}>
            <Text style={styles.formTitle}>시작하기 전에</Text>
            <Text style={styles.formSub}>팀원들이 볼 내 이름을 알려주세요</Text>

            <TextInput
              style={[styles.input, error ? styles.inputError : null]}
              placeholder="예) 김지훈"
              placeholderTextColor="#b0a0c8"
              value={name}
              onChangeText={(v) => {
                setName(v);
                setError("");
              }}
              maxLength={20}
            />
            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : (
              <Text style={styles.inputHint}>주문 시 이 이름으로 표시됩니다</Text>
            )}
          </View>

          <Pressable
            style={[styles.confirmBtn, !name.trim() && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!name.trim()}
          >
            <Text style={styles.confirmBtnText}>팀 주문 시작하기</Text>
            <Feather name="arrow-right" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  heroWrap: {
    flex: 1,
    width: "100%",
    overflow: "hidden",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },

  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -28,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 40,
    gap: 20,
    shadowColor: colors.shadowColor,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 12,
  },
  sheetKeyboard: {
    flex: 1,
    marginTop: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },

  formArea: { gap: 10 },
  formTitle: {
    fontSize: 22,
    fontWeight: "800",
    fontFamily: "Pretendard-ExtraBold",
    color: colors.foreground,
    letterSpacing: -0.5,
  },
  formSub: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginBottom: 4,
  },

  input: {
    height: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  inputError: { borderColor: colors.destructive },
  inputHint: { fontSize: 12, color: colors.mutedForeground },
  errorText: { fontSize: 12, color: colors.destructive },

  confirmBtn: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 17,
    borderRadius: 16,
    gap: 10,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 6,
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: {
    fontSize: 17,
    fontWeight: "700",
    fontFamily: "Pretendard-Bold",
    color: "#fff",
  },
});
