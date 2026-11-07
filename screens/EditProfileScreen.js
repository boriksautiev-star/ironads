// screens/EditProfileScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { unlinkSocial } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useAlert } from '../context/AlertContext';
import { useToast } from '../context/ToastContext';
import PressableButton from '../components/PressableButton';

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { showAlert } = useAlert();
  const { showToast } = useToast();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const userJson = await AsyncStorage.getItem('user');
      if (userJson) {
        const userData = JSON.parse(userJson);
        setUser(userData);
        setUsername(userData.username || '');
        setEmail(userData.email || '');
        setPhone(userData.phone || '');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async () => {
    if (!username.trim()) {
      showAlert({
        title: 'Ошибка',
        message: 'Имя пользователя обязательно',
        buttons: [{ text: 'OK' }],
      });
      return;
    }
    if (!email.trim()) {
      showAlert({
        title: 'Ошибка',
        message: 'Email обязателен',
        buttons: [{ text: 'OK' }],
      });
      return;
    }

    setLoading(true);
    try {
      const updateData = { username, email, phone };
      if (password.trim()) {
        updateData.password = password.trim();
      }
      await api.put('/auth/profile', updateData);
      const userJson = await AsyncStorage.getItem('user');
      if (userJson) {
        const userData = JSON.parse(userJson);
        const updatedUser = { ...userData, username, email, phone };
        await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
        setUser(updatedUser);
      }
      showToast('Профиль обновлён ✅');
      navigation.goBack();
    } catch (error) {
      console.error(error);
      let errorMessage = 'Не удалось обновить профиль';
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }
      showAlert({
        title: 'Ошибка',
        message: errorMessage,
        buttons: [{ text: 'OK' }],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLinkSocial = (provider) => {
    navigation.navigate('OAuth', { provider, mode: 'link' });
  };

  const handleUnlinkSocial = async (provider) => {
    showAlert({
      title: 'Отвязать соцсеть',
      message: `Вы уверены, что хотите отвязать ${provider === 'yandex' ? 'Яндекс' : 'ВКонтакте'}?`,
      buttons: [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Отвязать',
          style: 'destructive',
          onPress: async () => {
            try {
              await unlinkSocial(provider);
              showToast('Соцсеть отвязана');
              const response = await api.get('/auth/me');
              await AsyncStorage.setItem('user', JSON.stringify(response.data));
              setUser(response.data);
            } catch (err) {
              console.error(err);
              showAlert({
                title: 'Ошибка',
                message: 'Не удалось отвязать соцсеть',
                buttons: [{ text: 'OK' }],
              });
            }
          },
        },
      ],
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Редактирование профиля</Text>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text }]}>Имя пользователя *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            value={username}
            onChangeText={setUsername}
            placeholder="Ваше имя"
            placeholderTextColor={colors.secondaryText}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text }]}>Email *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            value={email}
            onChangeText={setEmail}
            placeholder="example@mail.com"
            placeholderTextColor={colors.secondaryText}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text }]}>Телефон</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            value={phone}
            onChangeText={setPhone}
            placeholder="+7 999 123-45-67"
            placeholderTextColor={colors.secondaryText}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text }]}>Новый пароль (оставьте пустым, чтобы не менять)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            value={password}
            onChangeText={setPassword}
            placeholder="Новый пароль"
            placeholderTextColor={colors.secondaryText}
            secureTextEntry
          />
        </View>

        <View style={[styles.socialSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.socialTitle, { color: colors.text }]}>Привязка социальных сетей</Text>

          <View style={[styles.socialRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.socialLabel, { color: colors.text }]}>Яндекс</Text>
            {user?.yandex_id ? (
              <TouchableOpacity style={[styles.socialButton, styles.unlinkButton]} onPress={() => handleUnlinkSocial('yandex')}>
                <Text style={styles.socialButtonText}>Отвязать</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.socialButton, { backgroundColor: colors.primary }]} onPress={() => handleLinkSocial('yandex')}>
                <Text style={styles.socialButtonText}>Привязать</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.socialRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.socialLabel, { color: colors.text }]}>ВКонтакте</Text>
            {user?.vk_id ? (
              <TouchableOpacity style={[styles.socialButton, styles.unlinkButton]} onPress={() => handleUnlinkSocial('vk')}>
                <Text style={styles.socialButtonText}>Отвязать</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.socialButton, { backgroundColor: colors.primary }]} onPress={() => handleLinkSocial('vk')}>
                <Text style={styles.socialButtonText}>Привязать</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <PressableButton
          title="Сохранить"
          onPress={handleSave}
          loading={loading}
          style={{ marginTop: 10 }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' },
  field: { marginBottom: 16 },
  label: { fontSize: 16, fontWeight: '500', marginBottom: 6 },
  input: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  socialSection: { marginTop: 20, marginBottom: 16, borderRadius: 10, padding: 16, borderWidth: 1 },
  socialTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  socialRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1 },
  socialLabel: { fontSize: 16 },
  socialButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  unlinkButton: { backgroundColor: '#ff3b30' },
  socialButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});