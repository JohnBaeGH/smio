import { useFonts } from "expo-font";
import { Stack, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { getProfile } from "@/utils/storage";

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  const [fontsLoaded] = useFonts({
    "Pretendard-Regular": require("../assets/fonts/Pretendard-Regular.otf"),
    "Pretendard-Medium": require("../assets/fonts/Pretendard-Medium.otf"),
    "Pretendard-SemiBold": require("../assets/fonts/Pretendard-SemiBold.otf"),
    "Pretendard-Bold": require("../assets/fonts/Pretendard-Bold.otf"),
    "Pretendard-ExtraBold": require("../assets/fonts/Pretendard-ExtraBold.otf"),
    "Pretendard-Black": require("../assets/fonts/Pretendard-Black.otf"),
  });

  useEffect(() => {
    if (!fontsLoaded) return;
    getProfile().then((profile) => {
      if (!profile) {
        // 공유 링크로 방에 접근한 경우 redirect 파라미터로 전달
        const isRoom = pathname.startsWith("/room/");
        if (isRoom) {
          router.replace(`/onboarding?redirect=${encodeURIComponent(pathname)}`);
        } else {
          router.replace("/onboarding");
        }
      }
      setChecked(true);
    });
  }, [fontsLoaded]);

  if (!checked || !fontsLoaded) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding/index" options={{ presentation: "modal" }} />
      </Stack>
    </>
  );
}
