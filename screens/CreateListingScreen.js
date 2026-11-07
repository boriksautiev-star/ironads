// screens/CreateListingScreen.js
import React, { useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { createListing } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import PressableButton from '../components/PressableButton';
import LoadingIndicator from '../components/LoadingIndicator';

export default function CreateListingScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { showToast } = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceFrom, setPriceFrom] = useState('');
  const [priceTo, setPriceTo] = useState('');
  const [type, setType] = useState('sell');
  const [categoryId, setCategoryId] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [cityId, setCityId] = useState('');
  const [cityName, setCityName] = useState('');
  const [regionId, setRegionId] = useState('');
  const [regionName, setRegionName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [telegram, setTelegram] = useState('');
  const [showPhone, setShowPhone] = useState(true);
  const [showWhatsapp, setShowWhatsapp] = useState(true);
  const [showTelegram, setShowTelegram] = useState(true);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);

  const selectCategory = () => {
    navigation.navigate('CategorySelect', {
      selectedId: categoryId,
      onSelect: (category) => {
        setCategoryName(category.name);
        setCategoryId(category.id);
      },
    });
  };

  const selectRegion = () => {
    navigation.navigate('RegionSelect', {
      selectedId: regionId,
      onSelect: (region) => {
        setRegionName(region.name);
        setRegionId(region.id);
        setCityId('');
        setCityName('');
      },
    });
  };

  const selectCity = () => {
    if (!regionId) {
      showToast('Сначала выберите регион', 'error');
      return;
    }
    navigation.navigate('CitySelect', {
      regionId: regionId,
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
      quality: 0.5,
    });
    if (!result.canceled) {
      const newImages = result.assets.map(asset => ({
        uri: asset.uri,
        type: asset.mimeType || asset.type || 'image/jpeg',
        name: asset.fileName || `photo_${Date.now()}.jpg`,
      }));
      setImages(prev => [...prev, ...newImages].slice(0, 10));
    }
  };

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
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
    if (!regionId) {
      showToast('Выберите регион', 'error');
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
    if (regionId) formData.append('region_id', regionId);
    formData.append('type', type);
    formData.append('phone', phone.trim());
    formData.append('whatsapp', whatsapp.trim());
    formData.append('telegram', telegram.trim());
    formData.append('show_phone', String(showPhone));
    formData.append('show_whatsapp', String(showWhatsapp));
    formData.append('show_telegram', String(showTelegram));

    images.forEach((img) => {
      formData.append('media', { uri: img.uri, type: img.type, name: img.name });
    });

    setLoading(true);
    try {
      await createListing(formData, { timeout: 120000 });
      showToast('Объявление создано ✅', 'success');
      navigation.goBack();
    } catch (error) {
      console.error(error);
      let errorMessage = 'Не удалось создать объявление';
      if (error.code === 'ECONNABORTED') {
        errorMessage = 'Превышено время ожидания. Попробуйте уменьшить количество фото или их размер.';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

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
          <Text style={[styles.label, { color: colors.text }]}>Регион *</Text>
          <TouchableOpacity style={[styles.selector, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={selectRegion}>
            <Text style={[styles.selectorText, { color: colors.text }]}>{regionName || 'Выбрать регион'}</Text>
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

        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>Фото (до 10 шт.)</Text>
          <PressableButton
            title="📸 Выбрать фото"
            onPress={pickImage}
            style={{ backgroundColor: colors.inputBackground, paddingVertical: 12, borderRadius: 10, marginBottom: 8 }}
            textStyle={{ color: colors.primary, fontSize: 16 }}
          />
          <View style={styles.imageList}>
            {images.map((img, index) => (
              <View key={index} style={styles.imageItem}>
                <Image source={{ uri: img.uri }} style={styles.imagePreview} />
                <TouchableOpacity style={styles.removeImageButton} onPress={() => removeImage(index)}>
                  <Text style={styles.removeImageText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        <PressableButton
          title={loading ? '' : 'Опубликовать'}
          onPress={handleSubmit}
          loading={loading}
          disabled={loading}
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
  imagePreview: { width: 80, height: 80, borderRadius: 8 },
  imageItem: { position: 'relative', marginRight: 8, marginBottom: 8 },
  removeImageButton: { position: 'absolute', top: -4, right: -4, backgroundColor: 'rgba(255,0,0,0.8)', borderRadius: 12, width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },
  removeImageText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  submitButton: { borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 10, marginBottom: 30 },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
