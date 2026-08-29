// =====================================================================
// CartBar - a slim, persistent bar sandwiched between the content and the
// tab bar whenever the build list is non-empty. It keeps the focus on the
// purchase: shows the live item count and one-tap access to checkout.
// Renders nothing when the cart is empty (no dead UI).
// =====================================================================
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';

export function CartBar() {
  const { cartCount, navigate } = useApp();

  if (cartCount <= 0) return null;

  return (
    <View className="border-t border-navy-dark bg-navy px-4 py-2.5">
      <Pressable
        onPress={() => navigate('/checkout')}
        accessibilityRole="button"
        accessibilityLabel={`Go to checkout, ${cartCount} items in your build list`}
        className="flex-row items-center justify-between"
      >
        <Text className="text-sm font-bold text-white">
          {cartCount} item{cartCount === 1 ? '' : 's'} in your build list
        </Text>
        <View className="flex-row items-center">
          <Text className="mr-1.5 text-sm font-black text-white">Checkout</Text>
          <Feather name="arrow-right" size={16} color="#ffffff" />
        </View>
      </Pressable>
    </View>
  );
}