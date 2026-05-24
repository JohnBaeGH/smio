import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { getProfile } from "@/utils/storage";

export default function RootLayout() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    getProfile().then((profile) => {
      if (!profile) {
        router.replace("/onboarding");
      }
      setChecked(true);
    });
  }, []);

  if (!checked) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding/index" options={{ presentation: "modal" }} />
        <Stack.Screen name="room/[id]" />
      </Stack>
    </>
  );
}
