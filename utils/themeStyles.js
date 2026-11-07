// utils/themeStyles.js
import { StyleSheet } from 'react-native';

// Базовые стили, зависящие от темы
export const getThemeStyles = (colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  text: {
    color: colors.text,
  },
  secondaryText: {
    color: colors.secondaryText,
  },
  border: {
    borderColor: colors.border,
  },
  input: {
    backgroundColor: colors.inputBackground,
    color: colors.text,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.primary,
  },
  buttonText: {
    color: '#fff',
  },
  tabBar: {
    backgroundColor: colors.tabBarBackground,
    borderTopColor: colors.border,
  },
});