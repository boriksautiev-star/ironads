import React, { useState, useCallback, useRef, useEffect } from 'react';
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
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useAlert } from '../context/AlertContext';
import { useToast } from '../context/ToastContext';
import PressableButton from '../components/PressableButton';

// ===== КАСТОМНЫЙ DEBOUNCE =====
function useDebounce(callback, delay) {
  const timerRef = useRef(null);

  const debouncedCallback = useCallback((...args) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      callback(...args);
      timerRef.current = null;
    }, delay);
  }, [callback, delay]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return debouncedCallback;
}

export default function PackageDetailScreen() {
  const route = useRoute();
  const { subscriptionId } = route.params;
  const { colors } = useTheme();
  const { showAlert } = useAlert();
  const { showToast } = useToast();

  // ===== СОСТОЯНИЯ =====
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [packageListings, setPackageListings] = useState([]);
  const [availableListings, setAvailableListings] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Фильтры
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');

  // ===== ЗАГРУЗКА ДАННЫХ =====
  const loadSubscriptionInfo = async () => {
    const res = await api.get(`/subscriptions/${subscriptionId}`);
    setSubscription(res.data);
    return res.data;
  };

  const loadPackageListings = async () => {
    const res = await api.get(`/subscriptions/${subscriptionId}/listings`);
    setPackageListings(res.data || []);
    return res.data;
  };

  const loadAvailableListings = async (reset = false) => {
    if (loadingMore && !reset) return;
    setLoadingMore(true);

    try {
      const currentPage = reset ? 1 : page;
      const params = {
        page: currentPage,
        limit: 20,
        search: search || undefined,
        type: filterType !== 'all' ? filterType : undefined,
        status: filterStatus !== 'all' ? filterStatus : undefined,
      };
      const res = await api.get('/listings/my', { params });
      const data = res.data || [];
      if (reset) {
        setAvailableListings(data);
        setPage(1);
        setHasMore(data.length === params.limit);
      } else {
        setAvailableListings(prev => [...prev, ...data]);
        setHasMore(data.length === params.limit);
        setPage(prev => prev + 1);
      }
    } catch (error) {
      showAlert({
        title: 'Ошибка',
        message: 'Не удалось загрузить объявления',
        buttons: [{ text: 'OK' }],
      });
    } finally {
      setLoadingMore(false);
    }
  };

  // ===== ЭФФЕКТ ДЛЯ ФИЛЬТРОВ =====
  useEffect(() => {
    setPage(1);
    setHasMore(true);
    setSelectedIds([]);
    loadAvailableListings(true);
  }, [search, filterType, filterStatus]);

  // Загрузка всех данных при входе на экран
  const loadAllData = async () => {
    setLoading(true);
    try {
      await loadSubscriptionInfo();
      await loadPackageListings();
      await loadAvailableListings(true);
    } catch (error) {
      showAlert({
        title: 'Ошибка',
        message: 'Не удалось загрузить данные',
        buttons: [{ text: 'OK' }],
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadAllData();
    }, [subscriptionId])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadAllData();
  };

  // Дебаунс для поиска
  const debouncedSearch = useDebounce((text) => {
    setSearch(text);
  }, 400);

  // ===== ВЫБОР ОБЪЯВЛЕНИЙ =====
  const toggleSelect = (id) => {
    if (!subscription) return;
    const maxSlots = subscription.max_slots || 10;
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      } else {
        if (prev.length >= maxSlots) {
          showAlert({
            title: 'Достигнут лимит',
            message: `Можно выбрать не более ${maxSlots} объявлений`,
            buttons: [{ text: 'OK' }],
          });
          return prev;
        }
        return [...prev, id];
      }
    });
  };

  const selectAll = () => {
    if (!subscription) return;
    const maxSlots = subscription.max_slots || 10;
    const currentSelected = selectedIds;
    const availableIds = availableListings.map(item => item.id);
    const newIds = availableIds.filter(id => !currentSelected.includes(id));
    const freeSlots = maxSlots - currentSelected.length;
    const toAdd = newIds.slice(0, freeSlots);
    if (toAdd.length === 0) {
      showAlert({
        title: 'Внимание',
        message: 'Нет свободных объявлений для добавления или лимит исчерпан',
        buttons: [{ text: 'OK' }],
      });
    } else {
      setSelectedIds(prev => [...prev, ...toAdd]);
    }
  };

  const clearAll = () => {
    setSelectedIds([]);
  };

  const selectFreeOnly = () => {
    if (!subscription) return;
    const maxSlots = subscription.max_slots || 10;
    const currentSelected = selectedIds;
    const alreadyInPackage = packageListings.map(item => item.id);
    const freeIds = availableListings
      .filter(item => !alreadyInPackage.includes(item.id))
      .map(item => item.id)
      .filter(id => !currentSelected.includes(id));
    const freeSlots = maxSlots - currentSelected.length;
    const toAdd = freeIds.slice(0, freeSlots);
    if (toAdd.length === 0) {
      showAlert({
        title: 'Внимание',
        message: 'Нет свободных объявлений для добавления или лимит исчерпан',
        buttons: [{ text: 'OK' }],
      });
    } else {
      setSelectedIds(prev => [...prev, ...toAdd]);
    }
  };

  // ===== ДОБАВЛЕНИЕ ВЫБРАННЫХ =====
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
            try {
              let successCount = 0;
              let errorCount = 0;
              for (const id of selectedIds) {
                try {
                  await api.post(`/subscriptions/${subscriptionId}/listings`, { listingId: id });
                  successCount++;
                } catch (e) {
                  errorCount++;
                }
              }
              if (errorCount > 0) {
                showAlert({
                  title: 'Частичный успех',
                  message: `Добавлено ${successCount}, ошибок ${errorCount}`,
                  buttons: [{ text: 'OK' }],
                });
              } else {
                showToast(`✅ Добавлено ${successCount} объявлений`);
              }
              setSelectedIds([]);
              await loadPackageListings();
              await loadAvailableListings(true);
            } catch (error) {
              showAlert({
                title: 'Ошибка',
                message: 'Не удалось добавить объявления',
                buttons: [{ text: 'OK' }],
              });
            }
          },
        },
      ],
    });
  };

  // ===== УДАЛЕНИЕ ИЗ ПАКЕТА =====
  const handleRemoveListing = (id, title) => {
    showAlert({
      title: 'Удалить из пакета',
      message: `Удалить "${title}" из пакета?`,
      buttons: [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/subscriptions/${subscriptionId}/listings/${id}`);
              showToast('Объявление удалено из пакета');
              await loadPackageListings();
              await loadAvailableListings(true);
            } catch (error) {
              showAlert({
                title: 'Ошибка',
                message: 'Не удалось удалить',
                buttons: [{ text: 'OK' }],
              });
            }
          },
        },
      ],
    });
  };

  // ===== РЕНДЕР =====
  const renderPackageItem = ({ item }) => (
    <View style={[styles.packageItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.itemInfo}>
        <Text style={[styles.itemTitle, { color: colors.text }]}>{item.title}</Text>
        <Text style={[styles.itemPrice, { color: colors.primary }]}>{item.price} ₽</Text>
      </View>
      <PressableButton
        title="Удалить"
        onPress={() => handleRemoveListing(item.id, item.title)}
        style={{ backgroundColor: '#ff3b30', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6 }}
        textStyle={{ fontSize: 14 }}
      />
    </View>
  );

  const renderAvailableItem = ({ item }) => {
    const isSelected = selectedIds.includes(item.id);
    const isInPackage = packageListings.some(p => p.id === item.id);
    const disabled = isInPackage;

    return (
      <TouchableOpacity
        style={[
          styles.availableItem,
          { backgroundColor: colors.card, borderColor: colors.border },
          isSelected && { borderColor: colors.primary, backgroundColor: colors.inputBackground },
          disabled && styles.disabledItem,
        ]}
        onPress={() => !disabled && toggleSelect(item.id)}
        disabled={disabled}
      >
        <View style={styles.itemInfo}>
          <Text style={[styles.itemTitle, { color: colors.text }]}>{item.title}</Text>
          <Text style={[styles.itemPrice, { color: colors.primary }]}>{item.price} ₽</Text>
        </View>
        {isSelected && <Text style={[styles.checkmark, { color: colors.primary }]}>✓</Text>}
        {isInPackage && <Text style={[styles.badge, { color: colors.secondaryText }]}>В пакете</Text>}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.secondaryText }]}>Загрузка...</Text>
      </View>
    );
  }

  const maxSlots = subscription?.max_slots || 10;
  const usedSlots = packageListings.length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.header, { color: colors.text }]}>Управление пакетом</Text>

      <View style={[styles.infoBar, { backgroundColor: colors.card }]}>
        <Text style={[styles.infoText, { color: colors.text }]}>
          Занято: {usedSlots} / {maxSlots} слотов
        </Text>
        <TouchableOpacity onPress={loadPackageListings}>
          <Text style={[styles.refreshText, { color: colors.primary }]}>Обновить</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Объявления в пакете</Text>
      {packageListings.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.secondaryText }]}>Нет объявлений</Text>
      ) : (
        <FlatList
          data={packageListings}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderPackageItem}
          scrollEnabled={false}
          style={styles.packageList}
        />
      )}

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Доступные объявления</Text>

      <TextInput
        style={[styles.searchInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
        placeholder="Поиск по названию..."
        placeholderTextColor={colors.secondaryText}
        onChangeText={debouncedSearch}
      />
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterBtn, { backgroundColor: colors.card, borderColor: colors.border }, filterType === 'all' && styles.activeFilter]}
          onPress={() => setFilterType('all')}
        >
          <Text style={[styles.filterText, { color: colors.text }]}>Все</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, { backgroundColor: colors.card, borderColor: colors.border }, filterType === 'sell' && styles.activeFilter]}
          onPress={() => setFilterType('sell')}
        >
          <Text style={[styles.filterText, { color: colors.text }]}>Продажа</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, { backgroundColor: colors.card, borderColor: colors.border }, filterType === 'rent' && styles.activeFilter]}
          onPress={() => setFilterType('rent')}
        >
          <Text style={[styles.filterText, { color: colors.text }]}>Аренда</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, { backgroundColor: colors.card, borderColor: colors.border }, filterStatus === 'active' && styles.activeFilter]}
          onPress={() => setFilterStatus('active')}
        >
          <Text style={[styles.filterText, { color: colors.text }]}>Активные</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, { backgroundColor: colors.card, borderColor: colors.border }, filterStatus === 'archived' && styles.activeFilter]}
          onPress={() => setFilterStatus('archived')}
        >
          <Text style={[styles.filterText, { color: colors.text }]}>Архив</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.selectionBar, { backgroundColor: colors.card }]}>
        <Text style={[styles.selectionText, { color: colors.text }]}>
          Выбрано: {selectedIds.length} / {maxSlots - usedSlots}
        </Text>
        <View style={styles.selectionActions}>
          <TouchableOpacity onPress={selectAll}>
            <Text style={[styles.actionText, { color: colors.primary }]}>Все</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={clearAll}>
            <Text style={[styles.actionText, { color: colors.primary }]}>Снять</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={selectFreeOnly}>
            <Text style={[styles.actionText, { color: colors.primary }]}>Свободные</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={availableListings}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderAvailableItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={() => loadAvailableListings(false)}
        onEndReachedThreshold={0.2}
        ListFooterComponent={
          loadingMore && <ActivityIndicator style={styles.loader} />
        }
        style={styles.availableList}
      />

      <PressableButton
        title={`Добавить выбранные (${selectedIds.length})`}
        onPress={handleAddSelected}
        disabled={selectedIds.length === 0}
        style={[styles.addButton, { backgroundColor: colors.primary }]}
        textStyle={{ fontSize: 16, fontWeight: '600' }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  infoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
  },
  refreshText: {
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
  },
  packageList: {
    marginBottom: 12,
  },
  packageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
  },
  itemPrice: {
    fontSize: 14,
  },
  searchInput: {
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  filterBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginRight: 6,
    marginBottom: 6,
    borderWidth: 1,
  },
  activeFilter: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  filterText: {
    fontSize: 14,
  },
  selectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  selectionText: {
    fontSize: 14,
  },
  selectionActions: {
    flexDirection: 'row',
  },
  actionText: {
    marginLeft: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  availableList: {
    flex: 1,
  },
  availableItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
  },
  disabledItem: {
    opacity: 0.5,
  },
  checkmark: {
    fontSize: 18,
    marginLeft: 8,
  },
  badge: {
    fontSize: 12,
    marginLeft: 8,
  },
  addButton: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 10,
  },
  loader: {
    padding: 20,
  },
});