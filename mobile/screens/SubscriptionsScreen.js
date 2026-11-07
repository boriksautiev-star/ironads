// screens/SubscriptionsScreen.js
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useAlert } from '../context/AlertContext';
import { useToast } from '../context/ToastContext';
import PressableButton from '../components/PressableButton';

export default function SubscriptionsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { showAlert } = useAlert();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [subscriptions, setSubscriptions] = useState([]);

  const fetchSubscriptions = async () => {
    setLoading(true);
    try {
      const response = await api.get('/subscriptions/my');
      setSubscriptions(response.data || []);
    } catch (error) {
      console.error('Ошибка загрузки подписок:', error);
      showAlert({
        title: 'Ошибка',
        message: 'Не удалось загрузить подписки',
        buttons: [{ text: 'OK' }],
      });
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchSubscriptions();
    }, [])
  );

  const handleCancel = async (id) => {
    showAlert({
      title: 'Отмена подписки',
      message: 'Вы уверены, что хотите отменить подписку?',
      buttons: [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Отменить',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post(`/subscriptions/${id}/cancel`);
              showToast('Подписка отменена');
              fetchSubscriptions();
            } catch (error) {
              showAlert({
                title: 'Ошибка',
                message: 'Не удалось отменить подписку',
                buttons: [{ text: 'OK' }],
              });
            }
          },
        },
      ],
    });
  };

  const renderItem = ({ item }) => {
    const endDate = new Date(item.end_date);
    const now = new Date();
    const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
    const used = item.listings_count || 0;
    const max = item.max_slots || 0;
    const percent = max > 0 ? (used / max) * 100 : 0;

    return (
      <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
        <Text style={[styles.packageName, { color: colors.text }]}>
          {item.package_type === 'listing' && 'Размещение'}
          {item.package_type === 'renewal' && 'Продление'}
          {item.package_type === 'autobump' && 'Автоподнятие'}
        </Text>

        <View style={styles.slotsContainer}>
          <Text style={[styles.slotsText, { color: colors.secondaryText }]}>
            Занято: {used} / {max} слотов
          </Text>
          <View style={[styles.progressBar, { backgroundColor: colors.inputBackground }]}>
            <View style={[styles.progressFill, { width: `${Math.min(percent, 100)}%`, backgroundColor: colors.primary }]} />
          </View>
        </View>

        <Text style={[styles.info, { color: colors.secondaryText }]}>
          Действует до: {new Date(item.end_date).toLocaleDateString()}
        </Text>
        <Text style={[styles.daysLeft, daysLeft < 3 && styles.daysWarning, { color: daysLeft < 3 ? '#ff3b30' : '#34c759' }]}>
          {daysLeft > 0 ? `Осталось ${daysLeft} дней` : 'Истекла'}
        </Text>

        <View style={styles.actions}>
          <PressableButton
            title="Управлять"
            onPress={() => navigation.navigate('PackageListings', { subscriptionId: item.id })}
            style={{ backgroundColor: colors.primary, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6, flex: 1, marginRight: 6 }}
            textStyle={{ fontSize: 14 }}
          />
          <PressableButton
            title="Продлить"
            onPress={() => navigation.navigate('RenewPackage', { subscriptionId: item.id })}
            style={{ backgroundColor: '#34c759', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6, flex: 1, marginHorizontal: 6 }}
            textStyle={{ fontSize: 14 }}
          />
          <PressableButton
            title="Отменить"
            onPress={() => handleCancel(item.id)}
            style={{ backgroundColor: '#ff3b30', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6, flex: 1, marginLeft: 6 }}
            textStyle={{ fontSize: 14 }}
          />
        </View>
      </View>
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

  if (subscriptions.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyText, { color: colors.secondaryText }]}>У вас нет активных подписок</Text>
        <PressableButton
          title="Купить подписку"
          onPress={() => navigation.navigate('Plans')}
          style={{ marginTop: 16, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 }}
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={subscriptions}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
      />
      <PressableButton
        title="+ Тарифы"
        onPress={() => navigation.navigate('Plans')}
        style={[styles.fab, { backgroundColor: colors.primary }]}
        textStyle={{ fontSize: 16, fontWeight: '600' }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 10, fontSize: 16 },
  emptyText: { fontSize: 16, textAlign: 'center', marginBottom: 20 },
  list: { padding: 16 },
  card: { borderRadius: 10, padding: 16, marginBottom: 12, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  packageName: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  slotsContainer: { marginVertical: 6 },
  slotsText: { fontSize: 14, marginBottom: 2 },
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  info: { fontSize: 14, marginVertical: 2 },
  daysLeft: { fontSize: 14, fontWeight: '500', marginVertical: 6 },
  daysWarning: { color: '#ff3b30' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
});