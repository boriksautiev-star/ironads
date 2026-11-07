// context/AlertContext.js
import React, { createContext, useState, useContext } from 'react';
import CustomAlert from '../components/CustomAlert';

const AlertContext = createContext();

export const AlertProvider = ({ children }) => {
  const [alertState, setAlertState] = useState({
    visible: false,
    title: '',
    message: '',
    buttons: [],
    onDismiss: null,
  });

  const showAlert = ({ title, message, buttons = [], onDismiss = null }) => {
    setAlertState({
      visible: true,
      title,
      message,
      buttons,
      onDismiss,
    });
  };

  const hideAlert = () => {
    setAlertState(prev => ({ ...prev, visible: false }));
  };

  return (
    <AlertContext.Provider value={{ showAlert, hideAlert }}>
      {children}
      <CustomAlert
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        buttons={alertState.buttons}
        onDismiss={() => {
          if (alertState.onDismiss) alertState.onDismiss();
          hideAlert();
        }}
      />
    </AlertContext.Provider>
  );
};

export const useAlert = () => useContext(AlertContext);