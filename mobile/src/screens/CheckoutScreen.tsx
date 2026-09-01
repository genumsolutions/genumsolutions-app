// =====================================================================
// CheckoutScreen - captures contact details and places an order against the
// shared Supabase `orders` table (requires sign-in, like the website).
// =====================================================================
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getProducts } from '../services/productService';
import { resolveCart, clearCart } from '../services/cartService';
import { createOrder } from '../services/orderService';
import { useApp } from '../context/AppContext';
import type { CheckoutInput } from '../types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Checkout'>;

type Provider = CheckoutInput['provider'];

export function CheckoutScreen() {
  const navigation = useNavigation<Nav>();
  const { user, isSignedIn, setAuthSheetOpen, setCart } = useApp();
  const [items, setItems] = useState<
    { productId: string; name: string; priceNpr: number; quantity: number }[]
  >([]);
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [provider, setProvider] = useState<Provider>('cod');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const products = await getProducts();
      const resolved = await resolveCart(products);
      setItems(
        resolved.map(({ line, product }) => ({
          productId: product.id,
          name: product.name,
          priceNpr: product.price,
          quantity: line.quantity,
        })),
      );
    })();
  }, []);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
    }
  }, [user]);

  const total = items.reduce((sum, i) => sum + i.priceNpr * i.quantity, 0);
  const canSubmit =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    phone.trim().length > 0 &&
    address.trim().length > 0 &&
    items.length > 0 &&
    !submitting;

  const handleOrder = useCallback(async () => {
    if (!isSignedIn) {
      setAuthSheetOpen(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const order = await createOrder({
        items,
        totalNpr: total,
        customerName: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        address: address.trim(),
        provider,
      });
      await clearCart();
      setCart({ count: 0, size: 0 });
      navigation.replace('OrderSuccess', { orderId: order?.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not place your order.');
      setSubmitting(false);
    }
  }, [items, total, name, email, phone, address, provider, isSignedIn, setAuthSheetOpen, setCart, navigation]);

  if (items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-surface px-8">
        <Text className="text-base font-bold text-ink">Nothing to check out</Text>
        <Text className="mt-1 text-center text-sm text-muted">
          Your cart is empty. Add products first.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <SectionTitle>Order summary</SectionTitle>
      <View className="rounded-2xl border border-line bg-white p-4">
        {items.map((i, idx) => (
          <View key={idx} className="flex-row items-center justify-between py-1.5">
            <Text className="flex-1 pr-3 text-sm text-ink">
              {i.quantity} × {i.name}
            </Text>
            <Text className="text-sm font-bold text-ink">
              NPR {(i.priceNpr * i.quantity).toLocaleString('en-IN')}
            </Text>
          </View>
        ))}
        <View className="mt-2 flex-row items-center justify-between border-t border-line pt-3">
          <Text className="text-sm text-muted">Total</Text>
          <Text className="font-sans text-lg font-bold text-ink">
            NPR {total.toLocaleString('en-IN')}
          </Text>
        </View>
      </View>

      <SectionTitle>Delivery details</SectionTitle>
      <Field label="Full name" value={name} onChange={setName} placeholder="Your name" />
      <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" keyboard="email-address" />
      <Field label="Phone" value={phone} onChange={setPhone} placeholder="98XXXXXXXX" keyboard="phone-pad" />
      <Field label="Address" value={address} onChange={setAddress} placeholder="Street, city, Nepal" />

      <SectionTitle>Payment method</SectionTitle>
      <View className="overflow-hidden rounded-2xl border border-line bg-white">
        {([['cod', 'Cash on delivery']] as [Provider, string][]).map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => setProvider(value)}
            className={`flex-row items-center justify-between border-b border-line px-4 py-3.5 last:border-b-0 ${provider === value ? 'bg-navy-light' : 'bg-white'}`}
          >
            <Text className={`text-sm font-semibold ${provider === value ? 'text-navy' : 'text-ink'}`}>
              {label}
            </Text>
            {provider === value ? <View className="h-4 w-4 rounded-full bg-navy" /> : <View className="h-4 w-4 rounded-full border border-border" />}
          </Pressable>
        ))}
      </View>

      {error ? (
        <Text className="mt-3 text-center text-xs font-medium text-red-600">{error}</Text>
      ) : null}

      <Pressable
        onPress={() => void handleOrder()}
        disabled={!canSubmit}
        className="mt-6 items-center rounded-full bg-navy py-3.5 disabled:opacity-50"
      >
        {submitting ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text className="font-bold text-white">
            {isSignedIn ? 'Place order' : 'Sign in to place order'}
          </Text>
        )}
      </Pressable>
      {!isSignedIn ? (
        <Text className="mt-2 text-center text-xs text-muted">
          You need to be signed in to check out.
        </Text>
      ) : null}
    </ScrollView>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text className="mb-2 mt-5 text-xs font-black uppercase tracking-[0.2em] text-navy">
      {children}
    </Text>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboard,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  keyboard?: 'default' | 'email-address' | 'phone-pad';
}) {
  return (
    <View className="mb-3">
      <Text className="mb-1 text-xs font-bold uppercase tracking-wide text-border">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        keyboardType={keyboard ?? 'default'}
        className="rounded-xl border border-border bg-white px-4 py-3 text-sm text-ink"
      />
    </View>
  );
}
