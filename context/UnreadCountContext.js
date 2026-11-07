// context/UnreadCountContext.js
import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';

export const UnreadCountContext = createContext();

export const UnreadCountProvider = ({ children }) => {
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = async () => {
    try {
      const token = await AsyncStorage.getItem('jwtToken');
      if (!token) {
        setUnreadCount(0);
        return;
      }
      const response = await api.get('/chats/unread-count');
      setUnreadCount(response.data.count || 0);
    } catch (error) {
      console.log('Ошибка получения количества непрочитанных:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchUnreadCount();
    }, [])
  );

  return (
    <UnreadCountContext.Provider value={{ unreadCount, setUnreadCount, refetch: fetchUnreadCount }}>
      {children}
    </UnreadCountContext.Provider>
  );
};