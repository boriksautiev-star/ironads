// screens/FavoritesScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getFavorites } from '../services/api';
import AppCachedImage from '../components/AppCachedImage'; // заменено
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../context/AlertContext';
import { useToast } from '../context/ToastContext';
import { ListingSkeleton } from '../components/Skeleton';

const BASE_URL_IMAGES = 'https://ironads.ru';

export default function FavoritesScreen({ navigation }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { showToast } = useToast();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchFavorites = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getFavorites();
      const validListings = data.filter(item => item && item.id != null);
      setListings(validListings);
    } catch (err) {
      setError(err.message || 'Ошибка загрузки избранного');
      showAlert({
        title: 'Ошибка',
        message: 'Не удалось загрузить избранное',
        buttons: [{ text: 'OK' }],
      });
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        fetchFavorites();
      }
    }, [user])
  );

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getImageUrl = (item) => {
    let url = null;
    if (item.first_photo) {
      url = item.first_photo.startsWith('http')
        ? item.first_photo
        : BASE_URL_IMAGES + item.first_photo;
    } else if (item.first_media && item.first_media.file_path) {
      const path = item.first_media.file_path;
      url = path.startsWith('http') ? path : BASE_URL_IMAGES + path;
    } else if (item.media && Array.isArray(item.media) && item.media.length > 0) {
      const first = item.media[0];
      if (first.file_path) {
        const path = first.file_path;
        url = path.startsWith('http') ? path : BASE_URL_IMAGES + path;
      }
    }
    return url;
  };

  const renderItem = ({ item }) => {
    if (!item || !item.id) return null;

    const imageUrl = getImageUrl(item);

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.shadow }]}
        onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
        activeOpacity={0.7}
      >
        <View style={styles.cardContent}>
          {imageUrl ? (
            <AppCachedImage
              uri={imageUrl}
              style={styles.image}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.iconContainer, { backgroundColor: colors.inputBackground }]}>
              <Text style={styles.iconText}>{item.category_icon || '📄'}</Text>
            </View>
          )}
          <View style={styles.infoContainer}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
              {item.title || 'Без названия'}
            </Text>
            <Text style={[styles.price, { color: colors.primary }]}>
              {item.price ? `${item.price} ₽` : 'Цена не указана'}
            </Text>
            {item.description && (
              <Text style={[styles.description, { color: colors.secondaryText }]} numberOfLines={2}>
                {item.description}
              </Text>
            )}
            <View style={styles.metaRow}>
              <Text style={[styles.metaText, { color: colors.secondaryText }]}>
                {item.city_name || item.city || 'Город не указан'}
              </Text>
              <Text style={[styles.metaText, { color: colors.secondaryText }]}>{formatDate(item.created_at)}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (!user) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyText, { color: colors.secondaryText }]}>Войдите, чтобы просматривать избранное</Text>
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
      <FlatList
        data={[1,2,3,4,5,6]}
        renderItem={() => <ListingSkeleton />}
        keyExtractor={(item) => item.toString()}
        numColumns={2}
        contentContainerStyle={{ padding: 8 }}
        style={{ backgroundColor: colors.background }}
      />
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: 'red' }]}>Ошибка: {error}</Text>
        <TouchableOpacity onPress={fetchFavorites} style={[styles.retryButton, { backgroundColor: colors.primary }]}>
          <Text style={styles.retryText}>Повторить</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (listings.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyText, { color: colors.secondaryText }]}>У вас пока нет избранных объявлений</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={listings}
        keyExtractor={(item, index) => (item.id ? String(item.id) : `fallback-${index}`)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        // Оптимизация
        getItemLayout={(data, index) => {
          const itemHeight = 130; // примерная высота элемента
          return { length: itemHeight, offset: itemHeight * index, index };
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16 },
  card: {
    borderRadius: 12,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  cardContent: { flexDirection: 'row', padding: 12, alignItems: 'center' },
  image: { width: 100, height: 100, borderRadius: 8, marginRight: 12 },
  iconContainer: { width: 100, height: 100, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  iconText: { fontSize: 40 },
  infoContainer: { flex: 1, justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  price: { fontSize: 17, fontWeight: '700', marginBottom: 2 },
  description: { fontSize: 14, marginBottom: 4 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  metaText: { fontSize: 12 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { fontSize: 16, textAlign: 'center', marginBottom: 16 },
  retryButton: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8 },
  retryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  emptyText: { fontSize: 18, textAlign: 'center' },
});
