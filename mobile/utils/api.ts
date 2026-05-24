import { Platform } from "react-native";

export function getApiBaseUrl(): string {
  if (Platform.OS === "web") {
    return "/api";
  }
  // 개발 시: 로컬 서버 주소
  // 운영 시: 실제 도메인으로 변경
  return "https://smio2.johnbae.co.kr/api";
}
