// screens/AvailableListingsScreen.js
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../services/api';
import { useCachedListings } from '../context/CachedListingsContext';
import { getImageUrl } from '../utils/imageUtils';
import AppCachedImage from '../components/AppCachedImage'; // заменено
import { useTheme } from '../context/ThemeContext';
import { useAlert } from '../context/AlertContext';
import { useToast } from '../context/ToastContext';
import PressableButton from '../components/PressableButton';

export default function AvailableListingsScreen({ navigation }) {
  const route = useRoute();
  const { subscriptionId } = route.params;
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { showAlert } = useAlert();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allListings, setAllListings] = useState([]);
  const [listings, setListings] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [adding, setAdding] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');

  const { getCached } = useCachedListings();

  const loadAllListings = async () => {
    setLoading(true);
    try {
      const res = await api.get('/listings/my', { params: { limit: 1000 } });
      const data = res.data || [];
      setAllListings(data);
      applyLocalFilters('', 'all', 'active', data);
    } catch (error) {
      console.error('Ошибка загрузки объявлений:', error);
      showAlert({
        title: 'Ошибка',
        message: 'Не удалось загрузить объявления',
        buttons: [{ text: 'OK' }],
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const applyLocalFilters = (search, type, status, sourceData = null) => {
    const data = sourceData || allListings;
    let filtered = [...data];

    if (search.trim()) {
      const lower = search.toLowerCase().trim();
      filtered = filtered.filter(item =>
        item.title?.toLowerCase().includes(lower) ||
        item.description?.toLowerCase().includes(lower)
      );
    }

    if (type !== 'all') {
      filtered = filtered.filter(item => item.type === type);
    }

    if (status !== 'all') {
      filtered = filtered.filter(item => item.status === status);
    }

    setListings(filtered);
    setSelectedIds([]);
  };

  const applyFilters = useCallback(() => {
    applyLocalFilters(searchText, filterType, filterStatus);
  }, [searchText, filterType, filterStatus, allListings]);

  const resetFilters = useCallback(() => {
    setSearchText('');
    setFilterType('all');
    setFilterStatus('active');
    applyLocalFilters('', 'all', 'active');
  }, [allListings]);

  useFocusEffect(
    useCallback(() => {
      loadAllListings();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadAllListings();
  };

  const selectAllListings = async () => {
    setLoadingAll(true);
    try {
      const allIds = listings.map(item => item.id);
      setSelectedIds(allIds);
    } finally {
      setLoadingAll(false);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    selectAllListings();
  };

  const clearAll = () => setSelectedIds([]);

  const handleAddSelected = async () => {
    if (selectedIds.length === 0) {
      showAlert({
        title: 'Внимание',
        message: 'Выберите хотя бы одно объявление',
        buttons: [{ text: 'OK' }],
      });
      return;
    }
    showAlert({
      title: 'Подтверждение',
      message: `Добавить ${selectedIds.length} объявлений в пакет?`,
      buttons: [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Добавить',
          onPress: async () => {
            setAdding(true);
            let success = 0, errors = 0;
            for (const id of selectedIds) {
              try {
                await api.post(`/subscriptions/${subscriptionId}/listings`, { listingId: id });
                success++;
              } catch (e) {
                errors++;
              }
            }
            setAdding(false);
            if (errors > 0) {
              showAlert({
                title: 'Частичный успех',
                message: `Добавлено ${success}, ошибок ${errors}`,
                buttons: [{ text: 'OK' }],
              });
            } else {
              showToast(`✅ Добавлено ${success} объявлений`);
            }
            navigation.goBack();
          },
        },
      ],
    });
  };

  const getImageUrlWithCache = (item) => {
    let url = getImageUrl(item);
    if (!url) {
      const cached = getCached(item.id);
      if (cached) {
        url = getImageUrl(cached);
      }
    }
    return url;
  };

  const renderItem = ({ item }) => {
    const selected = selectedIds.includes(item.id);
    const imageUrl = getImageUrlWithCache(item);
    return (
      <TouchableOpacity
        style={[
          styles.item,
          { backgroundColor: colors.card, borderColor: colors.border },
          selected && { backgroundColor: colors.inputBackground, borderColor: colors.primary }
        ]}
        onPress={() => toggleSelect(item.id)}
      >
        {imageUrl ? (
          <AppCachedImage
            uri={imageUrl}
            style={styles.itemImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.itemImage, styles.placeholderImage, { backgroundColor: colors.inputBackground }]}>
            <Text style={[styles.placeholderText, { color: colors.secondaryText }]}>📷</Text>
          </View>
        )}
        <View style={styles.info}>
          <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
          <Text style={[styles.price, { color: colors.primary }]}>{item.price} ₽</Text>
        </View>
        {selected && <Text style={[styles.check, { color: colors.primary }]}>✓</Text>}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const totalSelected = selectedIds.length;
  const totalVisible = listings.length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background, padding: 16 }]}>
      <Text style={[styles.header, { color: colors.text }]}>Выбор объявлений</Text>

      <View style={styles.searchRow}>
        <TextInput
          style={[
            styles.searchInput,
            { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }
          ]}
          placeholder="Поиск по названию или описанию..."
          placeholderTextColor={colors.secondaryText}
          value={searchText}
          onChangeText={setSearchText}
          blurOnSubmit={false}
          returnKeyType="search"
          onSubmitEditing={applyFilters}
        />
        <PressableButton
          title="Поиск"
          onPress={applyFilters}
          style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 }}
        />
        <PressableButton
          title="Сброс"
          onPress={resetFilters}
          style={{ backgroundColor: colors.inputBackground, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 }}
          textStyle={{ color: colors.text }}
        />
      </View>

      <View style={styles.filterRow}>
        {['all', 'sell', 'rent'].map((type) => (
          <TouchableOpacity
            key={type}
            style={[
              styles.filterBtn,
              { backgroundColor: colors.card, borderColor: colors.border },
              filterType === type && styles.activeFilter,
            ]}
            onPress={() => setFilterType(type)}
          >
            <Text style={[styles.filterText, { color: colors.text }]}>
              {type === 'all' ? 'Все' : type === 'sell' ? 'Продажа' : 'Аренда'}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[
            styles.filterBtn,
            { backgroundColor: colors.card, borderColor: colors.border },
            filterStatus === 'active' && styles.activeFilter,
          ]}
          onPress={() => setFilterStatus('active')}
        >
          <Text style={[styles.filterText, { color: colors.text }]}>Активные</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterBtn,
            { backgroundColor: colors.card, borderColor: colors.border },
            filterStatus === 'archived' && styles.activeFilter,
          ]}
          onPress={() => setFilterStatus('archived')}
        >
          <Text style={[styles.filterText, { color: colors.text }]}>Архив</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.selectionBar, { backgroundColor: colors.card }]}>
        <Text style={[styles.selectionText, { color: colors.text }]}>
          Выбрано: {totalSelected} {totalVisible > 0 ? `из ${totalVisible}` : ''}
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity onPress={selectAll} disabled={loadingAll}>
            {loadingAll ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.actionText, { color: colors.primary }]}>Все</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={clearAll}>
            <Text style={[styles.actionText, { color: colors.primary }]}>Снять</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={listings}
        keyExtractor={(item, index) => (item.id ? String(item.id) : `fallback-${index}`)}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.secondaryText }]}>Нет объявлений</Text>}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
      />

      <PressableButton
        title={`Добавить выбранные (${totalSelected})`}
        onPress={handleAddSelected}
        loading={adding}
        disabled={totalSelected === 0 || adding}
        style={[styles.addButton, { backgroundColor: colors.primary }]}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  searchInput: { flex: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, fontSize: 16 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  filterBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, marginRight: 6, marginBottom: 6, borderWidth: 1 },
  activeFilter: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  filterText: { fontSize: 14 },
  selectionBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 8, borderRadius: 8, marginBottom: 8 },
  selectionText: { fontSize: 14 },
  actions: { flexDirection: 'row' },
  actionText: { marginLeft: 12, fontSize: 14, fontWeight: '500' },
  listContent: { paddingBottom: 20 },
  item: { flexDirection: 'row', padding: 10, borderRadius: 8, marginBottom: 6, borderWidth: 1, alignItems: 'center' },
  itemImage: { width: 50, height: 50, borderRadius: 6, marginRight: 10 },
  placeholderImage: { justifyContent: 'center', alignItems: 'center' },
  placeholderText: { fontSize: 20 },
  info: { flex: 1 },
  title: { fontSize: 16 },
  price: { fontSize: 14 },
  check: { fontSize: 18, marginLeft: 8 },
  addButton: { position: 'absolute', left: 16, right: 16, paddingVertical: 14, borderRadius: 10, alignItems: 'center', bottom: 20 },
  empty: { textAlign: 'center', marginTop: 20 },
});