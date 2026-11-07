// components/Skeleton.js
import React from 'react';
import { View, Dimensions } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const Skeleton = ({ width, height, borderRadius = 4, style }) => {
  const { colors } = useTheme();
  const backgroundColor = colors.skeleton || '#E1E9EE';
  return (
    <View style={[
      { width, height, borderRadius, backgroundColor },
      style,
    ]} />
  );
};

// Скелетон для карточки объявления (используется на Home, Favorites)
export const ListingSkeleton = () => {
  const { width } = Dimensions.get('window');
  const cardWidth = (width - 48) / 2;
  return (
    <View style={{ margin: 8, width: cardWidth }}>
      <Skeleton width={cardWidth} height={cardWidth * 0.75} borderRadius={8} />
      <Skeleton width={cardWidth * 0.8} height={16} style={{ marginTop: 8 }} />
      <Skeleton width={cardWidth * 0.6} height={14} style={{ marginTop: 4 }} />
      <Skeleton width={cardWidth * 0.4} height={20} style={{ marginTop: 4 }} />
    </View>
  );
};

// Скелетон для чата
export const ChatSkeleton = () => (
  <View style={{ flexDirection: 'row', padding: 16, alignItems: 'center' }}>
    <Skeleton width={50} height={50} borderRadius={25} />
    <View style={{ marginLeft: 12, flex: 1 }}>
      <Skeleton width="70%" height={16} />
      <Skeleton width="50%" height={14} style={{ marginTop: 6 }} />
    </View>
  </View>
);

// Скелетон для профиля (статистика и вкладки)
export const ProfileSkeleton = () => (
  <View style={{ padding: 16 }}>
    <View style={{ alignItems: 'center' }}>
      <Skeleton width={80} height={80} borderRadius={40} />
      <Skeleton width="60%" height={20} style={{ marginTop: 12 }} />
      <Skeleton width="40%" height={16} style={{ marginTop: 6 }} />
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginVertical: 20 }}>
      <Skeleton width={60} height={40} borderRadius={8} />
      <Skeleton width={60} height={40} borderRadius={8} />
    </View>
    <Skeleton width="100%" height={40} borderRadius={8} style={{ marginVertical: 10 }} />
    <Skeleton width="100%" height={40} borderRadius={8} />
  </View>
);