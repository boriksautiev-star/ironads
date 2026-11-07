// screens/RegionSelectScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';

export default function RegionSelectScreen({ navigation, route }) {
  const { colors } = useTheme();
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(route.params?.selectedId || null);

  useEffect(() => {
    fetchRegions();
  }, []);

  const fetchRegions = async () => {
    try {
      const response = await api.get('/cities/regions/all');
      setRegions(response.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (region) => {
    setSelectedId(region.id);
    if (route.params?.onSelect) {
      route.params.onSelect({ id: region.id, name: region.name });
    }
    navigation.goBack();
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.item, { backgroundColor: colors.card, borderColor: colors.border }, selectedId === item.id && styles.itemSelected]}
      onPress={() => handleSelect(item)}
    >
      <Text style={[styles.itemName, { color: colors.text }]}>{item.name}</Text>
      {selectedId === item.id && <Text style={[styles.checkMark, { color: colors.primary }]}>✓</Text>}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Выбор региона</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
          <Text style={[styles.closeButtonText, { color: colors.primary }]}>✕</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={regions}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: '600', flex: 1, textAlign: 'center' },
  closeButton: { padding: 8 },
  closeButtonText: { fontSize: 24 },
  list: { padding: 16 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, marginBottom: 8, borderWidth: 1 },
  itemSelected: { borderColor: '#007AFF', backgroundColor: '#f0f8ff' },
  itemName: { flex: 1, fontSize: 16 },
  checkMark: { fontSize: 18 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});