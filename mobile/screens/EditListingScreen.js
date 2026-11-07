// screens/EditListingScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Switch,
  Image,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import PressableButton from '../components/PressableButton';
import LoadingIndicator from '../components/LoadingIndicator';

const BASE_URL_IMAGES = 'https://ironads.ru';

export default function EditListingScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { id } = route.params;
  const { colors } = useTheme();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceFrom, setPriceFrom] = useState('');
  const [priceTo, setPriceTo] = useState('');
  const [type, setType] = useState('sell');
  const [categoryId, setCategoryId] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [cityId, setCityId] = useState('');
  const [cityName, setCityName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [telegram, setTelegram] = useState('');
  const [showPhone, setShowPhone] = useState(true);
  const [showWhatsapp, setShowWhatsapp] = useState(true);
  const [showTelegram, setShowTelegram] = useState(true);

  const [existingImages, setExistingImages] = useState([]);
  const [newImages, setNewImages] = useState([]);
  const [deletingMediaId, setDeletingMediaId] = useState(null);

  useEffect(() => {
    fetchListing();
  }, []);

  const fetchListing = async () => {
    try {
      const response = await api.get(`/listings/${id}`);
      const data = response.data;
      setTitle(data.title || '');
      setDescription(data.description || '');
      setPriceFrom(String(data.price || ''));
      setPriceTo(data.price_max ? String(data.price_max) : '');
      setType(data.type || 'sell');
      setCategoryId(data.category_id || '');
      setCategoryName(data.category_name || '');
      setCityId(data.city_id || '');
      setCityName(data.city_name || '');
      setPhone(data.phone || '');
      setWhatsapp(data.whatsapp || '');
      setTelegram(data.telegram || '');
      setShowPhone(data.show_phone !== undefined ? data.show_phone : true);
      setShowWhatsapp(data.show_whatsapp !== undefined ? data.show_whatsapp : true);
      setShowTelegram(data.show_telegram !== undefined ? data.show_telegram : true);
      setExistingImages(data.media || []);
    } catch (err) {
      console.error(err);
      showToast('Не удалось загрузить объявление', 'error');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const selectCategory = () => {
    navigation.navigate('CategorySelect', {
      selectedId: categoryId,
      onSelect: (category) => {
        setCategoryName(category.name);
        setCategoryId(category.id);
      },
    });
  };

  const selectCity = () => {
    navigation.navigate('CitySelect', {
      selectedId: cityId,
      onSelect: (city) => {
        setCityName(city.name);
        setCityId(city.id);
      },
    });
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast('Нужно разрешение на доступ к галерее', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (!result.canceled) {
      const newImagesArray = result.assets.map(asset => ({
        uri: asset.uri,
        type: asset.mimeType || asset.type || 'image/jpeg',
        name: asset.fileName || `photo_${Date.now()}.jpg`,
      }));
      setNewImages(prev => [...prev, ...newImagesArray].slice(0, 10 - existingImages.length));
    }
  };

  const removeNewImage = (index) => {
    setNewImages(prev => prev.filter((_, i) => i !== index));
  };

  const removeExistingImage = async (mediaId) => {
    setDeletingMediaId(mediaId);
    try {
      const fullUrl = `https://ironads.ru/api/listings/media/${mediaId}`;
      console.log(`🔍 Удаление фото: DELETE ${fullUrl}`);
      
      const token = await AsyncStorage.getItem('jwtToken');
      
      const response = await fetch(fullUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': '*/*',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      });
      
      if (response.ok) {
        setExistingImages(prev => prev.filter(img => img.id !== mediaId));
        showToast('Фото удалено ✅', 'success');
      } else {
        const text = await response.text();
        throw new Error(`Статус ${response.status}: ${text}`);
      }
    } catch (error) {
      console.error('❌ Ошибка удаления фото:', error.message);
      showToast('Не удалось удалить фото', 'error');
    } finally {
      setDeletingMediaId(null);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      showToast('Введите заголовок', 'error');
      return;
    }
    if (!priceFrom || isNaN(Number(priceFrom))) {
      showToast('Введите корректную цену (от)', 'error');
      return;
    }
    if (!categoryId) {
      showToast('Выберите категорию', 'error');
      return;
    }
    if (!cityId) {
      showToast('Выберите город', 'error');
      return;
    }
    if (!phone.trim() && !whatsapp.trim() && !telegram.trim()) {
      showToast('Укажите хотя бы один контакт', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('title', title.trim());
    formData.append('description', description.trim());
    formData.append('price', priceFrom);
    if (priceTo) formData.append('price_max', priceTo);
    formData.append('category_id', categoryId);
    formData.append('city_id', cityId);
    formData.append('type', type);
    formData.append('phone', phone.trim());
    formData.append('whatsapp', whatsapp.trim());
    formData.append('telegram', telegram.trim());
    formData.append('show_phone', String(showPhone));
    formData.append('show_whatsapp', String(showWhatsapp));
    formData.append('show_telegram', String(showTelegram));

    newImages.forEach((img) => {
      formData.append('media', { uri: img.uri, type: img.type, name: img.name });
    });

    setSaving(true);
    try {
      await api.put(`/listings/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showToast('Объявление обновлено ✅', 'success');
      navigation.goBack();
    } catch (error) {
      console.error('❌ Ошибка сохранения:', error);
      let errorMessage = 'Не удалось обновить объявление';
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }
      showToast(errorMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <LoadingIndicator size={60} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>Заголовок *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            placeholder="Например: Продам iPhone 13"
            placeholderTextColor={colors.secondaryText}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>Описание</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            placeholder="Подробное описание"
            placeholderTextColor={colors.secondaryText}
            multiline
            numberOfLines={4}
            value={description}
            onChangeText={setDescription}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>Цена *</Text>
          <View style={styles.priceRow}>
            <View style={[styles.priceInputWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.priceLabel, { color: colors.secondaryText }]}>от</Text>
              <TextInput
                style={[styles.priceInput, { color: colors.text }]}
                placeholder="0"
                placeholderTextColor={colors.secondaryText}
                keyboardType="numeric"
                value={priceFrom}
                onChangeText={setPriceFrom}
              />
            </View>
            <View style={[styles.priceInputWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.priceLabel, { color: colors.secondaryText }]}>до</Text>
              <TextInput
                style={[styles.priceInput, { color: colors.text }]}
                placeholder="необязательно"
                placeholderTextColor={colors.secondaryText}
                keyboardType="numeric"
                value={priceTo}
                onChangeText={setPriceTo}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>Тип</Text>
          <View style={[styles.segmentedControl, { backgroundColor: colors.inputBackground }]}>
            <TouchableOpacity
              style={[styles.segment, type === 'sell' && styles.segmentActive]}
              onPress={() => setType('sell')}
            >
              <Text style={[styles.segmentText, type === 'sell' && styles.segmentTextActive]}>Продажа</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segment, type === 'rent' && styles.segmentActive]}
              onPress={() => setType('rent')}
            >
              <Text style={[styles.segmentText, type === 'rent' && styles.segmentTextActive]}>Аренда</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>Категория *</Text>
          <TouchableOpacity style={[styles.selector, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={selectCategory}>
            <Text style={[styles.selectorText, { color: colors.text }]}>{categoryName || 'Выбрать категорию'}</Text>
            <Text style={[styles.selectorArrow, { color: colors.secondaryText }]}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>Город *</Text>
          <TouchableOpacity style={[styles.selector, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={selectCity}>
            <Text style={[styles.selectorText, { color: colors.text }]}>{cityName || 'Выбрать город'}</Text>
            <Text style={[styles.selectorArrow, { color: colors.secondaryText }]}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>Контакты *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            placeholder="Телефон"
            placeholderTextColor={colors.secondaryText}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            placeholder="WhatsApp (номер)"
            placeholderTextColor={colors.secondaryText}
            keyboardType="phone-pad"
            value={whatsapp}
            onChangeText={setWhatsapp}
          />
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            placeholder="Telegram (@username)"
            placeholderTextColor={colors.secondaryText}
            value={telegram}
            onChangeText={setTelegram}
          />
          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: colors.text }]}>Показывать телефон</Text>
            <Switch value={showPhone} onValueChange={setShowPhone} trackColor={{ false: '#767577', true: colors.tabBarActive }} />
          </View>
          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: colors.text }]}>Показывать WhatsApp</Text>
            <Switch value={showWhatsapp} onValueChange={setShowWhatsapp} trackColor={{ false: '#767577', true: colors.tabBarActive }} />
          </View>
          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: colors.text }]}>Показывать Telegram</Text>
            <Switch value={showTelegram} onValueChange={setShowTelegram} trackColor={{ false: '#767577', true: colors.tabBarActive }} />
          </View>
        </View>

        {existingImages.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.text }]}>Текущие фото</Text>
            <View style={styles.imageList}>
              {existingImages.map((img, index) => (
                <View key={index} style={styles.imageItem}>
                  <Image
                    source={{ uri: BASE_URL_IMAGES + img.file_path }}
                    style={styles.imagePreview}
                  />
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => removeExistingImage(img.id)}
                    disabled={deletingMediaId === img.id}
                  >
                    {deletingMediaId === img.id ? (
                      <LoadingIndicator size={20} color="#fff" />
                    ) : (
                      <Text style={styles.removeImageText}>✕</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>Добавить новые фото (до 10 шт.)</Text>
          <PressableButton
            title="📸 Выбрать фото"
            onPress={pickImage}
            style={{ backgroundColor: colors.inputBackground, paddingVertical: 12, borderRadius: 10, marginBottom: 8 }}
            textStyle={{ color: colors.primary, fontSize: 16 }}
          />
          <View style={styles.imageList}>
            {newImages.map((img, index) => (
              <View key={index} style={styles.imageItem}>
                <Image source={{ uri: img.uri }} style={styles.imagePreview} />
                <TouchableOpacity style={styles.removeImageButton} onPress={() => removeNewImage(index)}>
                  <Text style={styles.removeImageText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        <PressableButton
          title={saving ? '' : 'Сохранить изменения'}
          onPress={handleSubmit}
          loading={saving}
          disabled={saving}
          style={[styles.submitButton, { backgroundColor: colors.primary }]}
          textStyle={styles.submitButtonText}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  section: { marginBottom: 20 },
  label: { fontSize: 16, fontWeight: '500', marginBottom: 8 },
  input: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  textArea: { height: 100, textAlignVertical: 'top' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  priceInputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 2, marginRight: 8 },
  priceLabel: { fontSize: 16, marginRight: 8 },
  priceInput: { flex: 1, fontSize: 16, paddingVertical: 12 },
  segmentedControl: { flexDirection: 'row', borderRadius: 8, padding: 2 },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  segmentActive: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  segmentText: { fontSize: 16, fontWeight: '500', color: '#8e8e93' },
  segmentTextActive: { color: '#007AFF' },
  selector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14 },
  selectorText: { fontSize: 16 },
  selectorArrow: { fontSize: 24 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  switchLabel: { fontSize: 16 },
  imagePickerButton: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 8 },
  imagePickerText: { fontSize: 16 },
  imageList: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  imagePreview: { width: 80, height: 80, borderRadius: 8, marginRight: 8, marginBottom: 8 },
  imageItem: { position: 'relative', marginRight: 8, marginBottom: 8 },
  removeImageButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: 'rgba(255,0,0,0.85)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fff',
  },
  removeImageText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  submitButton: { borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 10, marginBottom: 30 },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});