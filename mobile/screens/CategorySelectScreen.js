// screens/CategorySelectScreen.js
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

export default function CategorySelectScreen({ navigation, route }) {
  const { colors } = useTheme();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(route.params?.selectedId || null);
  const [parentId, setParentId] = useState(route.params?.parentId || null);
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [loadingChildren, setLoadingChildren] = useState(false);

  useEffect(() => {
    fetchCategories(parentId);
  }, [parentId]);

  const fetchCategories = async (parent) => {
    setLoading(true);
    try {
      const response = await api.get('/categories', { params: { parent_id: parent } });
      setItems(response.data);
    } catch (err) {
      console.error('Ошибка загрузки категорий:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (item) => {
    setLoadingChildren(true);
    try {
      const response = await api.get('/categories', { params: { parent_id: item.id } });
      const children = response.data || [];

      if (children.length > 0) {
        setParentId(item.id);
        setBreadcrumb([...breadcrumb, item]);
        setItems(children);
      } else {
        setSelectedId(item.id);
        if (route.params?.onSelect) {
          route.params.onSelect({ id: item.id, name: item.name });
        }
        navigation.goBack();
      }
    } catch (err) {
      console.error('Ошибка загрузки подкатегорий:', err);
      setSelectedId(item.id);
      if (route.params?.onSelect) {
        route.params.onSelect({ id: item.id, name: item.name });
      }
      navigation.goBack();
    } finally {
      setLoadingChildren(false);
    }
  };

  const goBackLevel = () => {
    const newBreadcrumb = [...breadcrumb];
    newBreadcrumb.pop();
    const prev = newBreadcrumb.length > 0 ? newBreadcrumb[newBreadcrumb.length - 1] : null;
    setBreadcrumb(newBreadcrumb);
    setParentId(prev ? prev.id : null);
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.item, { backgroundColor: colors.card, borderColor: colors.border }, selectedId === item.id && styles.itemSelected]}
      onPress={() => handleSelect(item)}
      disabled={loadingChildren}
    >
      <Text style={styles.itemIcon}>{item.icon || '📁'}</Text>
      <Text style={[styles.itemName, { color: colors.text }]}>{item.name}</Text>
      {loadingChildren ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Text style={[styles.arrow, { color: colors.secondaryText }]}>›</Text>
      )}
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: colors.primary }]}>✕</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].name : 'Выбор категории'}
        </Text>
        {breadcrumb.length > 0 && (
          <TouchableOpacity onPress={goBackLevel} style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: colors.primary }]}>←</Text>
          </TouchableOpacity>
        )}
      </View>

      {loadingChildren && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.secondaryText }]}>Загрузка подкатегорий...</Text>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(item, index) => (item.id ? String(item.id) : `fallback-${index}`)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backButton: { padding: 8 },
  backButtonText: { fontSize: 24 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '600' },
  list: { padding: 16 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, marginBottom: 8, borderWidth: 1 },
  itemSelected: { borderColor: '#007AFF', backgroundColor: '#f0f8ff' },
  itemIcon: { fontSize: 24, marginRight: 12 },
  itemName: { flex: 1, fontSize: 16 },
  arrow: { fontSize: 24 },
  checkMark: { fontSize: 18, color: '#007AFF' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  loadingText: { marginTop: 10, fontSize: 16 },
});