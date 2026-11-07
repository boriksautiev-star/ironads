// App.js (финальная версия)
import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, View, Platform, StatusBar } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import AppNavigator from './navigation';
import { registerPushToken, getUnreadCount } from './services/api';
import { CachedListingsProvider } from './context/CachedListingsContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { AlertProvider } from './context/AlertContext';
import { UnreadCountProvider } from './context/UnreadCountContext';

const isDev = __DEV__;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const updateBadge = async () => {
  if (isDev) return;
  try {
    const data = await getUnreadCount();
    const count = data.count || 0;
    await Notifications.setBadgeCountAsync(count);
    console.log(`🔴 Badge обновлён: ${count}`);
  } catch (error) {
    console.error('Ошибка обновления badge:', error);
  }
};

function AppContent() {
  const { user, loading, loadUser } = useAuth();
  const navigationRef = useRef();

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) {
      if (!isDev) {
        registerForPushNotifications();
        updateBadge();
      } else {
        console.log('ℹ️ DEV режим: push-уведомления и badge отключены');
      }
    }
  }, [user]);

  const registerForPushNotifications = async () => {
    if (isDev) return;
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('Permission for notifications not granted');
        return;
      }
      const tokenData = await Notifications.getExpoPushTokenAsync();
      const token = tokenData.data;
      console.log('Expo push token:', token);
      const deviceOs = Platform.OS === 'ios' ? 'ios' : 'android';
      await registerPushToken(token, deviceOs);
      await AsyncStorage.setItem('pushToken', token);
    } catch (error) {
      console.error('Error registering push token:', error);
    }
  };

  const handleNotificationResponse = async (response) => {
    const data = response.notification.request.content.data;
    if (data?.chatId) {
      navigationRef.current?.navigate('ChatDetail', { chatId: Number(data.chatId) });
      await Notifications.setBadgeCountAsync(0);
    } else if (data?.listingId) {
      navigationRef.current?.navigate('ListingDetail', { id: Number(data.listingId) });
    }
  };

  useEffect(() => {
    if (isDev) return;

    const responseListener = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    const tokenListener = Notifications.addPushTokenListener(async (token) => {
      const user = await getCurrentUser();
      if (user) {
        const deviceOs = Platform.OS === 'ios' ? 'ios' : 'android';
        await registerPushToken(token.data, deviceOs);
        await AsyncStorage.setItem('pushToken', token.data);
      }
    });
    const receivedListener = Notifications.addNotificationReceivedListener(async () => {
      await updateBadge();
    });
    const getInitialNotification = async () => {
      const response = await Notifications.getLastNotificationResponseAsync();
      if (response) handleNotificationResponse(response);
    };
    getInitialNotification();

    return () => {
      responseListener.remove();
      tokenListener.remove();
      receivedListener.remove();
    };
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <NavigationContainer ref={navigationRef}>
        <UnreadCountProvider>
          <AppNavigator />
        </UnreadCountProvider>
      </NavigationContainer>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ToastProvider>
        <AuthProvider>
          <ThemeProvider>
            <CachedListingsProvider>
              <AlertProvider>
                <StatusBar translucent={false} backgroundColor="transparent" barStyle="dark-content" />
                <AppContent />
              </AlertProvider>
            </CachedListingsProvider>
          </ThemeProvider>
        </AuthProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}