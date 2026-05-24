import AsyncStorage from "@react-native-async-storage/async-storage";

const PROFILE_KEY = "smio_profile";
const FAVORITES_KEY = "smio_favorites";

export interface UserProfile {
  name: string;
  rank: string; // 직급
}

export interface FavoriteRestaurant {
  id: string;
  name: string;
  url: string;
  savedAt: string;
}

export async function getProfile(): Promise<UserProfile | null> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export async function getFavorites(): Promise<FavoriteRestaurant[]> {
  const raw = await AsyncStorage.getItem(FAVORITES_KEY);
  return raw ? JSON.parse(raw) : [];
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
