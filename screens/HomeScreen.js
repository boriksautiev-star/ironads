// screens/HomeScreen.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import api, { toggleFavorite } from '../services/api';
import AppCachedImage from '../components/AppCachedImage';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import SkeletonCard from '../components/SkeletonCard';
import AnimatedHeart from '../components/AnimatedHeart';
import LoadingIndicator from '../components/LoadingIndicator';

const BASE_URL_IMAGES = 'https://ironads.ru';
const PAGE_SIZE = 40;
const CARD_HEIGHT = 130;
const CARD_MARGIN = 16;

export default function HomeScreen() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [favorites, setFavorites] = useState({});
  const abortControllerRef = useRef(null);
  const flatListRef = useRef(null);

  const navigation = useNavigation();
  const route = useRoute();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [filters, setFilters] = useState({
    search: '',
    categoryId: '',
    categoryName: '',
    regionId: '',
    regionName: '',
    cityId: '',
    cityName: '',
    priceFrom: '',
    priceTo: '',
    type: 'sell',
    sort: 'date_desc',
  });

  const initialLoadDone = useRef(false);

  const scrollToTop = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      header: () => (
        <View style={{
          height: 40,
          backgroundColor: colors.card,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingHorizontal: 16,
        }}>
          <TouchableOpacity
            onPress={() => { if (!user) { navigation.navigate('Auth'); } else { navigation.navigate('CreateListing'); } }}
            style={{ position: 'absolute', left: 16 }}
          >
            <Ionicons name="add-circle-outline" size={24} color={colors.tabBarActive} />
          </TouchableOpacity>
          <TouchableOpacity onPress={scrollToTop} activeOpacity={0.7}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.tabBarActive }}>
              IronAds
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Filters', { filters: filters })}
            style={{ position: 'absolute', right: 16 }}
          >
            <Text style={{ fontSize: 20 }}>🔍</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, filters, colors, scrollToTop]);

  const fetchListingsWithFilters = async (filtersObj, reset = false) => {
    if (reset) {
      setPage(1);
      setListings([]);
      setHasMore(true);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    }
    const currentPage = reset ? 1 : page;
    if (!hasMore && !reset) return;
    if (loading) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const params = { limit: PAGE_SIZE, page: currentPage };
      if (filtersObj.search) params.search = filtersObj.search;
      if (filtersObj.categoryId) params.category_id = filtersObj.categoryId;
      if (filtersObj.regionId) params.region_id = filtersObj.regionId;
      if (filtersObj.cityId) params.city_id = filtersObj.cityId;
      if (filtersObj.priceFrom) params.min_price = filtersObj.priceFrom;
      if (filtersObj.priceTo) params.max_price = filtersObj.priceTo;
      if (filtersObj.type && filtersObj.type !== 'all') params.type = filtersObj.type;
      if (filtersObj.sort) params.sort = filtersObj.sort;

      console.log('📡 Запрос к /listings/filter с параметрами:', params);
      const response = await api.get('/listings/filter', { params, signal: controller.signal });
      const listingsData = response.data.listings || response.data;
      const pagination = response.data.pagination;

      const validListings = listingsData.filter(item => item && item.id != null);
      const newListings = validListings.map(item => ({
        ...item,
        is_favorite: item.is_favorite || false,
      }));

      const favMap = {};
      newListings.forEach(item => { favMap[item.id] = item.is_favorite; });

      if (reset) {
        setListings(newListings);
        setFavorites(favMap);
      } else {
        setListings(prev => mergeListings(prev, newListings));
        setFavorites(prev => ({ ...prev, ...favMap }));
      }

      if (pagination) {
        setHasMore(pagination.page < pagination.pages);
      } else {
        setHasMore(newListings.length === PAGE_SIZE);
      }
      setPage(currentPage + 1);
    } catch (err) {
      if (axios.isCancel(err) || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
        console.log('Запрос отменён');
        return;
      }
      console.error('❌ Ошибка загрузки:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
    }
  };

  const mergeListings = (existing, newItems) => {
    const validNewItems = newItems.filter(item => item && item.id != null);
    const existingIds = new Set(existing.map(item => item.id).filter(id => id != null));
    const uniqueNew = validNewItems.filter(item => !existingIds.has(item.id));
    if (uniqueNew.length !== validNewItems.length) {
      console.warn(`⚠️ Найдено ${validNewItems.length - uniqueNew.length} дублирующихся объявлений, они пропущены`);
    }
    return [...existing, ...uniqueNew];
  };

  useEffect(() => {
    const newFilters = route.params?.filters;
    if (newFilters) {
      console.log('🔄 Применяем новые фильтры из параметров:', newFilters);
      setFilters(newFilters);
      setPage(1);
      setListings([]);
      setHasMore(true);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      fetchListingsWithFilters(newFilters, true);
    } else if (!initialLoadDone.current) {
      console.log('🔄 Первоначальная загрузка (без фильтров)');
      initialLoadDone.current = true;
      fetchListingsWithFilters(filters, true);
    }
  }, [route.params?.filters]);

  const fetchListings = async (reset = false) => {
    fetchListingsWithFilters(filters, reset);
  };

  const loadMore = () => {
    if (!loading && hasMore) fetchListings(false);
  };
  const refreshListings = () => {
    setRefreshing(true);
    fetchListingsWithFilters(filters, true);
  };

  const handleToggleFavorite = async (listingId) => {
    if (!user) { navigation.navigate('Auth'); return; }
    if (!listingId) return;
    const current = favorites[listingId];
    setFavorites(prev => ({ ...prev, [listingId]: !current }));
    try {
      const res = await toggleFavorite(listingId);
      setFavorites(prev => ({ ...prev, [listingId]: res.favorited }));
      showToast(res.favorited ? 'Добавлено в избранное ❤️' : 'Удалено из избранного 🤍', 'success');
    } catch (err) {
      setFavorites(prev => ({ ...prev, [listingId]: current }));
      showToast('Не удалось изменить избранное', 'error');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getImageUrl = (item) => {
    let url = null;
    if (item.first_media && item.first_media.file_path) url = item.first_media.file_path;
    else if (item.first_photo) url = item.first_photo;
    else if (item.media && item.media.length > 0 && item.media[0].file_path) url = item.media[0].file_path;
    if (url) return url.startsWith('http') ? url : BASE_URL_IMAGES + url;
    return null;
  };

  const renderItem = ({ item }) => {
    if (!item || !item.id) return null;

    const imageUrl = getImageUrl(item);
    const isFav = favorites[item.id] || false;

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.shadow }]}
        onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
        activeOpacity={0.7}
      >
        <View style={styles.cardContent}>
          {imageUrl ? (
            <AppCachedImage uri={imageUrl} style={styles.image} resizeMode="cover" />
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
              <Text style={[styles.metaText, { color: colors.secondaryText }]}>
                {formatDate(item.created_at)}
              </Text>
            </View>
          </View>
          <View style={[styles.favButton, { backgroundColor: 'rgba(255,255,255,0.9)' }]}>
            <AnimatedHeart
              isFavorite={isFav}
              onPress={() => handleToggleFavorite(item.id)}
              size={28}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderFooter = () => {
    if (!loading) return null;
    return (
      <View style={styles.footer}>
        <LoadingIndicator size={30} />
        <Text style={[styles.footerText, { color: colors.secondaryText }]}>Загрузка...</Text>
      </View>
    );
  };

  const getItemLayout = (data, index) => {
    const height = CARD_HEIGHT + CARD_MARGIN;
    return { length: height, offset: height * index, index };
  };

  if (loading && listings.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.list, { padding: 16 }]}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </SafeAreaView>
    );
  }

  if (error && listings.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: 'red' }]}>Ошибка: {error}</Text>
        <TouchableOpacity onPress={refreshListings} style={[styles.retryButton, { backgroundColor: colors.primary }]}>
          <Text style={styles.retryText}>Повторить</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right']}>
      <FlatList
        ref={flatListRef}
        data={listings}
        keyExtractor={(item, index) => {
          return item && item.id != null ? String(item.id) : `fallback-${index}`;
        }}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.7}
        ListFooterComponent={renderFooter}
        refreshing={refreshing}
        onRefresh={refreshListings}
        extraData={favorites}
        getItemLayout={getItemLayout}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
        }}
        // Отключаем удаление клипнутых элементов для плавности скролла при подгрузке
        removeClippedSubviews={false}
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
  cardContent: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
    position: 'relative',
  },
  image: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginRight: 12,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconText: { fontSize: 40 },
  infoContainer: { flex: 1, justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  price: { fontSize: 17, fontWeight: '700', marginBottom: 2 },
  description: { fontSize: 14, marginBottom: 4 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  metaText: { fontSize: 12 },
  favButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 20,
    padding: 4,
    opacity: 0.9,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { fontSize: 16, textAlign: 'center', marginBottom: 16 },
  retryButton: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8 },
  retryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 16 },
  footerText: { marginLeft: 8, fontSize: 14 },
});
