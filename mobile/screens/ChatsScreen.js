// screens/ChatsScreen.js
import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import api, { getUnreadCount } from '../services/api';
import { emitUnreadUpdate } from '../utils/eventEmitter';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../context/AlertContext';
import { useToast } from '../context/ToastContext';
import { UnreadCountContext } from '../context/UnreadCountContext';
import { ChatSkeleton } from '../components/Skeleton';
import AppCachedImage from '../components/AppCachedImage'; // заменено
import { getImageUrl } from '../utils/imageUtils';

const BASE_URL_IMAGES = 'https://ironads.ru';

export default function ChatsScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { showToast } = useToast();
  const { refetch: refetchUnread } = useContext(UnreadCountContext);
  const [activeTab, setActiveTab] = useState('active');
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chatImages, setChatImages] = useState({}); // chatId -> imageUrl

  

  const updateBadgeLocal = async () => {
    try {
      const data = await getUnreadCount();
      const count = data.count || 0;
      await Notifications.setBadgeCountAsync(count);
      emitUnreadUpdate(count);
      refetchUnread();
    } catch (e) {}
  };

  // Загрузка изображения для одного чата
  const fetchChatImage = async (chatId, listingId) => {
    if (!listingId) return null;
    try {
      const response = await api.get(`/listings/${listingId}`);
      const listing = response.data;
      const imageUrl = getImageUrl(listing);
      if (imageUrl) {
        return imageUrl.startsWith('http') ? imageUrl : BASE_URL_IMAGES + imageUrl;
      }
    } catch (error) {
      console.warn('Не удалось загрузить изображение для чата', chatId);
    }
    return null;
  };

  const fetchChats = async (tab = activeTab) => {
    if (!user) return;
    setLoading(true);
    try {
      const endpoint = tab === 'active' ? '/chats' : '/chats/archived';
      const response = await api.get(endpoint);
      let chatsData = Array.isArray(response.data) ? response.data : [];
      const enrichedChats = chatsData.map(chat => {
        const isBuyer = chat.buyer_id === user.id;
        const otherName = isBuyer ? chat.seller_name : chat.buyer_name;
        const otherId = isBuyer ? chat.seller_id : chat.buyer_id;
        const unread = parseInt(chat.unread_count) || 0;
        const lastMessage = chat.listing_title || 'Чат без объявления';
        return {
          ...chat,
          otherName,
          otherId,
          unread,
          lastMessage,
          lastActivity: chat.updated_at || chat.created_at,
          // сохраняем id объявления для загрузки изображения
          listingId: chat.listing_id,
        };
      });

      const sorted = enrichedChats.sort((a, b) => {
        const aUnread = a.unread || 0;
        const bUnread = b.unread || 0;
        if (aUnread > 0 && bUnread === 0) return -1;
        if (aUnread === 0 && bUnread > 0) return 1;
        const aTime = new Date(a.lastActivity || 0);
        const bTime = new Date(b.lastActivity || 0);
        return bTime - aTime;
      });

      setChats(sorted);
      const total = sorted.reduce((sum, chat) => sum + (chat.unread || 0), 0);
      await Notifications.setBadgeCountAsync(total);
      emitUnreadUpdate(total);
      refetchUnread();

      // Загружаем изображения для чатов, у которых есть listingId и ещё нет картинки
      const newImages = {};
      for (const chat of sorted) {
        if (chat.listingId && !chatImages[chat.id]) {
          const url = await fetchChatImage(chat.id, chat.listingId);
          if (url) {
            newImages[chat.id] = url;
          }
        }
      }
      if (Object.keys(newImages).length > 0) {
        setChatImages(prev => ({ ...prev, ...newImages }));
      }
    } catch (err) {
      console.error(err);
      showAlert({
        title: 'Ошибка',
        message: 'Не удалось загрузить чаты',
        buttons: [{ text: 'OK' }],
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        fetchChats(activeTab);
        updateBadgeLocal();
      }
    }, [user, activeTab])
  );

  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
  };

  const handleArchive = async (chatId) => {
    try {
      await api.post(`/chats/${chatId}/archive`);
      showToast('Чат архивирован');
      fetchChats(activeTab);
      updateBadgeLocal();
    } catch (err) {
      showAlert({
        title: 'Ошибка',
        message: 'Не удалось архивировать чат',
        buttons: [{ text: 'OK' }],
      });
    }
  };

  const handleRestore = async (chatId) => {
    try {
      await api.post(`/chats/${chatId}/restore`);
      showToast('Чат восстановлен');
      fetchChats(activeTab);
      updateBadgeLocal();
    } catch (err) {
      showAlert({
        title: 'Ошибка',
        message: 'Не удалось восстановить чат',
        buttons: [{ text: 'OK' }],
      });
    }
  };

  const handleDelete = async (chatId) => {
    showAlert({
      title: 'Удалить чат',
      message: 'Вы уверены, что хотите удалить этот чат? Это действие необратимо.',
      buttons: [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/chats/${chatId}`);
              showToast('Чат удалён');
              fetchChats(activeTab);
              updateBadgeLocal();
            } catch (err) {
              showAlert({
                title: 'Ошибка',
                message: 'Не удалось удалить чат',
                buttons: [{ text: 'OK' }],
              });
            }
          },
        },
      ],
    });
  };

  const handleLongPress = (item) => {
    const isArchived = activeTab === 'archived';
    const actions = [
      {
        text: isArchived ? 'Восстановить' : 'Архивировать',
        onPress: isArchived
          ? () => handleRestore(item.id)
          : () => handleArchive(item.id),
      },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => handleDelete(item.id),
      },
      { text: 'Отмена', style: 'cancel' },
    ];
    showAlert({
      title: `Чат с ${item.otherName}`,
      message: 'Выберите действие',
      buttons: actions,
    });
  };

  const renderItem = ({ item }) => {
    const name = item.otherName || 'Пользователь';
    const lastMsg = item.lastMessage || 'Нет сообщений';
    const unread = item.unread || 0;
    const time = item.lastActivity
      ? new Date(item.lastActivity).toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'short',
        })
      : '';
    const imageUrl = chatImages[item.id] || null;

    return (
      <TouchableOpacity
        style={[styles.chatItem, { backgroundColor: colors.card, shadowColor: colors.shadow }]}
        onPress={() =>
          navigation.navigate('ChatDetail', {
            chatId: item.id,
            otherName: name,
            otherUserId: item.otherId,
          })
        }
        onLongPress={() => handleLongPress(item)}
        delayLongPress={500}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          {imageUrl ? (
            <AppCachedImage
              uri={imageUrl}
              style={styles.avatarImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>
                {name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.chatInfo}>
          <Text style={[styles.chatName, { color: colors.text }]}>{name}</Text>
          <Text style={[styles.lastMessage, { color: colors.secondaryText }]} numberOfLines={1}>
            {lastMsg}
          </Text>
          {time ? <Text style={[styles.chatTime, { color: colors.secondaryText }]}>{time}</Text> : null}
        </View>
        {unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (!user) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyText, { color: colors.secondaryText }]}>Войдите, чтобы просматривать чаты</Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary, marginTop: 16 }]}
          onPress={() => navigation.navigate('Auth')}
        >
          <Text style={styles.retryText}>Войти</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <FlatList
          data={[1,2,3,4,5]}
          renderItem={() => <ChatSkeleton />}
          keyExtractor={(item) => item.toString()}
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'active' && styles.tabActive]}
          onPress={() => handleTabSwitch('active')}
        >
          <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>
            Активные
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'archived' && styles.tabActive]}
          onPress={() => handleTabSwitch('archived')}
        >
          <Text style={[styles.tabText, activeTab === 'archived' && styles.tabTextActive]}>
            Архив
          </Text>
        </TouchableOpacity>
      </View>

      {chats.length === 0 ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
            {activeTab === 'active'
              ? 'У вас нет активных чатов'
              : 'Архив пуст'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            fetchChats(activeTab);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 16 },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#007AFF' },
  tabText: { fontSize: 16, fontWeight: '500', color: '#8e8e93' },
  tabTextActive: { color: '#007AFF' },
  listContent: { padding: 16 },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  avatarContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    marginRight: 12,
  },
  avatarImage: {
    width: 50,
    height: 50,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  chatInfo: { flex: 1, justifyContent: 'center' },
  chatName: { fontSize: 16, fontWeight: '600' },
  lastMessage: { fontSize: 14, marginTop: 2 },
  chatTime: { fontSize: 12, marginTop: 2 },
  badge: { backgroundColor: '#007AFF', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { fontSize: 18, textAlign: 'center' },
});
