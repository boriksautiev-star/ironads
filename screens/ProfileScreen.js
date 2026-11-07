// screens/ProfileScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useAlert } from '../context/AlertContext';
import { useToast } from '../context/ToastContext';
import AppCachedImage from '../components/AppCachedImage'; // заменено
import { ProfileSkeleton } from '../components/Skeleton';
import PressableButton from '../components/PressableButton';

const BASE_URL_IMAGES = 'https://ironads.ru';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { user, logout } = useAuth();
  const { colors, toggleTheme } = useTheme();
  const { showAlert } = useAlert();
  const { showToast } = useToast();
  const [profile, setProfile] = useState(null);
  const [myListings, setMyListings] = useState([]);
  const [archivedListings, setArchivedListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('active');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('Чаты')}
          style={{ marginRight: 16 }}
        >
          <Text style={{ fontSize: 24 }}>💬</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const fetchUserData = async () => {
    try {
      const response = await api.get('/auth/me');
      const userData = response.data;
      setProfile(userData);
      await AsyncStorage.setItem('user', JSON.stringify(userData));
    } catch (e) {
      console.error('Ошибка загрузки пользователя:', e);
    }
  };

  const fetchListings = async () => {
    setLoading(true);
    try {
      const [activeRes, archivedRes] = await Promise.all([
        api.get('/listings/my'),
        api.get('/listings/my/archived'),
      ]);
      setMyListings(activeRes.data || []);
      setArchivedListings(archivedRes.data || []);
    } catch (err) {
      console.error('Ошибка загрузки объявлений:', err);
      showAlert({
        title: 'Ошибка',
        message: 'Не удалось загрузить ваши объявления',
        buttons: [{ text: 'OK' }],
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([fetchUserData(), fetchListings()]);
    setRefreshing(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        refreshAll();
      }
    }, [user])
  );

  const handleArchive = async (id) => {
    showAlert({
      title: 'Архивировать',
      message: 'Переместить объявление в архив?',
      buttons: [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Архивировать',
          onPress: async () => {
            setActionLoading(true);
            try {
              await api.post(`/listings/${id}/archive`);
              await fetchListings();
              showToast('Объявление архивировано');
            } catch (err) {
              showAlert({
                title: 'Ошибка',
                message: 'Не удалось заархивировать',
                buttons: [{ text: 'OK' }],
              });
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    });
  };

  const handleRestore = async (id) => {
    setActionLoading(true);
    try {
      await api.post(`/listings/${id}/restore`);
      await fetchListings();
      showToast('Объявление восстановлено');
    } catch (err) {
      showAlert({
        title: 'Ошибка',
        message: 'Не удалось восстановить',
        buttons: [{ text: 'OK' }],
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleBump = async (id) => {
    setActionLoading(true);
    try {
      await api.post(`/listings/${id}/bump`);
      showAlert({
        title: 'Успех',
        message: 'Объявление поднято!',
        buttons: [{ text: 'OK' }],
      });
      await fetchListings();
    } catch (err) {
      const msg = err.response?.data?.error || 'Не удалось поднять';
      showAlert({
        title: 'Ошибка',
        message: msg,
        buttons: [{ text: 'OK' }],
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeletePermanent = async (id) => {
    showAlert({
      title: 'Удалить навсегда',
      message: 'Вы уверены? Это действие необратимо.',
      buttons: [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await api.delete(`/my/${id}/permanent`);
              await fetchListings();
              showToast('Объявление удалено навсегда');
            } catch (err) {
              showAlert({
                title: 'Ошибка',
                message: 'Не удалось удалить',
                buttons: [{ text: 'OK' }],
              });
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    });
  };

  const handleLogout = async () => {
    showAlert({
      title: 'Выход',
      message: 'Вы уверены, что хотите выйти?',
      buttons: [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Выйти',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ],
    });
  };

  const showThemeOptions = () => {
    showAlert({
      title: 'Выберите тему',
      message: '',
      buttons: [
        { text: '☀️ Светлая', onPress: () => toggleTheme(false) },
        { text: '🌙 Тёмная', onPress: () => toggleTheme(true) },
        { text: 'Отмена', style: 'cancel' },
      ],
    });
  };

  const renderListingItem = ({ item }) => {
    const imageUrl = item.first_media?.file_path
      ? BASE_URL_IMAGES + item.first_media.file_path
      : null;

    const isArchived = item.status === 'archived';

    return (
      <View style={[styles.listingCard, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
        <TouchableOpacity
          style={styles.cardContent}
          onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
          disabled={actionLoading}
        >
          {imageUrl ? (
            <AppCachedImage
              uri={imageUrl}
              style={styles.listingImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.listingImage, { backgroundColor: colors.inputBackground }]} />
          )}
          <View style={styles.listingInfo}>
            <Text style={[styles.listingTitle, { color: colors.text }]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={[styles.listingPrice, { color: colors.primary }]}>{item.price} ₽</Text>
            <Text style={[styles.listingMeta, { color: colors.secondaryText }]}>
              {item.city_name || 'Город не указан'} • 👁️ {item.views || item.view_count || 0}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={[styles.cardActions, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={styles.actionIcon}
            onPress={() => navigation.navigate('EditListing', { id: item.id })}
            disabled={actionLoading}
          >
            <Text style={styles.actionIconText}>✏️</Text>
          </TouchableOpacity>

          {isArchived ? (
            <>
              <TouchableOpacity
                style={styles.actionIcon}
                onPress={() => handleRestore(item.id)}
                disabled={actionLoading}
              >
                <Text style={styles.actionIconText}>↩️</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionIcon, styles.dangerIcon]}
                onPress={() => handleDeletePermanent(item.id)}
                disabled={actionLoading}
              >
                <Text style={styles.actionIconText}>🗑️</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.actionIcon}
                onPress={() => handleBump(item.id)}
                disabled={actionLoading}
              >
                <Text style={styles.actionIconText}>⬆️</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionIcon}
                onPress={() => handleArchive(item.id)}
                disabled={actionLoading}
              >
                <Text style={styles.actionIconText}>📁</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <Text style={[{ fontSize: 18, color: colors.secondaryText, textAlign: 'center', marginBottom: 20 }]}>Войдите, чтобы просматривать профиль</Text>
        <TouchableOpacity
          style={[{ backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 40, borderRadius: 10 }]}
          onPress={() => navigation.navigate('Auth')}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Войти</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return <ProfileSkeleton />;
  }

  const currentListings = activeTab === 'active' ? myListings : archivedListings;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshAll} />
        }
      >
        <View style={[styles.userInfo, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>
              {profile?.username ? profile.username.charAt(0).toUpperCase() : '?'}
            </Text>
          </View>
          <View style={styles.userNameContainer}>
            <Text style={[styles.userName, { color: colors.text }]}>{profile?.username || 'Пользователь'}</Text>
            {profile?.is_partner === true && (
              <View style={styles.partnerBadge}>
                <Text style={styles.partnerBadgeText}>🤝 Партнёр</Text>
              </View>
            )}
          </View>
          <Text style={[styles.userEmail, { color: colors.secondaryText }]}>{profile?.email || 'email@example.com'}</Text>
          {profile?.phone && <Text style={[styles.userPhone, { color: colors.secondaryText }]}>{profile.phone}</Text>}
        </View>

        <View style={[styles.actionsVertical, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.actionButtonVertical, { borderBottomColor: colors.border }]}
            onPress={() => navigation.navigate('EditProfile')}
          >
            <Text style={[styles.actionButtonText, { color: colors.primary }]}>✏️ Редактировать профиль</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButtonVertical, { borderBottomColor: colors.border }]}
            onPress={() => navigation.navigate('CreateListing')}
          >
            <Text style={[styles.actionButtonText, { color: colors.primary }]}>➕ Создать объявление</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButtonVertical, { borderBottomColor: colors.border }]}
            onPress={() => navigation.navigate('History')}
          >
            <Text style={[styles.actionButtonText, { color: colors.primary }]}>📜 История просмотров</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButtonVertical, { borderBottomColor: colors.border }]}
            onPress={() => navigation.navigate('Subscriptions')}
          >
            <Text style={[styles.actionButtonText, { color: colors.primary }]}>💳 Подписки</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButtonVertical, { borderBottomColor: colors.border }]}
            onPress={showThemeOptions}
          >
            <Text style={[styles.actionButtonText, { color: colors.primary }]}>🎨 Тема</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButtonVertical, { borderBottomColor: colors.border }]}
            onPress={() => navigation.navigate('Support')}
          >
            <Text style={[styles.actionButtonText, { color: colors.primary }]}>💬 Поддержка</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.statsRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: colors.text }]}>{myListings.length}</Text>
            <Text style={[styles.statLabel, { color: colors.secondaryText }]}>Активных</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: colors.text }]}>{archivedListings.length}</Text>
            <Text style={[styles.statLabel, { color: colors.secondaryText }]}>В архиве</Text>
          </View>
        </View>

        <View style={[styles.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'active' && styles.tabActive]}
            onPress={() => setActiveTab('active')}
          >
            <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>
              Активные
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'archived' && styles.tabActive]}
            onPress={() => setActiveTab('archived')}
          >
            <Text style={[styles.tabText, activeTab === 'archived' && styles.tabTextActive]}>
              Архив
            </Text>
          </TouchableOpacity>
        </View>

        {currentListings.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
              {activeTab === 'active' ? 'У вас нет активных объявлений' : 'Архив пуст'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={currentListings}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderListingItem}
            scrollEnabled={false}
            contentContainerStyle={styles.listContainer}
            extraData={actionLoading}
            // Оптимизация FlatList – getItemLayout (приблизительная высота)
            getItemLayout={(data, index) => ({
              length: 120, // примерная высота карточки
              offset: 120 * index,
              index,
            })}
          />
        )}

        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: colors.card, borderColor: '#ff3b30' }]}
          onPress={handleLogout}
        >
          <Text style={styles.logoutButtonText}>🚪 Выйти</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 16 },
  userInfo: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20, borderBottomWidth: 1 },
  avatarPlaceholder: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { fontSize: 36, fontWeight: 'bold', color: '#fff' },
  userNameContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' },
  userName: { fontSize: 20, fontWeight: 'bold', marginRight: 6 },
  partnerBadge: { backgroundColor: '#34c759', paddingVertical: 2, paddingHorizontal: 10, borderRadius: 12, marginLeft: 4 },
  partnerBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  userEmail: { fontSize: 16, marginTop: 4 },
  userPhone: { fontSize: 16, marginTop: 2 },
  actionsVertical: { paddingVertical: 8, paddingHorizontal: 16, borderBottomWidth: 1, marginTop: 10 },
  actionButtonVertical: { paddingVertical: 14, borderBottomWidth: 1 },
  actionButtonText: { fontSize: 16 },
  statsRow: { flexDirection: 'row', paddingVertical: 16, borderBottomWidth: 1, marginTop: 10 },
  statItem: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 22, fontWeight: 'bold' },
  statLabel: { fontSize: 14, marginTop: 2 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, marginTop: 10 },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#007AFF' },
  tabText: { fontSize: 16, fontWeight: '500', color: '#8e8e93' },
  tabTextActive: { color: '#007AFF' },
  listContainer: { padding: 16 },
  listingCard: { borderRadius: 10, marginBottom: 10, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1, overflow: 'hidden' },
  cardContent: { flexDirection: 'row', padding: 10 },
  listingImage: { width: 80, height: 80, borderRadius: 8, marginRight: 12 },
  listingInfo: { flex: 1, justifyContent: 'center' },
  listingTitle: { fontSize: 16, fontWeight: '600' },
  listingPrice: { fontSize: 15, fontWeight: '600', marginTop: 2 },
  listingMeta: { fontSize: 14, marginTop: 2 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 10, paddingBottom: 8, borderTopWidth: 1 },
  actionIcon: { padding: 6, marginLeft: 8 },
  actionIconText: { fontSize: 20 },
  dangerIcon: {},
  emptyContainer: { alignItems: 'center', marginTop: 40 },
  emptyText: { fontSize: 16 },
  logoutButton: { margin: 20, padding: 16, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  logoutButtonText: { color: '#ff3b30', fontSize: 18, fontWeight: '600' },
});
