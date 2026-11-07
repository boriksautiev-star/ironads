// utils/eventEmitter.js
import { DeviceEventEmitter } from 'react-native';

export const emitUnreadUpdate = (count) => {
  DeviceEventEmitter.emit('unreadUpdate', count);
};

export const subscribeUnreadUpdate = (callback) => {
  const subscription = DeviceEventEmitter.addListener('unreadUpdate', callback);
  return subscription;
};