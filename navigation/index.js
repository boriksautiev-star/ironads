// navigation/index.js
import React, { useContext, useRef, useEffect } from 'react';
import { Animated, View, Text, Platform, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { UnreadCountContext } from '../context/UnreadCountContext';

// Экраны
import HomeScreen from '../screens/HomeScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import ChatsScreen from '../screens/ChatsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import FiltersScreen from '../screens/FiltersScreen';
import ListingDetailScreen from '../screens/ListingDetailScreen';
import ChatDetailScreen from '../screens/ChatDetailScreen';
import CreateListingScreen from '../screens/CreateListingScreen';
import EditListingScreen from '../screens/EditListingScreen';
import SubscriptionsScreen from '../screens/SubscriptionsScreen';
import PlansScreen from '../screens/PlansScreen';
import PackageListingsScreen from '../screens/PackageListingsScreen';
import RenewPackageScreen from '../screens/RenewPackageScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SupportScreen from '../screens/SupportScreen';
import AuthScreen from '../screens/AuthScreen';
import OAuthScreen from '../screens/OAuthScreen';
import AvailableListingsScreen from '../screens/AvailableListingsScreen';
import CategorySelectScreen from '../screens/CategorySelectScreen';
import RegionSelectScreen from '../screens/RegionSelectScreen';
import CitySelectScreen from '../screens/CitySelectScreen';

// ===== КОМПОНЕНТ КОМПАКТНОГО ХЕДЕРА =====
const CompactHeader = ({ title, back, onBack }) => {
  const { colors } = useTheme();
  const navigation = useNavigation();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  return (
    <View
      style={{
        height: 28,
        backgroundColor: colors.background,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.border || 'rgba(0,0,0,0.05)',
      }}
    >
      {back !== false && (
        <TouchableOpacity onPress={handleBack} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
      )}
      <Text
        style={{
          color: colors.text,
          fontSize: 12,
          fontWeight: '500',
          flex: 1,
          textAlign: 'center',
          marginRight: back !== false ? 28 : 0,
        }}
        numberOfLines={1}
      >
        {title || ''}
      </Text>
    </View>
  );
};

// Компонент иконки таба с пульсацией
const TabIcon = ({ name, color, size, focused, badgeCount }) => {
  const { colors } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (badgeCount > 0) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.2,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      scaleAnim.setValue(1);
    }
  }, [badgeCount]);

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Ionicons name={name} size={size} color={color} />
      </Animated.View>
      {badgeCount > 0 && (
        <View
          style={{
            position: 'absolute',
            right: -6,
            top: -6,
            backgroundColor: colors.notificationBadge || '#FF3B30',
            borderRadius: 10,
            minWidth: 18,
            height: 18,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 4,
          }}
        >
          <Text
            style={{
              color: '#fff',
              fontSize: 10,
              fontWeight: 'bold',
            }}
          >
            {badgeCount > 99 ? '99+' : badgeCount}
          </Text>
        </View>
      )}
    </View>
  );
};

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Стек для главной вкладки
const HomeStack = () => {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: 'bold' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen
        name="HomeScreen"
        component={HomeScreen}
        options={({ navigation, route }) => ({
          title: 'IronAds',
          headerRight: () => (
            <Ionicons
              name="search-outline"
              size={24}
              onPress={() => navigation.navigate('Filters')}
              style={{ marginRight: 15 }}
            />
          ),
          headerLeft: () => null,
        })}
      />
      <Stack.Screen name="Filters" component={FiltersScreen} />
      <Stack.Screen name="ListingDetail" component={ListingDetailScreen} />
      <Stack.Screen name="CreateListing" component={CreateListingScreen} />
      <Stack.Screen name="EditListing" component={EditListingScreen} />
      <Stack.Screen name="CategorySelect" component={CategorySelectScreen} />
      <Stack.Screen name="RegionSelect" component={RegionSelectScreen} />
      <Stack.Screen name="CitySelect" component={CitySelectScreen} />
    </Stack.Navigator>
  );
};

