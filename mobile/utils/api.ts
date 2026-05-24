// EXPO_PUBLIC_API_URL 환경변수로 주입, 없으면 프로덕션 사용
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://smio-mobile.johnbae.co.kr/api";

export function getApiBaseUrl(): string {
  return API_URL;
}
