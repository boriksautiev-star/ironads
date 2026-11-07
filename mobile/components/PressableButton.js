// components/PressableButton.js
import React, { useRef } from 'react';
import { Pressable, Animated, Text, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const PressableButton = ({
  onPress,
  title,
  loading = false,
  disabled = false,
  style,
  textStyle,
  loadingColor = '#fff',
  ...props
}) => {
  const { colors } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.92,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  const backgroundColor = disabled
    ? colors.disabled || '#ccc'
    : style?.backgroundColor || colors.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={({ pressed }) => [
        {
          backgroundColor,
          borderRadius: 8,
          paddingVertical: 12,
          paddingHorizontal: 24,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.8 : 1,
        },
        style,
      ]}
      {...props}
    >
      <Animated.View style={{ transform: [{ scale: scaleAnim }], flexDirection: 'row', alignItems: 'center' }}>
        {loading ? (
          <ActivityIndicator color={loadingColor} />
        ) : (
          <Text style={[{ color: '#fff', fontSize: 16, fontWeight: '600' }, textStyle]}>
            {title}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
};

export default PressableButton;