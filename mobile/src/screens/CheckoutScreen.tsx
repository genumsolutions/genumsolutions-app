// =====================================================================
// CheckoutScreen - captures contact details and places an order against the
// shared Supabase `orders` table (requires sign-in, like the website). Supports
// Cash on Delivery plus eSewa / Khalti (opened in the system browser via
// expo-web-browser; the payer returns on the genumsolutions:// deep link).
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
import * as WebBrowser from 'expo-web-browser';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { getProducts } from '../services/productService';
import { resolveCart, clearCart } from '../services/cartService';
import { createOrder, initiateEsewaPayment, initiateKhaltiPayment, getOrderById } from '../services/orderService';
import { useApp } from '../context/AppContext';
import type { CheckoutInput } from '../types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Checkout'>;
type Route = RouteProp<RootStackParamList, 'Checkout'>;

type Provider = CheckoutInput['provider'];

const PROVIDERS: [Provider, string, string][] = [
  ['cod', 'Cash on delivery', 'Pay when your order is delivered.'],
  ['esewa', 'eSewa', 'Pay securely with your eSewa wallet.'],
  ['khalti', 'Khalti', 'Pay securely with your Khalti wallet.'],
];

export function CheckoutScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { user, isSignedIn, setAuthSheetOpen, setCart } = useApp();
  const [items, setItems] = useState<
    { productId: string; name: string; priceNpr: number; quantity: number }[]
  >([]);
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [provider, setProvider] = useState<Provider>(route.params?.provider || 'cod');
  const [notice, setNotice] = useState<string | null>(null);
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

  useEffect(() => {
    if (route.params?.status) {
      const labels: Record<string, string> = {
        cancelled: 'Payment was cancelled. Your order is saved - you can try again below.',
        'not-paid': 'Payment was not completed. Please try again or switch to cash on delivery.',
        'no-order': 'We could not confirm that order. Please try checkout again.',
        'amount-mismatch': 'There was a payment mismatch. Our team will contact you.',
        'verify-pending': 'Payment is being verified - check your orders shortly.',
      };
      setNotice(labels[route.params.status] ?? null);
    }
  }, [route.params]);

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
    setNotice(null);
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
      if (!order) throw new Error('Could not create your order.');

      // COD: done the moment the order exists.
      if (provider === 'cod') {
        await clearCart();
        setCart({ count: 0, size: 0 });
        navigation.replace('OrderSuccess', { orderId: order.id, provider: 'cod', paid: false });
        return;
      }

      // Online: hand off to the gateway in the system browser, then confirm.
      let gatewayUrl: string;
      if (provider === 'esewa') {
        const res = await initiateEsewaPayment(order.id, order.total_npr);
        gatewayUrl = res.renderUrl;
      } else {
        const res = await initiateKhaltiPayment(order.id, order.total_npr);
        gatewayUrl = res.url;
      }

      await WebBrowser.openBrowserAsync(gatewayUrl, {
        toolbarColor: '#1e3a8a',
        enableBarCollapsing: true,
      });

      // After the browser closes (deep link may already have navigated), ask
      // Supabase whether the order was actually paid by the edge function.
      const fresh = await getOrderById(order.id);
      const paid = !!fresh && fresh.status === 'paid';
      if (paid) {
        await clearCart();
        setCart({ count: 0, size: 0 });
        navigation.replace('OrderSuccess', { orderId: order.id, provider, paid: true });
      } else {
        setSubmitting(false);
        setNotice(
          'Your order is saved but the payment was not confirmed yet. You can retry, switch payment method, or settle later from your account.',
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not place your order.');
      setSubmitting(false);
    }
  }, [items, total, name, email, phone, address, provider, isSignedIn, setAuthSheetOpen, setCart, navigation]);

  if (items.length === 0 && !submitting) {
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
      <View className="rounded-2xl border border-line bg-card p-4">
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
          <Text className="font-display text-lg font-bold tracking-tight text-ink">
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
      <View className="overflow-hidden rounded-2xl border border-line bg-card">
        {PROVIDERS.map(([value, label, sub]) => {
          const selected = provider === value;
          return (
            <Pressable
              key={value}
              onPress={() => setProvider(value)}
              className={`border-b border-line px-4 py-3.5 last:border-b-0 ${selected ? 'bg-navy-light' : 'bg-card'}`}
            >
              <View className="flex-row items-center justify-between">
                <Text className={`text-sm font-semibold ${selected ? 'text-navy' : 'text-ink'}`}>
                  {label}
                </Text>
                {selected ? <View className="h-4 w-4 rounded-full bg-navy" /> : <View className="h-4 w-4 rounded-full border border-border" />}
              </View>
              <Text className="mt-0.5 text-xs text-muted">{sub}</Text>
            </Pressable>
          );
        })}
      </View>

      {notice ? (
        <Text className="mt-3 text-center text-xs font-medium leading-5 text-amber-700">{notice}</Text>
      ) : null}
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
    <Text className="mb-2 mt-5 text-xs font-black uppercase tracking-[0.24em] text-navy">
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
        className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-ink"
      />
    </View>
  );
}
