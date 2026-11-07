// screens/RenewPackageScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useAlert } from '../context/AlertContext';
import { useToast } from '../context/ToastContext';
import PressableButton from '../components/PressableButton';

export default function RenewPackageScreen() {
  const route = useRoute();
  const { subscriptionId } = route.params;
  const { colors } = useTheme();
  const { showAlert } = useAlert();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [allListings, setAllListings] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [subscription, setSubscription] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const subRes = await api.get(`/subscriptions/${subscriptionId}`);
      setSubscription(subRes.data);
      const allRes = await api.get('/listings/my');
      setAllListings(allRes.data || []);
      const packageListings = await api.get(`/subscriptions/${subscriptionId}/listings`);
      const ids = packageListings.data.map(l => l.id);
      setSelectedIds(ids);
    } catch (error) {
      showAlert({
        title: 'Ошибка',
        message: 'Не удалось загрузить данные для продления',
        buttons: [{ text: 'OK' }],
      });
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchData();
    }, [subscriptionId])
  );

  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleRenew = async () => {
    if (selectedIds.length === 0) {
      showAlert({
        title: 'Ошибка',
        message: 'Выберите хотя бы одно объявление',
        buttons: [{ text: 'OK' }],
      });
      return;
    }
    try {
      await api.post(`/subscriptions/${subscriptionId}/renew`, { listingIds: selectedIds });
      showToast('Пакет продлён! ✅');
    } catch (error) {
      showAlert({
        title: 'Ошибка',
        message: error.response?.data?.error || 'Не удалось продлить',
        buttons: [{ text: 'OK' }],
      });
    }
  };

  const renderItem = ({ item }) => {
    const isSelected = selectedIds.includes(item.id);
    return (
      <TouchableOpacity
        style={[
          styles.item,
          { backgroundColor: colors.card, borderColor: colors.border },
          isSelected && { borderColor: colors.primary, backgroundColor: colors.inputBackground }
        ]}
        onPress={() => toggleSelect(item.id)}
      >
        <Text style={[styles.itemTitle, { color: colors.text }]}>{item.title}</Text>
        <Text style={[styles.itemPrice, { color: colors.primary }]}>{item.price} ₽</Text>
        {isSelected && <Text style={[styles.checkMark, { color: colors.primary }]}>✓</Text>}
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.header, { color: colors.text }]}>Продление пакета</Text>
      <Text style={[styles.subHeader, { color: colors.secondaryText }]}>Выберите объявления для продления</Text>
      <FlatList
        data={allListings}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
      <PressableButton
        title={`Продлить выбранные (${selectedIds.length})`}
        onPress={handleRenew}
        style={{ backgroundColor: '#34C759', paddingVertical: 14, borderRadius: 10, marginTop: 10 }}
        textStyle={{ fontSize: 16, fontWeight: '600' }}
        disabled={selectedIds.length === 0}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 16 },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  subHeader: { fontSize: 16, marginBottom: 16, textAlign: 'center' },
  list: { paddingBottom: 20 },
  item: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1 },
  itemTitle: { flex: 1, fontSize: 16 },
  itemPrice: { fontSize: 14, marginRight: 12 },
  checkMark: { fontSize: 18 },
});