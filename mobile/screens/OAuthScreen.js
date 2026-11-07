// screens/OAuthScreen.js
import React, { useRef } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute } from '@react-navigation/native';
import { loginWithOAuth } from '../services/auth';
import { linkYandex, linkVk } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const OAUTH_URLS = {
  yandex: 'https://ironads.ru/auth/yandex',
  vk: 'https://ironads.ru/auth/vk',
};

export default function OAuthScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { provider, mode = 'login' } = route.params || {};
  const webViewRef = useRef(null);
  const { loadUser } = useAuth();
  const processedRef = useRef(false); // Защита от повторного срабатывания

  if (!provider || !OAUTH_URLS[provider]) {
    Alert.alert('Ошибка', 'Некорректный провайдер');
    navigation.goBack();
    return null;
  }

  const handleNavigationStateChange = async (navState) => {
    const { url } = navState;
    console.log(`🔗 OAuth URL (${mode}):`, url);

    if (processedRef.current) return;

    // 1. Проверяем наличие токена (успешный вход)
    const tokenMatch = url.match(/[?&]token=([^&]+)/);
    if (tokenMatch) {
      processedRef.current = true;
      const token = tokenMatch[1];
      console.log('🔑 Получен токен для входа');
      
      // Останавливаем загрузку WebView, чтобы он не ушел на главную
      webViewRef.current?.stopLoading();
      
      try {
        await loginWithOAuth(token);
        await loadUser();
        navigation.pop(2); // Закрываем и OAuthScreen, и AuthScreen
      } catch (err) {
        console.error('Ошибка при OAuth входе:', err);
        Alert.alert('Ошибка', 'Не удалось войти в систему');
        navigation.goBack();
      }
      return;
    }

    // 2. Проверяем успешную привязку соцсети (при редактировании профиля)
    if (url.includes('settings.html?linked=yandex') || url.includes('settings.html?linked=vk')) {
      processedRef.current = true;
      webViewRef.current?.stopLoading();
      Alert.alert('Успех', 'Соцсеть привязана!');
      navigation.goBack();
      return;
    }

    // 3. Обработка ошибок от сервера
    if (url.includes('error=')) {
      processedRef.current = true;
      webViewRef.current?.stopLoading();
      Alert.alert('Ошибка', 'Не удалось выполнить вход через соцсеть.');
      navigation.goBack();
      return;
    }
    
    // Мы НЕ обрабатываем ?code= вручную. Сервер сам обменяет код на токен 
    // и сделает редирект на ?token=...
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <WebView
        ref={webViewRef}
        source={{ uri: OAUTH_URLS[provider] }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.secondaryText }]}>Загрузка...</Text>
          </View>
        )}
        onNavigationStateChange={handleNavigationStateChange}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
      />
      <TouchableOpacity style={[styles.closeButton, { backgroundColor: 'rgba(0,0,0,0.6)' }]} onPress={() => navigation.goBack()}>
        <Text style={styles.closeText}>Закрыть</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 16 },
  closeButton: { position: 'absolute', top: 40, right: 20, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20 },
  closeText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});