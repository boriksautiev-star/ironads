// screens/PlansScreen.js
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
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useAlert } from '../context/AlertContext';
import { useToast } from '../context/ToastContext';
import PressableButton from '../components/PressableButton';

export default function PlansScreen({ navigation }) {
  const { colors } = useTheme();
  const { showAlert } = useAlert();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [activeSubscriptions, setActiveSubscriptions] = useState([]);
  const [isPartner, setIsPartner] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const userResponse = await api.get('/auth/me');
      const userData = userResponse.data;
      setIsPartner(userData.is_partner === true);
      await AsyncStorage.setItem('user', JSON.stringify(userData));

      const plansResponse = await api.get('/subscriptions/plans');
      let plansData = plansResponse.data || [];

      const plansByType = {};
      plansData.forEach(plan => {
        const key = plan.type;
        if (!plansByType[key] || plan.duration > plansByType[key].duration) {
          plansByType[key] = plan;
        }
      });
      const uniquePlans = Object.values(plansByType);
      setPlans(uniquePlans);

      const subsResponse = await api.get('/subscriptions/my');
      setActiveSubscriptions(subsResponse.data || []);
    } catch (err) {
      console.error('❌ Ошибка загрузки данных:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchData();
    }, [])
  );

  const isPlanActive = (planType) => {
    return activeSubscriptions.some(
      (sub) => sub.package_type === planType && sub.is_active === true
    );
  };

  const getPlanDisplayName = (plan) => {
    if (plan.name) return plan.name;
    if (plan.type === 'listing') return 'Размещение';
    if (plan.type === 'renewal') return 'Продление';
    if (plan.type === 'autobump') return 'Автоподнятие';
    return plan.name || 'Тариф';
  };

  const getMaxSlots = (plan) => {
    return plan.max_slots || plan.slots || 5;
  };

  const handlePurchase = async (plan) => {
    showAlert({
      title: 'Покупка подписки',
      message: `Вы уверены, что хотите приобрести "${getPlanDisplayName(plan)}" за ${plan.price} ₽?`,
      buttons: [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Купить',
          onPress: async () => {
            try {
              await api.post('/subscriptions/purchase', { planId: plan.id });
              showToast('Подписка приобретена! ✅');
              fetchData();
              navigation.goBack();
            } catch (error) {
              showAlert({
                title: 'Ошибка',
                message: error.response?.data?.error || 'Не удалось приобрести подписку',
                buttons: [{ text: 'OK' }],
              });
            }
          },
        },
      ],
    });
  };

  const renderItem = ({ item }) => {
    const isActive = isPlanActive(item.type);
    const maxSlots = getMaxSlots(item);
    const displayName = getPlanDisplayName(item);
    const buttonText = isActive ? 'Докупить' : (item.price === 0 ? 'Активировать' : 'Купить');
    const isPartnerPlan = item.is_partner === true || item.for_partner === true;

    return (
      <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.shadow }, isActive && styles.activeCard]}>
        <Text style={[styles.planName, { color: colors.primary }]}>{displayName}</Text>
        <Text style={[styles.planPrice, { color: colors.primary }]}>
          {item.price === 0 ? 'Бесплатно' : `${item.price} ₽`}
        </Text>
        <Text style={[styles.planDuration, { color: colors.secondaryText }]}>Срок: {item.duration} дней</Text>
        <Text style={[styles.planSlots, { color: colors.text }]}>
          {isPartnerPlan ? '🤝 Партнёрский тариф' : '📦 Объявлений в пакете:'} {maxSlots}
        </Text>
        <Text style={[styles.planDescription, { color: colors.secondaryText }]}>{item.description || displayName}</Text>

        {isActive && (
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>✅ Активен</Text>
          </View>
        )}

        <PressableButton
          title={buttonText}
          onPress={() => handlePurchase(item)}
          style={{ marginTop: 10 }}
        />
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.secondaryText }]}>Загрузка тарифов...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: 'red' }]}>Ошибка загрузки: {error}</Text>
        <PressableButton
          title="Повторить"
          onPress={fetchData}
          style={{ marginTop: 16 }}
        />
      </View>
    );
  }

  if (plans.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyText, { color: colors.secondaryText }]}>Нет доступных тарифов</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {isPartner && (
        <View style={[styles.partnerBanner, { backgroundColor: '#ffd60a' }]}>
          <Text style={styles.partnerBannerText}>
            🤝 Вы партнёр. Вам доступны специальные условия.
          </Text>
        </View>
      )}

      <Text style={[styles.header, { color: colors.text }]}>Выберите тариф</Text>

      <FlatList
        data={plans}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 10, fontSize: 16 },
  errorText: { fontSize: 16, textAlign: 'center', marginBottom: 16 },
  emptyText: { fontSize: 18, textAlign: 'center' },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  list: { paddingBottom: 20 },
  partnerBanner: { padding: 12, borderRadius: 8, marginBottom: 16, alignItems: 'center' },
  partnerBannerText: { fontSize: 16, fontWeight: '600', color: '#1c1c1e' },
  card: { borderRadius: 10, padding: 16, marginBottom: 12, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  activeCard: { borderColor: '#34c759', borderWidth: 2 },
  planName: { fontSize: 22, fontWeight: 'bold', marginBottom: 2 },
  planPrice: { fontSize: 20, fontWeight: '700', marginTop: 4 },
  planDuration: { fontSize: 14, marginTop: 2 },
  planSlots: { fontSize: 14, fontWeight: '500', marginTop: 2 },
  planDescription: { fontSize: 14, marginTop: 4 },
  activeBadge: { marginTop: 8, paddingVertical: 4, paddingHorizontal: 12, backgroundColor: '#34c759', borderRadius: 20, alignSelf: 'flex-start' },
  activeBadgeText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});