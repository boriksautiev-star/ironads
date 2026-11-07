// screens/PackageListingsScreen.js
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { useRoute, useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../services/api';
import { useCachedListings } from '../context/CachedListingsContext';
import { getImageUrl } from '../utils/imageUtils';
import AppCachedImage from '../components/AppCachedImage'; // заменено
import { useTheme } from '../context/ThemeContext';
import { useAlert } from '../context/AlertContext';
import { useToast } from '../context/ToastContext';
import PressableButton from '../components/PressableButton';

export default function PackageListingsScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { subscriptionId } = route.params;
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { showAlert } = useAlert();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listings, setListings] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [removingIds, setRemovingIds] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);

  const { getCached } = useCachedListings();

  const loadData = async () => {
    try {
      const [subRes, listRes] = await Promise.all([
        api.get(`/subscriptions/${subscriptionId}`),
        api.get(`/subscriptions/${subscriptionId}/listings`),
      ]);
      setSubscription(subRes.data);
      setListings(listRes.data || []);
    } catch (error) {
      showAlert({
        title: 'Ошибка',
        message: 'Не удалось загрузить данные пакета',
        buttons: [{ text: 'OK' }],
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
      return () => {
        setSelectionMode(false);
        setSelectedIds([]);
      };
    }, [subscriptionId])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
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

  const handleRemoveSingle = async (id, title) => {
    showAlert({
      title: 'Удалить из пакета',
      message: `Удалить "${title}" из пакета?`,
      buttons: [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            setRemovingIds(prev => [...prev, id]);
            try {
              await api.delete(`/subscriptions/${subscriptionId}/listings/${id}`);
              showToast('Объявление удалено из пакета');
              setListings(prev => prev.filter(item => item.id !== id));
              const subRes = await api.get(`/subscriptions/${subscriptionId}`);
              setSubscription(subRes.data);
            } catch (error) {
              showAlert({
                title: 'Ошибка',
                message: 'Не удалось удалить объявление',
                buttons: [{ text: 'OK' }],
              });
            } finally {
              setRemovingIds(prev => prev.filter(rid => rid !== id));
            }
          },
        },
      ],
    });
  };

  const handleRemoveSelected = async () => {
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
      message: `Удалить ${selectedIds.length} объявлений из пакета?`,
      buttons: [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            setRemovingIds(prev => [...prev, ...selectedIds]);
            let success = 0, errors = 0;
            for (const id of selectedIds) {
              try {
                await api.delete(`/subscriptions/${subscriptionId}/listings/${id}`);
                success++;
              } catch (e) {
                errors++;
              }
            }
            setRemovingIds(prev => prev.filter(id => !selectedIds.includes(id)));
            if (errors > 0) {
              showAlert({
                title: 'Частичный успех',
                message: `Удалено ${success}, ошибок ${errors}`,
                buttons: [{ text: 'OK' }],
              });
            } else {
              showToast(`✅ Удалено ${success} объявлений`);
            }
            setListings(prev => prev.filter(item => !selectedIds.includes(item.id)));
            const subRes = await api.get(`/subscriptions/${subscriptionId}`);
            setSubscription(subRes.data);
            setSelectedIds([]);
            setSelectionMode(false);
          },
        },
      ],
    });
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    const allIds = listings.map(item => item.id);
    setSelectedIds(allIds);
  };

  const clearAll = () => setSelectedIds([]);

  const renderItem = ({ item }) => {
    const isRemoving = removingIds.includes(item.id);
    const isSelected = selectedIds.includes(item.id);
    const imageUrl = getImageUrlWithCache(item);

    return (
      <TouchableOpacity
        style={[
          styles.item,
          { backgroundColor: colors.card, borderColor: colors.border },
          isSelected && { borderColor: colors.primary, backgroundColor: colors.inputBackground },
        ]}
        onPress={() => {
          if (selectionMode) {
            toggleSelect(item.id);
          }
        }}
        disabled={!selectionMode}
        activeOpacity={selectionMode ? 0.7 : 1}
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
        {selectionMode && (
          <View style={[styles.checkbox, { borderColor: colors.primary, backgroundColor: colors.card }]}>
            {isSelected && <Text style={[styles.checkmark, { color: colors.primary }]}>✓</Text>}
          </View>
        )}
        {!selectionMode && (
          <PressableButton
            title={isRemoving ? '' : 'Удалить'}
            onPress={() => handleRemoveSingle(item.id, item.title)}
            loading={isRemoving}
            style={{ backgroundColor: '#ff3b30', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, minWidth: 60 }}
            textStyle={{ fontSize: 14 }}
            disabled={isRemoving}
          />
        )}
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

  const maxSlots = subscription?.max_slots || 10;
  const usedSlots = listings.length;
  const freeSlots = maxSlots - usedSlots;
  const percentFilled = maxSlots > 0 ? (usedSlots / maxSlots) * 100 : 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.header, { color: colors.text }]}>Объявления в пакете</Text>

      <View style={[styles.slotsInfo, { backgroundColor: colors.card }]}>
        <Text style={[styles.slotsText, { color: colors.text }]}>
          Использовано {usedSlots} из {maxSlots} слотов
        </Text>
        <View style={[styles.progressBar, { backgroundColor: colors.inputBackground }]}>
          <View style={[styles.progressFill, { width: `${Math.min(percentFilled, 100)}%`, backgroundColor: colors.primary }]} />
        </View>
        <Text style={[styles.slotsFree, { color: colors.secondaryText }]}>Свободно: {freeSlots}</Text>
      </View>

      <View style={[styles.toolbar, { backgroundColor: colors.card }]}>
        <PressableButton
          title={selectionMode ? 'Отмена' : 'Выбрать'}
          onPress={() => {
            if (selectionMode) {
              setSelectedIds([]);
              setSelectionMode(false);
            } else {
              setSelectionMode(true);
            }
          }}
          style={{ backgroundColor: selectionMode ? colors.primary : colors.inputBackground, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 }}
          textStyle={{ color: selectionMode ? '#fff' : colors.text }}
        />

        {selectionMode && (
          <>
            <PressableButton
              title="Все"
              onPress={selectAll}
              style={{ backgroundColor: 'transparent', paddingVertical: 6, paddingHorizontal: 12 }}
              textStyle={{ color: colors.primary }}
            />
            <PressableButton
              title="Снять"
              onPress={clearAll}
              style={{ backgroundColor: 'transparent', paddingVertical: 6, paddingHorizontal: 12 }}
              textStyle={{ color: colors.primary }}
            />
            <PressableButton
              title={`Удалить (${selectedIds.length})`}
              onPress={handleRemoveSelected}
              disabled={selectedIds.length === 0}
              style={{ backgroundColor: '#ff3b30', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, opacity: selectedIds.length === 0 ? 0.5 : 1 }}
              textStyle={{ color: '#fff' }}
            />
          </>
        )}
      </View>

      <FlatList
        data={listings}
        keyExtractor={(item, index) => (item.id ? String(item.id) : `fallback-${index}`)}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.secondaryText }]}>В пакете нет объявлений</Text>}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
      />

      <PressableButton
        title="+ Добавить объявления"
        onPress={() => navigation.navigate('AvailableListings', { subscriptionId })}
        style={[styles.addButton, { backgroundColor: colors.primary }]}
        textStyle={{ fontSize: 16, fontWeight: '600' }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  slotsInfo: { borderRadius: 8, padding: 12, marginBottom: 12 },
  slotsText: { fontSize: 14, fontWeight: '500', marginBottom: 4 },
  progressBar: { height: 8, borderRadius: 4, overflow: 'hidden', marginVertical: 4 },
  progressFill: { height: '100%', borderRadius: 4 },
  slotsFree: { fontSize: 14, marginTop: 4 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 8, padding: 8, marginBottom: 12, gap: 6 },
  listContent: { paddingBottom: 20 },
  item: { flexDirection: 'row', borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, alignItems: 'center' },
  itemImage: { width: 50, height: 50, borderRadius: 6, marginRight: 10 },
  placeholderImage: { justifyContent: 'center', alignItems: 'center' },
  placeholderText: { fontSize: 20 },
  info: { flex: 1 },
  title: { fontSize: 16 },
  price: { fontSize: 14 },
  checkbox: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  checkmark: { fontSize: 18 },
  empty: { textAlign: 'center', marginTop: 20 },
  addButton: { position: 'absolute', left: 16, right: 16, paddingVertical: 14, borderRadius: 10, alignItems: 'center', bottom: 20 },
});