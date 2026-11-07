import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { debounce } from 'lodash'; // или свою реализацию

const ListingSelector = ({
  initialSelected = [],
  maxSlots = 10,
  onSelectionChange,
  excludeIds = [], // ID, которые нельзя выбрать (заняты)
  fetchListings, // функция для получения объявлений (с фильтрами)
}) => {
  const [listings, setListings] = useState([]);
  const [selected, setSelected] = useState(initialSelected);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Фильтры
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [type, setType] = useState('all'); // 'sell', 'rent', 'all'
  const [status, setStatus] = useState('active'); // 'active', 'archived', 'all'

  const loadListings = async (reset = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const currentPage = reset ? 1 : page;
      const params = {
        page: currentPage,
        limit: 20,
        search: search || undefined,
        categoryId: categoryId || undefined,
        type: type !== 'all' ? type : undefined,
        status: status !== 'all' ? status : undefined,
      };
      const response = await fetchListings(params);
      const newListings = response.data || [];
      if (reset) {
        setListings(newListings);
        setPage(1);
        setHasMore(newListings.length === 20);
      } else {
        setListings(prev => [...prev, ...newListings]);
        setHasMore(newListings.length === 20);
        setPage(prev => prev + 1);
      }
    } catch (error) {
      console.error('Ошибка загрузки объявлений:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadListings(true);
  };

  const loadMore = () => {
    if (!hasMore || loading) return;
    loadListings();
  };

  // Дебаунс для поиска
  const debouncedSearch = useCallback(
    debounce((text) => {
      setSearch(text);
      loadListings(true);
    }, 300),
    []
  );

  const toggleSelect = (listingId) => {
    setSelected(prev => {
      let newSelected;
      if (prev.includes(listingId)) {
        newSelected = prev.filter(id => id !== listingId);
      } else {
        if (prev.length >= maxSlots) {
          alert(`Можно выбрать не более ${maxSlots} объявлений`);
          return prev;
        }
        newSelected = [...prev, listingId];
      }
      return newSelected;
    });
  };

  const selectAll = () => {
    const available = listings
      .filter(item => !excludeIds.includes(item.id))
      .map(item => item.id);
    const canSelect = available.slice(0, maxSlots - selected.length);
    setSelected(prev => [...prev, ...canSelect]);
  };

  const clearAll = () => {
    setSelected([]);
  };

  const selectFreeOnly = () => {
    const free = listings
      .filter(item => !excludeIds.includes(item.id) && !selected.includes(item.id))
      .map(item => item.id);
    const toAdd = free.slice(0, maxSlots - selected.length);
    setSelected(prev => [...prev, ...toAdd]);
  };

  // При изменении выбора уведомляем родителя
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(selected);
    }
  }, [selected]);

  // Загрузка при монтировании
  useEffect(() => {
    loadListings(true);
  }, []);

  const renderItem = ({ item }) => {
    const isSelected = selected.includes(item.id);
    const isExcluded = excludeIds.includes(item.id);
    const isDisabled = isExcluded || (!isSelected && selected.length >= maxSlots);

    return (
      <TouchableOpacity
        style={[
          styles.item,
          isSelected && styles.selected,
          isExcluded && styles.excluded,
        ]}
        onPress={() => !isExcluded && toggleSelect(item.id)}
        disabled={isDisabled && !isSelected}
      >
        <View style={styles.itemContent}>
          <Text style={styles.itemTitle}>{item.title}</Text>
          <Text style={styles.itemSub}>{item.price} ₽ · {item.category_name}</Text>
          {isExcluded && <Text style={styles.badge}>В другом пакете</Text>}
          {isSelected && <Text style={styles.badge}>✓ Выбрано</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Поиск */}
      <TextInput
        style={styles.search}
        placeholder="Поиск по названию..."
        onChangeText={debouncedSearch}
      />
      {/* Фильтры (упрощённо) */}
      <View style={styles.filters}>
        <TouchableOpacity
          style={[styles.filterBtn, type === 'all' && styles.filterActive]}
          onPress={() => { setType('all'); loadListings(true); }}
        >
          <Text>Все</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, type === 'sell' && styles.filterActive]}
          onPress={() => { setType('sell'); loadListings(true); }}
        >
          <Text>Продажа</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, type === 'rent' && styles.filterActive]}
          onPress={() => { setType('rent'); loadListings(true); }}
        >
          <Text>Аренда</Text>
        </TouchableOpacity>
        {/* Добавьте другие фильтры по необходимости */}
      </View>

      {/* Счётчик и массовые кнопки */}
      <View style={styles.counterBar}>
        <Text>Выбрано: {selected.length} / {maxSlots}</Text>
        <View style={styles.actions}>
          <TouchableOpacity onPress={selectAll}>
            <Text style={styles.actionText}>Выбрать все</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={clearAll}>
            <Text style={styles.actionText}>Снять все</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={selectFreeOnly}>
            <Text style={styles.actionText}>Свободные</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={listings}
        keyExtractor={item => item.id.toString()}
        renderItem={renderItem}
        onEndReached={loadMore}
        onEndReachedThreshold={0.2}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListFooterComponent={
          loading && <ActivityIndicator style={styles.loader} />
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  search: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 10 },
  filters: { flexDirection: 'row', marginBottom: 10 },
  filterBtn: { padding: 8, marginRight: 8, borderWidth: 1, borderColor: '#ddd', borderRadius: 20 },
  filterActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  counterBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  actions: { flexDirection: 'row' },
  actionText: { color: '#007AFF', marginLeft: 12 },
  item: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  selected: { backgroundColor: '#e0f0ff' },
  excluded: { opacity: 0.5 },
  itemContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemTitle: { fontSize: 16, fontWeight: '500' },
  itemSub: { fontSize: 14, color: '#666' },
  badge: { fontSize: 12, color: '#007AFF', fontWeight: '600' },
  loader: { padding: 20 },
});

export default ListingSelector;