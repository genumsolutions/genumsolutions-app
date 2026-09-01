// =====================================================================
// HomeScreen - native home. Reads the shared `site_content`, `services`
// and a few featured `products` from Supabase.
// =====================================================================
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { getProducts } from '../services/productService';
import { getServices } from '../services/serviceService';
import type { Product, Service } from '../types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Main'>;

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const [services, setServices] = useState<Service[]>([]);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [svcs, prods] = await Promise.all([getServices(), getProducts()]);
        if (!active) return;
        setServices(svcs.slice(0, 4));
        setFeatured(prods.filter((p) => p.stock > 0).slice(0, 6));
      } catch {
        // no-op; screen still renders with empty sections
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ paddingBottom: 32 }}>
      {/* Hero */}
      <View className="bg-navy px-5 pb-8 pt-6">
        <Text className="text-xs font-black uppercase tracking-[0.24em] text-gold">
          Kathmandu · Nepal
        </Text>
        <Text className="mt-2 font-sans text-3xl font-bold leading-tight tracking-tight text-white">
          Technology you can touch, test, and trust.
        </Text>
        <Text className="mt-3 text-sm leading-6 text-white/80">
          Robotics kits, project solutions, fabrication, open tools, and training
          for curious builders, schools, and teams.
        </Text>
      </View>

      {loading ? (
        <View className="items-center py-16">
          <ActivityIndicator size="large" color="#1e3a8a" />
        </View>
      ) : (
        <>
          {/* Services */}
          {services.length > 0 && (
            <View className="px-5 pt-6">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
                  What GENUM does
                </Text>
                <Pressable onPress={() => navigation.navigate('Services')}>
                  <Text className="text-sm font-bold text-navy underline decoration-gold underline-offset-4">
                    View all
                  </Text>
                </Pressable>
              </View>
              <View className="mt-3">
                {services.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => navigation.navigate('Services')}
                    className="mb-2 rounded-2xl border border-line bg-white p-4"
                  >
                    <Text className="font-sans text-base font-bold leading-snug text-ink">
                      {s.name}
                    </Text>
                    <Text className="mt-1 text-sm leading-5 text-slate-600">
                      {s.description}
                    </Text>
                    <Text className="mt-2 text-sm font-black text-navy">
                      {s.priceLabel}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Featured products */}
          {featured.length > 0 && (
            <View className="px-5 pt-6">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
                  Shop
                </Text>
                <Pressable
                  onPress={() =>
                    navigation.navigate('Main', { screen: 'Shop' })
                  }
                >
                  <Text className="text-sm font-bold text-navy underline decoration-gold underline-offset-4">
                    Browse catalog
                  </Text>
                </Pressable>
              </View>
              <View className="mt-3 flex-row flex-wrap justify-between">
                {featured.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() =>
                      navigation.navigate('ProductDetail', { productId: p.id })
                    }
                    className="mb-3 w-[48%] rounded-2xl border border-line bg-white p-3"
                  >
                    <View className="h-24 items-center justify-center overflow-hidden rounded-xl bg-mist">
                      {p.image ? (
                        <Image
                          source={{ uri: p.image }}
                          className="h-full w-full"
                          resizeMode="cover"
                        />
                      ) : (
                        <Feather name="box" size={28} color="#94a3b8" />
                      )}
                    </View>
                    <Text className="mt-2 text-[13px] font-bold leading-tight text-ink">
                      {p.name}
                    </Text>
                    <Text className="mt-1 text-xs font-black text-navy">
                      {p.priceLabel}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}
