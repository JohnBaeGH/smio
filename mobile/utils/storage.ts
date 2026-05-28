import AsyncStorage from "@react-native-async-storage/async-storage";

const PROFILE_KEY = "smio_profile";
const FAVORITES_KEY = "smio_favorites";
const DEVICE_ID_KEY = "smio_device_id";

function generateDeviceId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function getOrCreateDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = generateDeviceId();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export interface UserProfile {
  name: string;
  rank?: string;
}

export interface FavoriteRestaurant {
  id: string;
  name: string;
  url: string;
  savedAt: string;
  pinned?: boolean;
}

const PINNED_FAVORITES: FavoriteRestaurant[] = [
  {
    id: "pinned_mammoth",
    name: "매머드익스프레스 동탄AP점",
    url: "https://m.place.naver.com/restaurant/1154641069/menu/list?entry=plt",
    savedAt: "2026-01-01T00:00:00.000Z",
    pinned: true,
  },
];

export async function getProfile(): Promise<UserProfile | null> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export async function getFavorites(): Promise<FavoriteRestaurant[]> {
  const raw = await AsyncStorage.getItem(FAVORITES_KEY);
  const userFavs: FavoriteRestaurant[] = raw ? JSON.parse(raw) : [];
  // 고정 즐겨찾기는 항상 맨 위에, 사용자 목록에서 중복 제거
  const pinnedIds = new Set(PINNED_FAVORITES.map((p) => p.id));
  const filtered = userFavs.filter((f) => !pinnedIds.has(f.id));
  return [...PINNED_FAVORITES, ...filtered];
}

export async function addFavorite(restaurant: Omit<FavoriteRestaurant, "id" | "savedAt">): Promise<void> {
  const favorites = await getFavorites();
  const newFav: FavoriteRestaurant = {
    ...restaurant,
    id: Math.random().toString(36).substring(2, 10),
    savedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify([newFav, ...favorites]));
}

export async function removeFavorite(id: string): Promise<void> {
  const favorites = await getFavorites();
  await AsyncStorage.setItem(
    FAVORITES_KEY,
    JSON.stringify(favorites.filter((f) => f.id !== id))
  );
}

const ADMIN_PIN_KEY = "smio_admin_pin";

export async function getAdminPin(): Promise<string | null> {
  return AsyncStorage.getItem(ADMIN_PIN_KEY);
}

export async function saveAdminPin(pin: string): Promise<void> {
  await AsyncStorage.setItem(ADMIN_PIN_KEY, pin);
}

export async function clearAdminPin(): Promise<void> {
  await AsyncStorage.removeItem(ADMIN_PIN_KEY);
}
