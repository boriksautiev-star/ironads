// screens/ChatScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMessages, sendMessage, markChatAsRead } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useAlert } from '../context/AlertContext';
import { useToast } from '../context/ToastContext';
import PressableButton from '../components/PressableButton';
import moment from 'moment';

export default function ChatScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { chatId, otherUser } = route.params;
  const { colors } = useTheme();
  const { showAlert } = useAlert();
  const { showToast } = useToast();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  const flatListRef = useRef(null);

  useEffect(() => {
    navigation.setOptions({
      title: otherUser?.username || 'Чат',
    });
  }, [otherUser]);

  useEffect(() => {
    const getUserId = async () => {
      const userJson = await AsyncStorage.getItem('user');
      if (userJson) {
        const user = JSON.parse(userJson);
        setCurrentUserId(user.id);
      }
    };
    getUserId();
    fetchMessages(true);
    markAsRead();
  }, [chatId]);

  const fetchMessages = async (reset = false) => {
    if (reset) {
      setPage(1);
      setHasMore(true);
      setMessages([]);
      setLoading(true);
    }
    try {
      const data = await getMessages(chatId, reset ? 1 : page, 50);
      if (data.messages) {
        if (reset) {
          setMessages(data.messages);
          if (data.messages.length > 0 && flatListRef.current) {
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
          }
        } else {
          setMessages(prev => [...data.messages, ...prev]);
        }
        setHasMore(data.hasMore || false);
        if (!reset && data.messages.length > 0) {
          setPage(prev => prev + 1);
        }
      }
    } catch (error) {
      console.error('Ошибка загрузки сообщений:', error);
      showAlert({
        title: 'Ошибка',
        message: 'Не удалось загрузить сообщения',
        buttons: [{ text: 'OK' }],
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const markAsRead = async () => {
    try {
      await markChatAsRead(chatId);
    } catch (error) {
      console.error('Ошибка отметки прочитанных:', error);
    }
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text) return;

    setSending(true);
    try {
      const newMessage = await sendMessage(chatId, text);
      setMessages(prev => [...prev, newMessage]);
      setInputText('');
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Ошибка отправки:', error);
      showAlert({
        title: 'Ошибка',
        message: 'Не удалось отправить сообщение',
        buttons: [{ text: 'OK' }],
      });
    } finally {
      setSending(false);
    }
  };

  const loadMore = () => {
    if (hasMore && !loading && messages.length > 0) {
      fetchMessages(false);
    }
  };

  const renderMessage = ({ item }) => {
    const isMine = item.sender_id === currentUserId;

    return (
      <View style={[styles.messageRow, isMine ? styles.myRow : styles.otherRow]}>
        <View style={[styles.messageBubble, isMine ? styles.myBubble : styles.otherBubble]}>
          <Text style={[styles.messageText, isMine && styles.myMessageText]}>
            {item.text}
          </Text>
          <Text style={[styles.messageTime, isMine && styles.myMessageTime]}>
            {moment(item.created_at).format('HH:mm')}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.secondaryText }]}>Загрузка сообщений...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            fetchMessages(true);
          }}
          inverted
        />
        <View style={[styles.inputContainer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
            placeholder="Сообщение..."
            placeholderTextColor={colors.secondaryText}
            value={inputText}
            onChangeText={setInputText}
            multiline
          />
          <PressableButton
            title="➤"
            onPress={handleSend}
            loading={sending}
            disabled={!inputText.trim() || sending}
            style={[styles.sendButton, { backgroundColor: colors.primary }, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
            textStyle={{ fontSize: 20, color: '#fff' }}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  messagesList: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  myRow: {
    justifyContent: 'flex-end',
  },
  otherRow: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 16,
  },
  myBubble: {
    backgroundColor: '#007AFF',
  },
  otherBubble: {
    backgroundColor: '#e5e5ea',
  },
  messageText: {
    fontSize: 16,
    color: '#1c1c1e',
  },
  myMessageText: {
    color: '#fff',
  },
  messageTime: {
    fontSize: 10,
    color: '#8e8e93',
    marginTop: 2,
    alignSelf: 'flex-end',
  },
  myMessageTime: {
    color: 'rgba(255,255,255,0.7)',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 16,
    maxHeight: 100,
  },
  sendButton: {
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});