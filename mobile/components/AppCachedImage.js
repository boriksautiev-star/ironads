// components/AppCachedImage.js
import React, { useState } from 'react';
import { Image as ExpoImage } from 'expo-image';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const AppCachedImage = ({
  uri,
  style,
  resizeMode = 'cover',
  transition = 200,
  showLoading = true,
  ...props
}) => {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  console.log('AppCachedImage uri:', uri); // для отладки

  if (!uri) {
    return (
      <View style={[style, { backgroundColor: colors.inputBackground, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[style, { overflow: 'hidden', position: 'relative' }]}>
      <ExpoImage
        source={{ uri }}
        style={{ width: '100%', height: '100%' }}
        contentFit={resizeMode}
        transition={transition}
        cacheKey={uri}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={(e) => {
          console.error('Image load error:', e);
          setError(true);
          setLoading(false);
        }}
        {...props}
      />
      {showLoading && loading && (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: 'rgba(0,0,0,0.05)',
            },
          ]}
        >
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
      {error && (
        <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.1)' }]}>
          <Text style={{ color: 'red' }}>Ошибка загрузки</Text>
        </View>
      )}
    </View>
  );
};

export default AppCachedImage;