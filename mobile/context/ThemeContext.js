// context/ThemeContext.js
import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ThemeContext = createContext();

const lightColors = {
  background: '#f2f2f7',
  card: '#ffffff',
  text: '#1c1c1e',
  secondaryText: '#8e8e93',
  border: '#e5e5ea',
  primary: '#007AFF',
  shadow: 'rgba(0,0,0,0.05)',
  inputBackground: '#f0f0f5',
  tabBarBackground: '#ffffff',
  tabBarActive: '#667eea',
  tabBarInactive: 'gray',
};

const darkColors = {
  background: '#1c1c1e',
  card: '#2c2c2e',
  text: '#ffffff',
  secondaryText: '#8e8e93',
  border: '#38383a',
  primary: '#007AFF',
  shadow: 'rgba(0,0,0,0.3)',
  inputBackground: '#3a3a3c',
  tabBarBackground: '#1c1c1e',
  tabBarActive: '#667eea',
  tabBarInactive: '#8e8e93',
};

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const saved = await AsyncStorage.getItem('userTheme');
        if (saved === 'dark') setIsDark(true);
        else setIsDark(false);
      } catch (e) {}
    };
    loadTheme();
  }, []);

  const toggleTheme = async (dark) => {
    setIsDark(dark);
    await AsyncStorage.setItem('userTheme', dark ? 'dark' : 'light');
  };

  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};