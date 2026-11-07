// screens/SupportScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useAlert } from '../context/AlertContext';
import { useToast } from '../context/ToastContext';
import PressableButton from '../components/PressableButton';

const SupportScreen = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { showAlert } = useAlert();
  const { showToast } = useToast();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      showAlert({
        title: 'Ошибка',
        message: 'Заполните тему и текст сообщения.',
        buttons: [{ text: 'OK' }],
      });
      return;
    }

    setLoading(true);
    try {
      await api.post('/support/tickets', {
        subject: subject.trim(),
        message: message.trim(),
      });
      showToast('✅ Обращение отправлено');
      navigation.goBack();
    } catch (error) {
      console.warn('Ошибка отправки на сервер:', error);
      let errorMessage = 'Пожалуйста, напишите нам на почту: ironads@yandex.ru';
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error + '\n\n' + errorMessage;
      }
      showAlert({
        title: 'Не удалось отправить через приложение',
        message: errorMessage,
        buttons: [
          {
            text: 'Написать письмо',
            onPress: () => Linking.openURL('mailto:ironads@yandex.ru?subject=Обращение в поддержку'),
          },
          { text: 'ОК', style: 'cancel' },
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.title, { color: colors.text }]}>Служба поддержки</Text>
        <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
          Опишите вашу проблему или вопрос, и мы свяжемся с вами.
        </Text>

        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
          placeholder="Тема обращения"
          placeholderTextColor={colors.secondaryText}
          value={subject}
          onChangeText={setSubject}
          maxLength={100}
        />

        <TextInput
          style={[styles.input, styles.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
          placeholder="Подробно опишите ситуацию..."
          placeholderTextColor={colors.secondaryText}
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />

        <PressableButton
          title="Отправить"
          onPress={handleSend}
          loading={loading}
          style={{ marginTop: 8 }}
        />

        <PressableButton
          title="Или напишите нам на почту"
          onPress={() => Linking.openURL('mailto:ironads@yandex.ru')}
          style={{ backgroundColor: 'transparent', marginTop: 12 }}
          textStyle={{ color: colors.primary, fontSize: 16, textDecorationLine: 'underline' }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 30 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 14, marginBottom: 20 },
  input: { borderRadius: 8, padding: 14, fontSize: 16, borderWidth: 1, marginBottom: 16 },
  textArea: { minHeight: 120, paddingTop: 14 },
});

export default SupportScreen;