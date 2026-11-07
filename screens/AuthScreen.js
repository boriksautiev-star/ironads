// screens/AuthScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { login, register } from '../services/auth';
import { useTheme } from '../context/ThemeContext';
import { useAlert } from '../context/AlertContext';
import { useAuth } from '../context/AuthContext';
import PressableButton from '../components/PressableButton';

export default function AuthScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { showAlert } = useAlert();
  const { updateUser } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!username || !password) {
      showAlert({
        title: 'Ошибка',
        message: 'Заполните все обязательные поля',
        buttons: [{ text: 'OK', onPress: () => navigation.goBack() }],
      });
      return;
    }
    if (!isLogin && !email) {
      showAlert({
        title: 'Ошибка',
        message: 'Для регистрации укажите email',
        buttons: [{ text: 'OK', onPress: () => navigation.goBack() }],
      });
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        const { user } = await login(username, password);
        updateUser(user);
        showAlert({
          title: 'Успех',
          message: 'Вы вошли в систему',
          buttons: [{ text: 'OK', onPress: () => navigation.goBack() }],
        });
      } else {
        const { user } = await register(username, email, password, phone);
        updateUser(user);
        showAlert({
          title: 'Успех',
          message: 'Регистрация завершена!',
          buttons: [{ text: 'OK', onPress: () => navigation.goBack() }],
        });
      }
    } catch (err) {
      showAlert({
        title: 'Ошибка',
        message: err.message || 'Неизвестная ошибка',
        buttons: [{ text: 'OK', onPress: () => navigation.goBack() }],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
          <Text style={[styles.title, { color: colors.text }]}>{isLogin ? 'Вход' : 'Регистрация'}</Text>

          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
            placeholder="Имя пользователя"
            placeholderTextColor={colors.secondaryText}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />

          {!isLogin && (
            <>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                placeholder="Email"
                placeholderTextColor={colors.secondaryText}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                placeholder="Телефон (необязательно)"
                placeholderTextColor={colors.secondaryText}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </>
          )}

          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
            placeholder="Пароль"
            placeholderTextColor={colors.secondaryText}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <PressableButton
            title={isLogin ? 'Войти' : 'Зарегистрироваться'}
            onPress={handleSubmit}
            loading={loading}
            style={{ marginTop: 8 }}
          />

          <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={styles.switchButton}>
            <Text style={[styles.switchText, { color: colors.primary }]}>
              {isLogin ? 'Нет аккаунта? Зарегистрируйтесь' : 'Уже есть аккаунт? Войдите'}
            </Text>
          </TouchableOpacity>

          <View style={styles.socialButtons}>
            <TouchableOpacity
              style={[styles.socialButton, styles.yandexButton]}
              onPress={() => navigation.navigate('OAuth', { provider: 'yandex' })}
            >
              <Text style={styles.socialButtonText}>Войти через Яндекс</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.socialButton, styles.vkButton]}
              onPress={() => navigation.navigate('OAuth', { provider: 'vk' })}
            >
              <Text style={styles.socialButtonText}>Войти через ВКонтакте</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: { borderRadius: 16, padding: 24, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  title: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 24 },
  input: { borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 16 },
  button: { borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  switchButton: { marginTop: 16, alignItems: 'center' },
  switchText: { fontSize: 16 },
  socialButtons: { marginTop: 16 },
  socialButton: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 10 },
  yandexButton: { backgroundColor: '#FC3F1D' },
  vkButton: { backgroundColor: '#2787F5' },
  socialButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});