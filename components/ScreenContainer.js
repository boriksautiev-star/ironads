// components/ScreenContainer.js
import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ScreenContainer({
  children,
  scroll = true,
  paddingBottom = 20,
  backgroundColor = '#f2f2f7',
  style,
  contentContainerStyle,
  avoidStatusBar = false,
}) {
  const insets = useSafeAreaInsets();

  const safeAreaStyle = [
    styles.safeArea,
    { backgroundColor },
    style,
  ];

  if (avoidStatusBar) {
    safeAreaStyle.push({ paddingTop: 0 });
  }

  const bottomPadding = insets.bottom + paddingBottom;
  const containerStyle = {
    paddingBottom: bottomPadding,
    flexGrow: 1,
  };

  if (scroll) {
    return (
      <SafeAreaView style={safeAreaStyle}>
        <ScrollView
          contentContainerStyle={[containerStyle, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={safeAreaStyle}>
      <View style={[styles.nonScrollContainer, { paddingBottom: bottomPadding }, contentContainerStyle]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  nonScrollContainer: {
    flex: 1,
  },
});