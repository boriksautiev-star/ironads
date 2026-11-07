// screens/ChatDetailScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Keyboard,
  Platform,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import api, { getUnreadCount } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useAlert } from '../context/AlertContext';
import { useToast } from '../context/ToastContext';
import LoadingIndicator from '../components/LoadingIndicator';

export default function ChatDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { chatId } = route.params;
  const { colors } = useTheme();
  const { showAlert } = useAlert();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const [currentUserId, setCurrentUserId] = useState(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const flatListRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const [lastMessageCount, setLastMessageCount] = useState(0);

  const [otherName, setOtherName] = useState(route.params?.otherName || 'Загрузка...');

  // Слушатели клавиатуры
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    );
    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );
    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);

  // Загрузка имени собеседника
  useEffect(() => {
    if (!route.params?.otherName && chatId) {
      const fetchChatInfo = async () => {
        try {
          const response = await api.get(`/chats/${chatId}`);
          const chat = response.data;
          const userJson = await AsyncStorage.getItem('user');
          let currentId = null;
          if (userJson) {
            const user = JSON.parse(userJson);
            currentId = user.id;
          }
          if (currentId) {
            const isBuyer = chat.buyer_id === currentId;
            const name = isBuyer ? chat.seller_name : chat.buyer_name;
            setOtherName(name || 'Пользователь');
          }
        } catch (e) {
          console.warn('Не удалось загрузить данные чата:', e);
          setOtherName('Чат');
        }
      };
      fetchChatInfo();
    }
  }, [chatId, route.params?.otherName]);

  useEffect(() => {
    navigation.setOptions({
      title: otherName,
    });
  }, [navigation, otherName]);

  const updateBadgeLocal = async () => {
    try {
      const data = await getUnreadCount();
      await Notifications.setBadgeCountAsync(data.count || 0);
    } catch (e) {}
  };

  const markMessagesAsRead = async () => {
    try {
      await api.post(`/chats/${chatId}/read`);
    } catch (error) {}
  };

  useEffect(() => {
    const getUserId = async () => {
      try {
        const userJson = await AsyncStorage.getItem('user');
        if (userJson) {
          const user = JSON.parse(userJson);
          setCurrentUserId(user.id);
        }
      } catch (e) {}
    };
    getUserId();
  }, []);

  useEffect(() => {
    if (chatId) {
      markMessagesAsRead();
      Notifications.setBadgeCountAsync(0);
      return () => {
        updateBadgeLocal();
      };
    }
  }, [chatId]);

  const fetchMessages = async (silent = false) => {
    if (!chatId) return;
    if (!silent) setLoading(true);
    try {
      const response = await api.get(`/chats/${chatId}/messages`);
      let messagesData = response.data;
      if (!Array.isArray(messagesData)) {
        messagesData = messagesData?.messages || [];
      }
      if (messagesData.length > lastMessageCount && lastMessageCount > 0) {
        setMessages(messagesData);
        setLastMessageCount(messagesData.length);
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 200);
      } else {
        setMessages(messagesData);
        setLastMessageCount(messagesData.length);
      }
      await updateBadgeLocal();
    } catch (err) {
      console.error(err);
      if (!silent) {
        showAlert({
          title: 'Ошибка',
          message: 'Не удалось загрузить сообщения',
          buttons: [{ text: 'OK' }],
        });
      }
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (currentUserId) {
      fetchMessages(false);
    }
  }, [chatId, currentUserId]);

  useFocusEffect(
    React.useCallback(() => {
      pollIntervalRef.current = setInterval(() => {
        if (chatId && !loading) {
          fetchMessages(true);
        }
      }, 3000);
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };
    }, [chatId, loading])
  );

  const refreshMessages = () => {
    setRefreshing(true);
    fetchMessages(false);
  };

  const isMyMessage = (msg) => {
    if (!currentUserId) return false;
    const senderId = msg.sender_id || msg.user_id || msg.from_user_id;
    return senderId === currentUserId;
  };

  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text) return;
    if (!chatId) {
      showAlert({
        title: 'Ошибка',
        message: 'Неизвестный чат',
        buttons: [{ text: 'OK' }],
      });
      return;
    }
    setSending(true);
    try {
      const response = await api.post(`/chats/${chatId}/messages`, { message: text });
      const newMsg = response.data;
      if (newMsg && newMsg.id) {
        setMessages(prev => [...prev, newMsg]);
        setLastMessageCount(prev => prev + 1);
        setInputText('');
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      } else {
        await fetchMessages(false);
      }
      setTimeout(() => {
        fetchMessages(true);
      }, 1000);
    } catch (err) {
      console.error(err);
      let errorMessage = 'Не удалось отправить сообщение';
      if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      }
      showAlert({
        title: 'Ошибка',
        message: errorMessage,
        buttons: [{ text: 'OK' }],
      });
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }) => {
    const my = isMyMessage(item);
    const text = item.text || item.message || '';
    const time = item.created_at || item.createdAt || '';
    const timeStr = time ? new Date(time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
    return (
      <View style={[styles.messageWrapper, my ? styles.myWrapper : styles.otherWrapper]}>
        <View style={[styles.messageBubble, my ? styles.myBubble : styles.otherBubble]}>
          <Text style={[styles.messageText, my ? styles.myText : styles.otherText]}>
            {text}
          </Text>
          {timeStr ? <Text style={[styles.messageTime, { color: my ? '#ddd' : '#8e8e93' }]}>{timeStr}</Text> : null}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <LoadingIndicator size={60} />
      </View>
    );
  }

  const bottomInset = insets.bottom || 0;
  const inputPaddingBottom = keyboardHeight > 0 ? keyboardHeight + 4 : bottomInset + 4;
  const listPaddingBottom = keyboardHeight > 0 ? keyboardHeight + 4 : bottomInset + 12;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.flex}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: listPaddingBottom },
          ]}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          refreshing={refreshing}
          onRefresh={refreshMessages}
        />
        <View style={[
          styles.inputContainer,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: inputPaddingBottom,
          }
        ]}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBackground,
                borderColor: colors.border,
                color: colors.text,
              }
            ]}
            placeholder="Сообщение..."
            placeholderTextColor={colors.secondaryText}
            value={inputText}
            onChangeText={setInputText}
            editable={!sending}
            multiline
            textAlignVertical="top"
            scrollEnabled={false}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              { backgroundColor: colors.primary },
              (sending || !inputText.trim()) && styles.sendButtonDisabled
            ]}
            onPress={sendMessage}
            disabled={sending || !inputText.trim()}
          >
            {sending ? (
              <LoadingIndicator size={24} color="#fff" />
            ) : (
              <Text style={styles.sendButtonText}>➤</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  listContent: { paddingHorizontal: 16, paddingBottom: 16 },
  messageWrapper: { marginVertical: 4, flexDirection: 'row' },
  myWrapper: { justifyContent: 'flex-end' },
  otherWrapper: { justifyContent: 'flex-start' },
  messageBubble: { maxWidth: '80%', padding: 12, borderRadius: 16 },
  myBubble: { backgroundColor: '#007AFF' },
  otherBubble: { backgroundColor: '#e5e5ea' },
  messageText: { fontSize: 16, lineHeight: 20 },
  myText: { color: '#fff' },
  otherText: { color: '#1c1c1e' },
  messageTime: { fontSize: 10, alignSelf: 'flex-end', marginTop: 4 },
  inputContainer: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 10, borderTopWidth: 1 },
  input: { flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, fontSize: 16 },
  sendButton: { justifyContent: 'center', alignItems: 'center', marginLeft: 10, borderRadius: 20, width: 44, height: 44 },
  sendButtonDisabled: { backgroundColor: '#ccc' },
  sendButtonText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
});