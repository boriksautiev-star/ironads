// utils/imageCache.js
import * as FileSystem from 'expo-file-system/legacy'; // 👈 важно!

const CACHE_DIR = FileSystem.cacheDirectory + 'images/';

const ensureCacheDir = async () => {
  const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
};

export const getCachedUri = async (remoteUrl) => {
  if (!remoteUrl) return null;
  await ensureCacheDir();
  const filename = remoteUrl.replace(/[^a-zA-Z0-9]/g, '_');
  const localUri = CACHE_DIR + filename;

  try {
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    if (fileInfo.exists) {
      return localUri;
    }
    const downloadRes = await FileSystem.downloadAsync(remoteUrl, localUri);
    if (downloadRes.status === 200) {
      return downloadRes.uri;
    } else {
      return remoteUrl;
    }
  } catch (error) {
    console.warn('⚠️ Ошибка кэширования:', error);
    return remoteUrl;
  }
};