// components/SkeletonCard.js
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

const SkeletonCard = () => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={styles.image} />
      <View style={styles.content}>
        <View style={styles.title} />
        <View style={styles.price} />
        <View style={styles.meta} />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#e0e0e0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    height: 120,
    alignItems: 'center',
  },
  image: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#c0c0c0',
    marginRight: 12,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
  },
  title: {
    height: 16,
    width: '80%',
    borderRadius: 4,
    backgroundColor: '#c0c0c0',
    marginBottom: 8,
  },
  price: {
    height: 14,
    width: '50%',
    borderRadius: 4,
    backgroundColor: '#c0c0c0',
    marginBottom: 8,
  },
  meta: {
    height: 12,
    width: '60%',
    borderRadius: 4,
    backgroundColor: '#c0c0c0',
  },
});

export default SkeletonCard;