// screens/CitySelectScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  SafeAreaView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';

export default function CitySelectScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { colors } = useTheme();
  const { regionId, onSelect } = route.params || {};

  const [cities, setCities] = useState([]);
  const [filteredCities, setFilteredCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualCityName, setManualCityName] = useState('');

  useEffect(() => {
    if (!regionId) {
      setError('Сначала выберите регион');
      setLoading(false);
      return;
    }
    fetchCities();
  }, [regionId]);

  const fetchCities = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/cities?region_id=${regionId}&limit=1000`);
      let citiesData = response.data || [];
      if (Array.isArray(citiesData) && citiesData.length > 0) {
        citiesData.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        setCities(citiesData);
        setFilteredCities(citiesData);
      } else {
        setCities([]);
        setFilteredCities([]);
        setManualMode(true);
      }
    } catch (err) {
      console.error('Ошибка загрузки городов:', err);
      setError('Не удалось загрузить города');
      setManualMode(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (search.trim()) {
      const filtered = cities.filter(city =>
        city.name.toLowerCase().includes(search.toLowerCase().trim())
      );
      setFilteredCities(filtered);
    } else {
      setFilteredCities(cities);
    }
  }, [search, cities]);

  const handleSelect = (city) => {
    if (onSelect) {
      onSelect({ id: city.id, name: city.name });
    }
    navigation.goBack();
  };

  const handleManualSelect = () => {
    const name = manualCityName.trim();
    if (!name) {
      Alert.alert('Внимание', 'Введите название города');
      return;
    }
    if (onSelect) {
      onSelect({ id: 0, name: name, manual: true });
    }
    navigation.goBack();
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={[styles.item, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => handleSelect(item)}>
      <Text style={[styles.itemText, { color: colors.text }]}>{item.name}</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.secondaryText }]}>Загрузка городов...</Text>
      </View>
    );
  }

  if (error || (cities.length === 0 && !manualMode)) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: 'red' }]}>{error || 'Города не найдены'}</Text>
        <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={() => { setManualMode(true); setError(null); }}>
          <Text style={styles.retryText}>Ввести вручную</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.retryButton, { marginTop: 8, backgroundColor: colors.inputBackground }]} onPress={() => navigation.goBack()}>
          <Text style={[styles.retryText, { color: colors.text }]}>Отмена</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (manualMode) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: colors.primary }]}>✕</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Введите город</Text>
        </View>
        <View style={styles.manualContainer}>
          <Text style={[styles.manualHint, { color: colors.text }]}>Введите название города вручную:</Text>
          <TextInput
            style={[styles.manualInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            placeholder="Например: Владикавказ"
            placeholderTextColor={colors.secondaryText}
            value={manualCityName}
            onChangeText={setManualCityName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleManualSelect}
          />
          <TouchableOpacity style={[styles.manualButton, { backgroundColor: colors.primary }]} onPress={handleManualSelect}>
            <Text style={styles.manualButtonText}>Выбрать</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.manualButton, styles.manualCancelButton, { backgroundColor: colors.inputBackground }]} onPress={() => navigation.goBack()}>
            <Text style={[styles.manualCancelButtonText, { color: colors.text }]}>Отмена</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: colors.primary }]}>✕</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Выбор города</Text>
      </View>

      <View style={[styles.searchContainer, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.inputBackground, color: colors.text }]}
          placeholder="Поиск города..."
          placeholderTextColor={colors.secondaryText}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {filteredCities.length === 0 ? (
        <View style={[styles.centered, { backgroundColor: colors.background }]}>
          <Text style={[styles.emptyText, { color: colors.secondaryText }]}>Города не найдены</Text>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={() => setManualMode(true)}>
            <Text style={styles.retryText}>Ввести вручную</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredCities}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backButton: { padding: 8 },
  backButtonText: { fontSize: 24 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '600', marginRight: 40 },
  searchContainer: { padding: 16, borderBottomWidth: 1 },
  searchInput: { borderRadius: 8, padding: 12, fontSize: 16 },
  list: { padding: 16 },
  item: { padding: 16, borderRadius: 8, marginBottom: 8, borderWidth: 1 },
  itemText: { fontSize: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 10, fontSize: 16 },
  errorText: { fontSize: 16, textAlign: 'center', marginBottom: 16 },
  retryButton: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8, marginTop: 8 },
  retryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  emptyText: { fontSize: 16, marginBottom: 16 },
  manualContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  manualHint: { fontSize: 16, textAlign: 'center', marginBottom: 20 },
  manualInput: { width: '100%', borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, marginBottom: 16 },
  manualButton: { paddingVertical: 12, paddingHorizontal: 40, borderRadius: 10, marginBottom: 8, width: '100%', alignItems: 'center' },
  manualButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  manualCancelButton: { },
  manualCancelButtonText: { fontSize: 16, fontWeight: '500' },
});