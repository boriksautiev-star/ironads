// components/CustomAlert.js
import React, { useRef, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const { width } = Dimensions.get('window');

const CustomAlert = ({ visible, title, message, buttons = [], onDismiss }) => {
  const { colors } = useTheme();
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 7,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const handleDismiss = () => {
    if (onDismiss) onDismiss();
  };

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={handleDismiss}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <Animated.View style={{
          width: width * 0.85,
          backgroundColor: colors.card,
          borderRadius: 16,
          padding: 20,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.3,
          shadowRadius: 20,
          elevation: 10,
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        }}>
          {title && (
            <Text style={{
              fontSize: 18,
              fontWeight: 'bold',
              marginBottom: 10,
              color: colors.text,
              textAlign: 'center',
            }}>
              {title}
            </Text>
          )}
          {message && (
            <Text style={{
              fontSize: 15,
              marginBottom: 20,
              color: colors.secondaryText,
              textAlign: 'center',
            }}>
              {message}
            </Text>
          )}
          <View style={{
            flexDirection: 'row',
            flexWrap: 'wrap', // разрешаем перенос на следующую строку
            justifyContent: 'center',
            gap: 8,
            marginTop: 10,
          }}>
            {buttons.map((btn, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => {
                  if (btn.onPress) btn.onPress();
                  handleDismiss();
                }}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 8,
                  backgroundColor: btn.style === 'destructive' ? '#FF3B30' : 
                                  btn.style === 'cancel' ? colors.border : colors.primary,
                  minWidth: 60,
                  alignItems: 'center',
                  flexShrink: 1, // позволяет кнопкам сжиматься
                }}
              >
                <Text style={{
                  color: '#fff',
                  fontWeight: '600',
                  fontSize: 14,
                  textAlign: 'center',
                }}>
                  {btn.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default CustomAlert;