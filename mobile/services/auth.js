import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { unregisterPushToken } from './api';

const API_BASE_URL = 'https://ironads.ru/api';

// === Регистрация ===
export const register = async (username, email, password, phone = '') => {
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/register`, {
      username,
      email,
      password,
      phone,
    });
    const { token, user } = response.data;
    if (token) {
      await AsyncStorage.setItem('jwtToken', token);
      await AsyncStorage.setItem('user', JSON.stringify(user));
    }
    return { token, user };
  } catch (error) {
    throw error.response?.data?.error || 'Ошибка регистрации';
  }
};

// === Вход ===
export const login = async (username, password) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      username,
      password,
    });
    const { token, user } = response.data;
    if (token) {
      await AsyncStorage.setItem('jwtToken', token);
      await AsyncStorage.setItem('user', JSON.stringify(user));
      console.log('✅ Токен сохранён при входе');
    }
    return { token, user };
  } catch (error) {
    throw error.response?.data?.error || 'Ошибка входа';
  }
};

// === Выход (с удалением push-токена) ===
export const logout = async () => {
  try {
    // 1. Удаляем push-токен на сервере
    const token = await AsyncStorage.getItem('pushToken');
    if (token) {
      try {
        await unregisterPushToken(token);
      } catch (e) {
        console.warn('Не удалось удалить push-токен на сервере:', e.message);
      }
      await AsyncStorage.removeItem('pushToken');
    }
    // 2. Очищаем данные пользователя
    await AsyncStorage.removeItem('jwtToken');
    await AsyncStorage.removeItem('user');
    console.log('✅ Выход выполнен, данные очищены');
  } catch (error) {
    console.error('Ошибка при выходе:', error);
  }
};

// === Получение текущего пользователя ===
export const getCurrentUser = async () => {
  try {
    const userJson = await AsyncStorage.getItem('user');
    return userJson ? JSON.parse(userJson) : null;
  } catch {
    return null;
  }
};

// === Получение токена ===
export const getToken = async () => {
  return await AsyncStorage.getItem('jwtToken');
};

// === Проверка авторизации ===
export const isAuthenticated = async () => {
  const token = await getToken();
  return !!token;
};

// === OAuth вход ===
export const loginWithOAuth = async (token) => {
  if (!token) throw new Error('Токен не получен');

  await AsyncStorage.setItem('jwtToken', token);

  try {
    const response = await axios.get(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await AsyncStorage.setItem('user', JSON.stringify(response.data));
    console.log('✅ OAuth вход выполнен, токен сохранён');
  } catch (error) {
    await AsyncStorage.setItem('user', JSON.stringify({ username: 'Пользователь' }));
    throw error;
  }
};