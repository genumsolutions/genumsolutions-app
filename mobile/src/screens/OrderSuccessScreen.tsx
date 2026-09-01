// =====================================================================
// OrderSuccessScreen - confirmation after an order is placed.
// =====================================================================
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'OrderSuccess'>;
type Route = RouteProp<RootStackParamList, 'OrderSuccess'>;

export function OrderSuccessScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();

  return (
    <View className="flex-1 items-center justify-center bg-surface px-8">
      <View className="h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
        <Feather name="check-circle" size={40} color="#059669" />
      </View>
      <Text className="mt-5 text-center text-2xl font-bold text-ink">
        Order placed
      </Text>
      <Text className="mt-2 text-center text-sm leading-6 text-muted">
        Thank you! We've received your order
        {route.params?.orderId ? ` (${route.params.orderId.slice(0, 8)})` : ''} and
        will be in touch with payment and delivery details.
      </Text>
      <Pressable
        onPress={() => navigation.popToTop()}
        className="mt-8 w-full max-w-xs items-center rounded-full bg-navy py-3"
      >
        <Text className="font-bold text-white">Back to home</Text>
      </Pressable>
    </View>
  );
}
