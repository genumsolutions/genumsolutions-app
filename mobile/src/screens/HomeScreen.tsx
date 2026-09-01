// =====================================================================
// HomeScreen - native home. Reads site_content, services, products
// from Supabase, plus programs/curriculum from local config.
// =====================================================================
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Feather } from '@expo/vector-icons'
import { getProducts } from '../services/productService'
import { getServices } from '../services/serviceService'
import { fetchSiteContent } from '../services/orderService'
import { trainingPrograms, pilotCosts, stemProjectHighlights } from '../config/programs'
import type { Product, Service } from '../types'
import type { RootStackParamList } from '../navigation/types'

type Nav = NativeStackNavigationProp<RootStackParamList, 'Main'>

export function HomeScreen() {
  const navigation = useNavigation<Nav>()
  const [services, setServices] = useState<Service[]>([])
  const [featured, setFeatured] = useState<Product[]>([])
  const [heroTitle, setHeroTitle] = useState('Technology you can touch, test, and trust.')
  const [heroBody, setHeroBody] = useState('Robotics kits, project solutions, fabrication, open tools, and training for curious builders, schools, and teams.')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [svcs, prods, content] = await Promise.all([
          getServices(),
          getProducts(),
          fetchSiteContent().catch(() => null),
        ])
        if (!active) return
        setServices(svcs.slice(0, 4))
        setFeatured(prods.filter((p) => p.stock > 0).slice(0, 6))
        if (content?.content?.home_title) setHeroTitle(content.content.home_title)
        if (content?.content?.home_body) setHeroBody(content.content.home_body)
      } catch { /* no-op */ }
      finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [])

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ paddingBottom: 32 }}>
      {/* Hero */}
      <View className="bg-navy px-5 pb-8 pt-6">
        <Text className="text-xs font-black uppercase tracking-[0.24em] text-gold">Kathmandu · Nepal</Text>
        <Text className="mt-2 font-sans text-3xl font-bold leading-tight tracking-tight text-white">{heroTitle}</Text>
        <Text className="mt-3 text-sm leading-6 text-white/80">{heroBody}</Text>
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
                <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">What GENUM does</Text>
                <Pressable onPress={() => navigation.navigate('Services')}>
                  <Text className="text-sm font-bold text-navy underline decoration-gold underline-offset-4">View all</Text>
                </Pressable>
              </View>
              <View className="mt-3">
                {services.map((s) => (
                  <Pressable key={s.id} onPress={() => navigation.navigate('Services')} className="mb-2 rounded-2xl border border-line bg-white p-4">
                    <Text className="font-sans text-base font-bold leading-snug text-ink">{s.name}</Text>
                    <Text className="mt-1 text-sm leading-5 text-slate-600">{s.description}</Text>
                    <Text className="mt-2 text-sm font-black text-navy">{s.priceLabel}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Curriculum */}
          <View className="px-5 pt-6">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">100+ project curriculum</Text>
              <Pressable onPress={() => navigation.navigate('Contact')}>
                <Text className="text-sm font-bold text-navy underline decoration-gold underline-offset-4">Request the full catalog</Text>
              </Pressable>
            </View>
            <View className="mt-4 space-y-3">
              {Object.entries(stemProjectHighlights).map(([ages, projects]) => (
                <View key={ages} className="rounded-2xl border border-line bg-white p-4">
                  <Text className="text-xs font-black uppercase tracking-widest text-gold">{ages}</Text>
                  <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
                    {projects.map((p) => (
                      <Text key={p} className="text-sm leading-6 text-slate-600">• {p}</Text>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Training programs */}
          <View className="px-5 pt-6">
            <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">Training programs</Text>
            <View className="mt-4 space-y-3">
              {trainingPrograms.map((prog) => (
                <View key={prog.title} className="rounded-2xl border border-line bg-white p-4">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="font-display text-lg font-bold text-ink">{prog.title}</Text>
                    <Text className="shrink-0 rounded-full bg-sky px-2 py-0.5 text-[10px] font-bold text-navy">{prog.duration}</Text>
                  </View>
                  <Text className="mt-1 text-[10px] font-black uppercase tracking-wide text-gold">{prog.audience}</Text>
                  <Text className="mt-2 text-sm leading-6 text-slate-600">{prog.description}</Text>
                  <Text className="mt-2 text-xs leading-5 text-slate-500"><Text className="text-ink font-bold">Outcome:</Text> {prog.outcome}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Pilot costing */}
          <View className="px-5 pt-6">
            <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">Illustrative pilot costing</Text>
            <Text className="mt-2 font-display text-2xl font-bold text-navy">NPR 8,40,000 <Text className="font-sans text-sm font-normal text-slate-500">illustrative total</Text></Text>
            <View className="mt-4">
              {pilotCosts.map(([item, cost, note]) => (
                <View key={item} className="flex-row items-center justify-between border-b border-line py-2">
                  <Text className="flex-1 text-sm font-semibold text-ink">{item}<Text className="text-xs font-normal text-slate-500"> — {note}</Text></Text>
                  <Text className="font-display font-bold text-navy">{cost}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Featured products */}
          {featured.length > 0 && (
            <View className="px-5 pt-6">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">Shop</Text>
                <Pressable onPress={() => navigation.navigate('Main', { screen: 'Shop' })}>
                  <Text className="text-sm font-bold text-navy underline decoration-gold underline-offset-4">Browse catalog</Text>
                </Pressable>
              </View>
              <View className="mt-3 flex-row flex-wrap justify-between">
                {featured.map((p) => (
                  <Pressable key={p.id} onPress={() => navigation.navigate('ProductDetail', { productId: p.id })} className="mb-3 w-[48%] rounded-2xl border border-line bg-white p-3">
                    <View className="h-24 items-center justify-center overflow-hidden rounded-xl bg-mist">
                      {p.image ? (
                        <Image source={{ uri: p.image }} className="h-full w-full" resizeMode="cover" />
                      ) : (
                        <Feather name="box" size={28} color="#94a3b8" />
                      )}
                    </View>
                    <Text className="mt-2 text-[13px] font-bold leading-tight text-ink">{p.name}</Text>
                    <Text className="mt-1 text-xs font-black text-navy">{p.priceLabel}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* CTA */}
          <View className="px-5 pt-6">
            <View className="rounded-2xl bg-ink p-5">
              <Text className="text-xs font-black uppercase tracking-[0.24em] text-gold">Need a starting point?</Text>
              <Text className="mt-2 font-display text-xl font-bold tracking-tight text-white">Use the open tools or bring us the brief.</Text>
              <View className="mt-4 flex-row flex-wrap gap-3">
                <Pressable onPress={() => navigation.navigate('Tools')} className="rounded-full bg-white px-5 py-3">
                  <Text className="text-sm font-black text-ink">Open tools</Text>
                </Pressable>
                <Pressable onPress={() => navigation.navigate('Contact')} className="rounded-full border border-white/40 px-5 py-3">
                  <Text className="text-sm font-black text-white">Contact GENUM</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  )
}