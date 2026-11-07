// components/AnimatedHeart.js
import React, { useRef, useEffect } from 'react';
import { TouchableOpacity, Animated } from 'react-native';

const AnimatedHeart = ({ isFavorite, onPress, size = 28 }) => {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isFavorite) {
      // Анимация появления ❤️
      Animated.spring(scale, {
        toValue: 1.3,
        friction: 3,
        useNativeDriver: true,
      }).start(() => {
        Animated.spring(scale, {
          toValue: 1,
          friction: 3,
          useNativeDriver: true,
        }).start();
      });
    }
  }, [isFavorite]);

  const handlePress = () => {
    // Анимация при нажатии
    Animated.sequence([
      Animated.spring(scale, {
        toValue: 0.7,
        friction: 5,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1.2,
        friction: 5,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
      <Animated.Text
        style={{
          fontSize: size,
          transform: [{ scale }],
        }}
      >
        {isFavorite ? '❤️' : '🤍'}
      </Animated.Text>
    </TouchableOpacity>
  );
};

export default AnimatedHeart;