import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const api = axios.create({
  baseURL: 'https://ironads.ru/api',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Перехватчик запроса – добавляем токен
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('jwtToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log(`✅ Токен добавлен в запрос: ${config.url}`);
    } else {
      // Не логируем как ошибку – это нормально до авторизации
      console.log(`ℹ️ Запрос без токена: ${config.url}`);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Перехватчик ответа – обрабатываем 401 и 403
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response) {
      const status = error.response.status;
      if (status === 401 || status === 403) {
        // Проверяем, был ли токен. Если нет – это нормально (запрос до логина).
        const token = await AsyncStorage.getItem('jwtToken');
        if (token) {
          console.warn(`⚠️ Ошибка авторизации (${status}), выполняем выход`);
          await AsyncStorage.removeItem('jwtToken');
          await AsyncStorage.removeItem('user');
          delete api.defaults.headers.common.Authorization;
        } else {
          console.log(`ℹ️ ${status} без токена (до авторизации): ${error.config?.url}`);
        }
      }
    }
    return Promise.reject(error);
  }
);

// === Избранное ===
export const toggleFavorite = async (listingId) => {
  const response = await api.post('/listings/favorites/toggle', { listing_id: listingId });
  return response.data;
};

export const getFavorites = async () => {
  const response = await api.get('/listings/favorites/my');
  return response.data;
};

export const checkFavorite = async (listingId) => {
  const response = await api.get(`/listings/favorites/check/${listingId}`);
  return response.data;
};

// === Создание объявления ===
export const createListing = async (formData, config = {}) => {
  const response = await api.post('/listings', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    ...config,
  });
  return response.data;
};

// === Привязка социальных сетей ===
export const linkYandex = async (code) => {
  const response = await api.post('/auth/yandex/link', { code });
  return response.data;
};

export const linkVk = async (code) => {
  const response = await api.post('/auth/vk/link', { code });
  return response.data;
};

export const unlinkSocial = async (provider) => {
  const response = await api.delete(`/auth/${provider}/unlink`);
  return response.data;
};

// === Чаты ===
export const getChats = async () => {
  const response = await api.get('/chats');
  return response.data;
};

export const getMessages = async (chatId, page = 1, limit = 50) => {
  const response = await api.get(`/chats/${chatId}/messages?page=${page}&limit=${limit}`);
  return response.data;
};

export const sendMessage = async (chatId, text) => {
  const response = await api.post(`/chats/${chatId}/messages`, { message: text });
  return response.data;
};

export const createChat = async (listingId) => {
  const response = await api.post('/chats/create', { listing_id: listingId });
  return response.data;
};

export const markAsRead = async (chatId) => {
  const response = await api.post(`/chats/${chatId}/read`);
  return response.data;
};

export const getUnreadCount = async () => {
  const response = await api.get('/chats/unread/count');
  return response.data;
};

// === Push-токены ===
export const registerPushToken = async (token, device_os = 'android') => {
  const response = await api.post('/users/push-token', { token, device_os });
  return response.data;
};

export const unregisterPushToken = async (token) => {
  const response = await api.delete('/users/push-token', { data: { token } });
  return response.data;
};

// ==================== ПОДПИСКИ ====================
export const getMySubscriptions = async () => {
  const response = await api.get('/subscriptions/my');
  return response.data;
};

export const getSubscription = async (subscriptionId) => {
  const response = await api.get(`/subscriptions/${subscriptionId}`);
  return response.data;
};

export const getPlans = async () => {
  const response = await api.get('/subscriptions/plans');
  return response.data;
};

export const purchasePlan = async (planId) => {
  const response = await api.post('/subscriptions/purchase', { planId });
  return response.data;
};

export const cancelSubscription = async (subscriptionId) => {
  const response = await api.post(`/subscriptions/${subscriptionId}/cancel`);
  return response.data;
};

export const getSubscriptionListings = async (subscriptionId) => {
  const response = await api.get(`/subscriptions/${subscriptionId}/listings`);
  return response.data;
};

export const addListingToPackage = async (subscriptionId, listingId) => {
  const response = await api.post(`/subscriptions/${subscriptionId}/listings`, { listingId });
  return response.data;
};

export const removeListingFromPackage = async (subscriptionId, listingId) => {
  const response = await api.delete(`/subscriptions/${subscriptionId}/listings/${listingId}`);
  return response.data;
};

export const renewSubscription = async (subscriptionId, listingIds) => {
  const response = await api.post(`/subscriptions/${subscriptionId}/renew`, { listingIds });
  return response.data;
};
// ==================================================

export default api;