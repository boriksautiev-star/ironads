// components/LoadingIndicator.js
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Text } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const LoadingIndicator = ({
  size = 60,
  color = null,
  style,
  fullScreen = false,
}) => {
  const { colors } = useTheme();
  const spinValue = useRef(new Animated.Value(0)).current;
  const tintColor = color || colors.primary;

  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spin.start();
    return () => spin.stop();
  }, []);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const containerStyle = fullScreen
    ? [styles.fullScreen, { backgroundColor: colors.background }]
    : null;

  return (
    <View style={[styles.container, containerStyle, style]}>
      <Animated.Text
        style={{
          fontSize: size,
          color: tintColor,
          transform: [{ rotate: spin }],
        }}
      >
        ⏳
      </Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreen: {
    flex: 1,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
});

export default LoadingIndicator;