// Стек для избранного
const FavoritesStack = () => {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        header: (props) => <CompactHeader title="Избранное" back={false} />,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen
        name="Favorites"
        component={FavoritesScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen
        name="ListingDetail"
        component={ListingDetailScreen}
        options={{ title: 'Объявление' }}
      />
    </Stack.Navigator>
  );
};

// Стек для чатов
const ChatsStack = () => {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        header: (props) => {
          const route = props.route;
          const title = route?.name === 'ChatDetail' ? 'Чат' : 'Чаты';
          const back = route?.name === 'ChatDetail' ? true : false;
          return <CompactHeader title={title} back={back} />;
        },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen
        name="Chats"
        component={ChatsScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="ChatDetail" component={ChatDetailScreen} options={{ title: 'Чат' }} />
      <Stack.Screen
        name="ListingDetail"
        component={ListingDetailScreen}
        options={{ title: 'Объявление' }}
      />
    </Stack.Navigator>
  );
};

// Стек для профиля
const ProfileStack = () => {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        header: (props) => {
          const route = props.route;
          const titles = {
            Profile: 'Профиль',
            EditProfile: 'Редактировать профиль',
            History: 'История',
            Subscriptions: 'Подписки',
            Plans: 'Тарифы',
            PackageListings: 'Управление пакетом',
            RenewPackage: 'Продление',
            Support: 'Поддержка',
            AvailableListings: 'Доступные объявления',
            EditListing: 'Редактировать',
            CreateListing: 'Создать',
            ListingDetail: 'Объявление',
            CategorySelect: 'Категория',
            RegionSelect: 'Регион',
            CitySelect: 'Город',
          };
          const title = titles[route?.name] || 'Профиль';
          const back = route?.name !== 'Profile';
          return <CompactHeader title={title} back={back} />;
        },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="History" component={HistoryScreen} />
      <Stack.Screen name="Subscriptions" component={SubscriptionsScreen} />
      <Stack.Screen name="Plans" component={PlansScreen} />
      <Stack.Screen name="PackageListings" component={PackageListingsScreen} />
      <Stack.Screen name="RenewPackage" component={RenewPackageScreen} />
      <Stack.Screen name="Support" component={SupportScreen} />
      <Stack.Screen name="AvailableListings" component={AvailableListingsScreen} />
      <Stack.Screen name="EditListing" component={EditListingScreen} />
      <Stack.Screen name="CreateListing" component={CreateListingScreen} />
      <Stack.Screen name="ListingDetail" component={ListingDetailScreen} />
      <Stack.Screen name="CategorySelect" component={CategorySelectScreen} />
      <Stack.Screen name="RegionSelect" component={RegionSelectScreen} />
      <Stack.Screen name="CitySelect" component={CitySelectScreen} />
    </Stack.Navigator>
  );
};

// Главный таб-навигатор
const MainTabs = () => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { unreadCount } = useContext(UnreadCountContext);

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          height: 50,
          paddingBottom: Platform.OS === 'ios' ? insets.bottom : 0,
          paddingTop: 0,
        },
        tabBarItemStyle: {
          paddingVertical: 0,
          justifyContent: 'center',
          alignItems: 'center',
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: 10, marginTop: 0 },
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="Главная"
        component={HomeStack}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? 'home' : 'home-outline'} color={color} size={22} badgeCount={0} />
          ),
        }}
      />
      <Tab.Screen
        name="Избранное"
        component={FavoritesStack}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? 'heart' : 'heart-outline'} color={color} size={22} />
          ),
        }}
      />
      <Tab.Screen
        name="Чаты"
        component={ChatsStack}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name={focused ? 'chatbubble' : 'chatbubble-outline'}
              color={color}
              size={22}
              badgeCount={unreadCount}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Профиль"
        component={ProfileStack}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? 'person' : 'person-outline'} color={color} size={22} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

// Корневой навигатор
export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen name="Auth" component={AuthScreen} />
        <Stack.Screen name="OAuth" component={OAuthScreen} />
      </Stack.Group>
    </Stack.Navigator>
  );
}