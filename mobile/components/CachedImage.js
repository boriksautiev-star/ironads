import React, { useState, useEffect } from 'react';
import { Image, View, ActivityIndicator } from 'react-native';
import { getCachedUri } from '../utils/imageCache';

export const CachedImage = ({ uri, style, resizeMode = 'cover', ...props }) => {
  const [localUri, setLocalUri] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadImage = async () => {
      if (!uri) {
        setLoading(false);
        return;
      }
      const cached = await getCachedUri(uri);
      if (isMounted) {
        setLocalUri(cached);
        setLoading(false);
      }
    };
    loadImage();
    return () => { isMounted = false; };
  }, [uri]);

  if (loading) {
    return (
      <View style={[style, { backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="small" color="#007AFF" />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: localUri || uri }}
      style={style}
      resizeMode={resizeMode}
      {...props}
    />
  );
};