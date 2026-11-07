// screens/FiltersScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';

export default function FiltersScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { colors } = useTheme();
  const currentFilters = route.params ? (route.params.filters || {}) : {};

  const [search, setSearch] = useState(currentFilters.search || '');
  const [categoryId, setCategoryId] = useState(currentFilters.categoryId || '');
  const [categoryName, setCategoryName] = useState(currentFilters.categoryName || '');
  const [regionId, setRegionId] = useState(currentFilters.regionId || '');
  const [regionName, setRegionName] = useState(currentFilters.regionName || '');
  const [cityId, setCityId] = useState(currentFilters.cityId || '');
  const [cityName, setCityName] = useState(currentFilters.cityName || '');
  const [priceFrom, setPriceFrom] = useState(currentFilters.priceFrom || '');
  const [priceTo, setPriceTo] = useState(currentFilters.priceTo || '');
  const [type, setType] = useState(currentFilters.type || 'sell');
  const [sort, setSort] = useState(currentFilters.sort || 'date_desc');
  const [onlyWithPhotos, setOnlyWithPhotos] = useState(currentFilters.onlyWithPhotos || false);

  useEffect(() => {
    if (regionId) {
      setCityId('');
      setCityName('');
    }
  }, [regionId]);

  const applyFilters = () => {
    const filters = {
      search,
      categoryId,
      categoryName,
      regionId,
      regionName,
      cityId,
      cityName,
      priceFrom,
      priceTo,
      type,
      sort,
      onlyWithPhotos,
    };
    navigation.replace('HomeScreen', { filters });
  };

  const resetFilters = () => {
    setSearch('');
    setCategoryId('');
    setCategoryName('');
    setRegionId('');
    setRegionName('');
    setCityId('');
    setCityName('');
    setPriceFrom('');
    setPriceTo('');
    setType('sell');
    setSort('date_desc');
    setOnlyWithPhotos(false);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.text }]}>Поиск</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
          placeholder="Введите текст"
          placeholderTextColor={colors.secondaryText}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.text }]}>Категория</Text>
        <TouchableOpacity
          style={[styles.selectButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() =>
            navigation.navigate('CategorySelect', {
              onSelect: (cat) => {
                setCategoryId(cat.id);
                setCategoryName(cat.name);
              },
            })
          }
        >
          <Text style={[styles.selectText, { color: colors.text }]}>{categoryName || 'Выберите категорию'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.text }]}>Регион</Text>
        <TouchableOpacity
          style={[styles.selectButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() =>
            navigation.navigate('RegionSelect', {
              onSelect: (region) => {
                setRegionId(region.id);
                setRegionName(region.name);
              },
            })
          }
        >
          <Text style={[styles.selectText, { color: colors.text }]}>{regionName || 'Выберите регион'}</Text>
        </TouchableOpacity>
      </View>

      {regionId ? (
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>Город (необязательно)</Text>
          <TouchableOpacity
            style={[styles.selectButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() =>
              navigation.navigate('CitySelect', {
                regionId: regionId,
                onSelect: (city) => {
                  setCityId(city.id);
                  setCityName(city.name);
                },
              })
            }
          >
            <Text style={[styles.selectText, { color: colors.text }]}>{cityName || 'Выберите город'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.row}>
        <View style={[styles.section, { flex: 1, marginRight: 8 }]}>
          <Text style={[styles.label, { color: colors.text }]}>Цена от</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            placeholder="0"
            placeholderTextColor={colors.secondaryText}
            keyboardType="numeric"
            value={priceFrom}
            onChangeText={setPriceFrom}
          />
        </View>
        <View style={[styles.section, { flex: 1, marginLeft: 8 }]}>
          <Text style={[styles.label, { color: colors.text }]}>Цена до</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            placeholder="∞"
            placeholderTextColor={colors.secondaryText}
            keyboardType="numeric"
            value={priceTo}
            onChangeText={setPriceTo}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.text }]}>Тип объявления</Text>
        <View style={styles.typeContainer}>
          {['sell', 'buy', 'exchange'].map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.typeButton, type === t && styles.typeButtonActive]}
              onPress={() => setType(t)}
            >
              <Text style={[styles.typeText, type === t && styles.typeTextActive]}>
                {t === 'sell' ? 'Продам' : t === 'buy' ? 'Куплю' : 'Обмен'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.text }]}>Сортировка</Text>
        <View style={styles.sortContainer}>
          {[
            { value: 'date_desc', label: 'Сначала новые' },
            { value: 'date_asc', label: 'Сначала старые' },
            { value: 'price_asc', label: 'По возрастанию цены' },
            { value: 'price_desc', label: 'По убыванию цены' },
          ].map((s) => (
            <TouchableOpacity
              key={s.value}
              style={[styles.sortButton, sort === s.value && styles.sortButtonActive]}
              onPress={() => setSort(s.value)}
            >
              <Text style={[styles.sortText, sort === s.value && styles.sortTextActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.switchRow}>
          <Text style={[styles.label, { color: colors.text }]}>Только с фото</Text>
          <Switch
            value={onlyWithPhotos}
            onValueChange={setOnlyWithPhotos}
            trackColor={{ false: '#767577', true: colors.tabBarActive }}
          />
        </View>
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity style={[styles.button, styles.resetButton]} onPress={resetFilters}>
          <Text style={styles.buttonText}>Сбросить</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.applyButton]} onPress={applyFilters}>
          <Text style={styles.buttonText}>Применить</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  section: { marginBottom: 16 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  input: { borderRadius: 8, padding: 12, fontSize: 16, borderWidth: 1 },
  selectButton: { borderRadius: 8, padding: 12, borderWidth: 1 },
  selectText: { fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  typeContainer: { flexDirection: 'row', justifyContent: 'space-around' },
  typeButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#e5e5ea' },
  typeButtonActive: { backgroundColor: '#667eea' },
  typeText: { fontSize: 14, color: '#1c1c1e' },
  typeTextActive: { color: '#ffffff', fontWeight: 'bold' },
  sortContainer: { flexWrap: 'wrap', flexDirection: 'row', justifyContent: 'space-between' },
  sortButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#e5e5ea', marginBottom: 8, width: '48%' },
  sortButtonActive: { backgroundColor: '#667eea' },
  sortText: { fontSize: 14, color: '#1c1c1e', textAlign: 'center' },
  sortTextActive: { color: '#ffffff', fontWeight: 'bold' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  buttons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, marginBottom: 30 },
  button: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginHorizontal: 8 },
  applyButton: { backgroundColor: '#667eea' },
  resetButton: { backgroundColor: '#e5e5ea' },
  buttonText: { fontSize: 16, fontWeight: 'bold', color: '#ffffff' },
});