// =====================================================================
// OrderSuccessScreen - confirmation after an order is placed. Shows a paid
// state when eSewa/khalti was confirmed, otherwise a pending state.
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

const PROVIDER_LABELS: Record<string, string> = {
  cod: 'cash on delivery',
  esewa: 'eSewa',
  khalti: 'Khalti',
};

export function OrderSuccessScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const orderId = route.params?.orderId;
  const paid = route.params?.paid === true;
  const providerLabel = PROVIDER_LABELS[route.params?.provider ?? ''] ?? '';

  return (
    <View className="flex-1 items-center justify-center bg-surface px-8">
      <View className={`h-20 w-20 items-center justify-center rounded-full ${paid ? 'bg-emerald-50' : 'bg-amber-50'}`}>
        <Feather name={paid ? 'check-circle' : 'clock'} size={40} color={paid ? '#059669' : '#b45309'} />
      </View>
      <Text className="mt-5 text-center text-2xl font-bold text-ink">
        {paid ? 'Payment received' : 'Order placed'}
      </Text>
      <Text className="mt-2 text-center text-sm leading-6 text-muted">
        {paid
          ? `Thank you! Your payment${providerLabel ? ` via ${providerLabel}` : ''} is confirmed and we'll start preparing your order${orderId ? ` (${orderId.slice(0, 8)})` : ''}.`
          : `Thank you! We've received your order${orderId ? ` (${orderId.slice(0, 8)})` : ''} and will be in touch with payment and delivery details.`}
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
