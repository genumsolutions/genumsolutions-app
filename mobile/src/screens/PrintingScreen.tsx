// =====================================================================
// PrintingScreen - 3D printing services and fabrication (native).
// Mirrors the website's /3d-printing page: offers + workflow + a model
// library (external links) + CTAs that route to the inquiry form.
//
// A6 (2026-09-24): now also renders the LIVE "Models we print" grid —
// the same products with category "3D Models" from the shared products
// table that the website's /3d-printing page shows (unification parity).
// =====================================================================
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import type { RootStackParamList } from "../navigation/types";
import {
  getProductsWithSource,
  distinctCategories,
  filterProducts,
  inStockOnly,
  PRICE_CEILINGS,
  priceCeilingLabel,
  SORT_LABELS,
  sortProducts,
  withinPrice,
  type SortOption,
} from "../services/productService";
import { OfflineBadge } from "../components/OfflineBadge";
import { supabase } from "../config/supabase";
import {
  getPrintContent,
  submitPrintQuote,
  type PrintContent,
} from "../services/printService";
import { estimatePrint } from "../lib/printEstimate";
import {
  attachmentSummary,
  checkQuoteAttachments,
  MAX_QUOTE_FILES,
  QUOTE_FILES_ERROR,
  type QuoteAttachment,
} from "../lib/printAttachments";
import { CategoryDropdown } from "../components/CategoryDropdown";
import { ProductCard } from "../components/ProductCard";
import { PagePager } from "../components/PagePager";
import type { Product } from "../types";

// U-44: 3D Products store pagination — 20 per page (owner decision, matches
// the website's ModelsCatalog on /3d-printing).
const PAGE_SIZE = 20;

type Nav = NativeStackNavigationProp<RootStackParamList, "Printing">;

const offers = [
  {
    title: "Prototype printing",
    text: "Turn a CAD file into a physical test part, enclosure, bracket, or teaching model.",
    meta: "FDM · PLA / PETG",
  },
  {
    title: "Design for print",
    text: "Get help preparing geometry, tolerances, supports, and orientation before material is wasted.",
    meta: "Consultancy · From NPR 2,500",
  },
  {
    title: "Small-batch parts",
    text: "Repeatable print runs for fixtures, replacement parts, classroom sets, and maker products.",
    meta: "Quote by volume",
  },
];

const modelSites = [
  {
    name: "Printables",
    url: "https://www.printables.com/",
    blurb: "Community models, printer profiles, and makes.",
    domain: "printables.com",
  },
  {
    name: "Thingiverse",
    url: "https://www.thingiverse.com/",
    blurb: "A large library of community-created printable models.",
    domain: "thingiverse.com",
  },
  {
    name: "MakerWorld",
    url: "https://makerworld.com/en",
    blurb: "Printable models and profiles for modern maker workflows.",
    domain: "makerworld.com",
  },
  {
    name: "MyMiniFactory",
    url: "https://www.myminifactory.com/",
    blurb: "Curated models for makers, miniatures, and education.",
    domain: "myminifactory.com",
  },
  {
    name: "NASA 3D Resources",
    url: "https://nasa3d.arc.nasa.gov/",
    blurb: "Public NASA spacecraft, science, and mission models.",
    domain: "nasa3d.arc.nasa.gov",
  },
  {
    name: "NIH 3D Print Exchange",
    url: "https://3dprint.nih.gov/",
    blurb: "Open biomedical and scientific 3D-printable models.",
    domain: "3dprint.nih.gov",
  },
];

export function PrintingScreen() {
  const navigation = useNavigation<Nav>();

  // A6: live 3D Models from the shared products table (same rows the
  // website's "Models we print" section renders). Best-effort: offline or
  // unconfigured Supabase simply hides the section.
  // U-47v5 (owner: "use the search and the filters just like the electronic
  // product tabs page"): the model library is now a first-class catalog —
  // search + category + sort + price ceiling + in-stock, exactly like
  // ShopScreen, and the store grid sits at the TOP of the tab (offers,
  // workflow, and library links moved below it).
  const [models, setModels] = useState<Product[]>([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<SortOption>("featured");
  const [maxPrice, setMaxPrice] = useState(0);
  const [inStock, setInStock] = useState(false);
  const [page, setPage] = useState(1);
  // U-48: pull-to-refresh — re-run the catalog read; spinner tracks it.
  const [refreshing, setRefreshing] = useState(false);

  // 2026-11-13: live print service content (materials, rates, promotion) and
  // the text-only quote request. The website owns the data and the pipeline;
  // this screen only submits. Attachments stay web-only for now.
  const [printContent, setPrintContent] = useState<PrintContent | null>(null);
  const [quote, setQuote] = useState({
    name: "",
    email: "",
    phone: "",
    material: "",
    quantity: "1",
    dimensions: "",
    timeline: "",
    description: "",
  });
  const [sendingQuote, setSendingQuote] = useState(false);
  const [quoteFiles, setQuoteFiles] = useState<QuoteAttachment[]>([]);
  const [quoteStatus, setQuoteStatus] = useState<{
    text: string;
    isError: boolean;
  } | null>(null);
  // Estimator — same rules the website calculator uses, fed by /api/print.
  const [estimateInput, setEstimateInput] = useState({
    materialId: "",
    weight: "100",
    quantity: "1",
    design: false,
    finishing: [] as string[],
  });
  const load = useCallback(async () => {
    try {
      const { products, source } = await getProductsWithSource();
      setModels(
        products.filter(
          (p) =>
            p.category?.trim().toLowerCase() === "3d models" &&
            p.active !== false,
        ),
      );
      // "bundled" (the website's fallback catalog) is offline data too.
      setOffline(source !== "live");
    } catch {
      // keep previous data
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let active = true;
    void getPrintContent().then(({ content }) => {
      if (active) setPrintContent(content);
    });
    // Prefill the signed-in customer's email; guests can still submit.
    supabase.auth
      .getUser()
      .then(({ data }) => {
        const email = data.user?.email;
        if (active && email) setQuote((current) => ({ ...current, email }));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function pickQuoteFiles() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: ["application/*", "image/*"],
      });
      if (result.canceled) return;
      const picked: QuoteAttachment[] = result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.name ?? "attachment",
        size: asset.size ?? 0,
        mimeType: asset.mimeType ?? "",
      }));
      const next = [...quoteFiles, ...picked];
      const check = checkQuoteAttachments(next);
      if (!check.ok) {
        setQuoteStatus({ text: check.error, isError: true });
        return;
      }
      setQuoteStatus(null);
      setQuoteFiles(next);
    } catch {
      setQuoteStatus({
        text: "Could not open the file picker. Try again, or email us the file.",
        isError: true,
      });
    }
  }

  async function sendQuote() {
    setQuoteStatus(null);
    setSendingQuote(true);
    try {
      const result = await submitPrintQuote({
        ...quote,
        quantity: Number(quote.quantity),
        files: quoteFiles,
      });
      if (!result.ok) {
        setQuoteStatus({ text: result.error, isError: true });
        return;
      }
      setQuoteStatus({
        text: "Thanks — your request is in. We will review it and send a quote.",
        isError: false,
      });
      setQuote((current) => ({
        ...current,
        material: "",
        quantity: "1",
        dimensions: "",
        timeline: "",
        description: "",
      }));
      setQuoteFiles([]);
    } finally {
      setSendingQuote(false);
    }
  }
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);
  const categories = useMemo(() => distinctCategories(models), [models]);
  const visible = useMemo(
    () =>
      inStockOnly(
        withinPrice(
          sortProducts(filterProducts(models, category, query), sort),
          maxPrice,
        ),
        inStock,
      ),
    [models, category, query, sort, maxPrice, inStock],
  );
  useEffect(() => {
    setPage(1);
  }, [category, query, sort, maxPrice, inStock]);
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [visible, safePage],
  );

  // Estimator inputs (2026-11-13): same rules as the website calculator, and
  // only shown when the owner has approved pricing and switched it on —
  // /api/print already zeroes draft rates, so a draft state cannot price.
  const pricedMaterials = useMemo(
    () => (printContent?.materials ?? []).filter((m) => m.ratePerGram > 0),
    [printContent],
  );
  const estimateMaterial =
    pricedMaterials.find((m) => m.id === estimateInput.materialId) ??
    pricedMaterials[0];
  const estimate = useMemo(
    () =>
      printContent && estimateMaterial
        ? estimatePrint({
            weightGrams: Number(estimateInput.weight) || 0,
            quantity: Number(estimateInput.quantity) || 1,
            materialRatePerGram: estimateMaterial.ratePerGram,
            designRequested: estimateInput.design,
            finishingIds: estimateInput.finishing,
            rules: {
              minimumOrder: printContent.minimumOrder,
              designBaseCharge: printContent.designBaseCharge,
              finishingCharges: printContent.finishingCharges,
              bulkTiers: printContent.bulkTiers,
            },
          })
        : null,
    [printContent, estimateMaterial, estimateInput],
  );
  const showEstimator =
    printContent?.calculatorEnabled === true && pricedMaterials.length > 0;

  return (
    <ScrollView
      className="flex-1 bg-surface"
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* ── The 3D Products store FIRST (owner: "include all the product
          thing at the top … other things down below those") ── */}
      <View className="px-5 pt-6">
        <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
          3D Products
        </Text>
        <Text className="mt-2 font-display text-2xl font-bold text-ink">
          Printed in-house, on request.
        </Text>
      </View>

      {/* Live promotion — only rendered when the website has one published. */}
      {printContent?.promotion && (
        <View className="mx-5 mt-4 rounded-2xl border border-gold/40 bg-gold/10 p-4">
          {printContent.promotion.discountType !== "none" &&
            printContent.promotion.discountValue > 0 && (
              <Text className="text-[10px] font-black uppercase tracking-[0.24em] text-gold-dark">
                {printContent.promotion.discountType === "percent"
                  ? `${printContent.promotion.discountValue}% off`
                  : `NPR ${printContent.promotion.discountValue} off`}
              </Text>
            )}
          <Text className="mt-1 font-display text-lg font-bold text-ink">
            {printContent.promotion.title}
          </Text>
          {printContent.promotion.body ? (
            <Text className="mt-1 text-sm leading-6 text-muted">
              {printContent.promotion.body}
            </Text>
          ) : null}
          {printContent.promotion.ctaLabel ? (
            <Pressable
              onPress={() => {
                const href = printContent.promotion?.ctaHref ?? "";
                const url = href.startsWith("http")
                  ? href
                  : `https://genumsolutions-website.vercel.app/3d-printing${
                      href.startsWith("#") ? href : ""
                    }`;
                void Linking.openURL(url);
              }}
              accessibilityRole="link"
              className="mt-3 self-start rounded-full bg-ink px-4 py-2"
            >
              <Text className="text-xs font-black text-white">
                {printContent.promotion.ctaLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {/* Search — same control as the Electronic Products tab */}
      <View className="px-5 pt-4">
        <View className="flex-row items-center rounded-xl border border-line bg-card px-3">
          <Feather name="search" size={16} color="#64748b" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search 3D products…"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            className="flex-1 px-2 py-2.5 text-sm text-ink"
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => setQuery("")}
              accessibilityLabel="Clear search"
            >
              <Feather name="x" size={16} color="#64748b" />
            </Pressable>
          )}
        </View>
      </View>

      {offline && (
        <View className="px-5 pt-2">
          <OfflineBadge />
        </View>
      )}

      {/* Filters — same stack as the Electronic Products tab */}
      <View className="gap-2 px-5 pt-3">
        <CategoryDropdown
          value={category}
          options={["All", ...categories]}
          onChange={setCategory}
          placeholder="All categories"
          title="Filter by category"
        />
        <View className="flex-row gap-2">
          <CategoryDropdown
            value={SORT_LABELS[sort]}
            options={Object.values(SORT_LABELS)}
            onChange={(label) => {
              const entry = (
                Object.entries(SORT_LABELS) as [SortOption, string][]
              ).find(([, l]) => l === label);
              if (entry) setSort(entry[0]);
            }}
            placeholder="Sort: Featured"
            title="Sort products"
            buttonClassName="flex-1"
          />
          <CategoryDropdown
            value={priceCeilingLabel(maxPrice)}
            options={PRICE_CEILINGS.map(priceCeilingLabel)}
            onChange={(label) => {
              const entry = PRICE_CEILINGS.find(
                (c) => priceCeilingLabel(c) === label,
              );
              if (entry != null) setMaxPrice(entry);
            }}
            placeholder="Any price"
            title="Maximum price"
            buttonClassName="flex-1"
          />
        </View>
        <Pressable
          onPress={() => setInStock((current) => !current)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: inStock }}
          className="flex-row items-center self-start rounded-lg border border-line bg-card px-3 py-2"
        >
          <Feather
            name={inStock ? "check-square" : "square"}
            size={16}
            color={inStock ? "#1e3a8a" : "#94a3b8"}
          />
          <Text className="ml-2 text-sm text-ink">In stock only</Text>
        </Pressable>
      </View>

      {/* Store grid — 2 per row, same ProductCard as every other catalog */}
      {loading ? (
        <View className="items-center py-10">
          <ActivityIndicator size="large" color="#1e3a8a" />
        </View>
      ) : (
        <View className="mt-4 px-5">
          <View className="flex-row flex-wrap" style={{ marginHorizontal: -6 }}>
            {pageItems.map((model) => (
              <View key={model.id} style={{ width: "50%", padding: 6 }}>
                <ProductCard product={model} />
              </View>
            ))}
          </View>
          {visible.length === 0 && (
            <View className="items-center py-10">
              <Feather name="inbox" size={40} color="#cbd5e1" />
              <Text className="mt-3 text-sm text-muted">
                No 3D products match your filters.
              </Text>
              {(maxPrice > 0 || inStock || category !== "All" || query) && (
                <Pressable
                  onPress={() => {
                    setMaxPrice(0);
                    setInStock(false);
                    setCategory("All");
                    setQuery("");
                  }}
                  className="mt-4 rounded-full border border-navy px-5 py-2"
                  accessibilityLabel="Clear filters"
                >
                  <Text className="text-xs font-black text-navy">
                    Clear filters
                  </Text>
                </Pressable>
              )}
            </View>
          )}
          <PagePager
            page={safePage}
            totalPages={totalPages}
            onPage={setPage}
            totalItems={visible.length}
          />
        </View>
      )}
      <View className="px-5 pt-6">
        <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
          3D printing · new vertical
        </Text>
        <Text className="mt-2 font-display text-3xl font-bold text-ink">
          From a sketch to a thing you can hold.
        </Text>
        <Text className="mt-3 text-base leading-7 text-muted">
          GENUM is adding print-to-order fabrication for Nepal makers, students,
          product teams, and classrooms. Start with a file, a reference object,
          or a rough idea.
        </Text>
        {printContent && printContent.materials.length > 0 && (
          <View
            className="mt-4 flex-row flex-wrap"
            style={{ marginHorizontal: -4 }}
          >
            {printContent.materials.map((material) => (
              <View
                key={material.id}
                className="m-1 rounded-full border border-line bg-card px-3 py-1.5"
              >
                <Text className="text-xs font-bold text-ink">
                  {material.name}
                  <Text className="font-medium text-muted">
                    {material.ratePerGram > 0
                      ? ` · NPR ${material.ratePerGram}/g`
                      : " · rate on request"}
                  </Text>
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Estimator — the website's calculator rules, rendered only when the
          owner approved the rates. Anything unavailable says "quote" instead
          of inventing a number. */}
      {showEstimator && estimate && (
        <View className="mx-5 mb-8 rounded-2xl border border-line bg-card p-5">
          <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
            Print calculator
          </Text>
          <Text className="mt-2 font-display text-2xl font-bold text-ink">
            Estimate before you commit.
          </Text>
          <Text className="mt-1 text-sm leading-6 text-muted">
            Your slicer shows the printed weight — enter it and choose options.
          </Text>
          <View
            className="mt-4 flex-row flex-wrap"
            style={{ marginHorizontal: -4 }}
          >
            {pricedMaterials.map((material) => {
              const selected = estimateMaterial?.id === material.id;
              return (
                <Pressable
                  key={material.id}
                  onPress={() =>
                    setEstimateInput((current) => ({
                      ...current,
                      materialId: material.id,
                    }))
                  }
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  className={`m-1 rounded-full border px-3 py-1.5 ${
                    selected ? "border-navy bg-navy" : "border-line bg-white"
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      selected ? "text-white" : "text-ink"
                    }`}
                  >
                    {material.name} · NPR {material.ratePerGram}/g
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View className="mt-3 flex-row" style={{ marginHorizontal: -4 }}>
            <View style={{ width: "50%", padding: 4 }}>
              <Text className="text-xs font-bold text-muted">
                Weight (grams)
              </Text>
              <TextInput
                value={estimateInput.weight}
                onChangeText={(weight) =>
                  setEstimateInput((current) => ({ ...current, weight }))
                }
                keyboardType="number-pad"
                accessibilityLabel="Printed weight in grams"
                className="mt-1 rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink"
              />
            </View>
            <View style={{ width: "50%", padding: 4 }}>
              <Text className="text-xs font-bold text-muted">Quantity</Text>
              <TextInput
                value={estimateInput.quantity}
                onChangeText={(quantity) =>
                  setEstimateInput((current) => ({ ...current, quantity }))
                }
                keyboardType="number-pad"
                accessibilityLabel="Quantity"
                className="mt-1 rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink"
              />
            </View>
          </View>
          <Pressable
            onPress={() =>
              setEstimateInput((current) => ({
                ...current,
                design: !current.design,
              }))
            }
            accessibilityRole="checkbox"
            accessibilityState={{ checked: estimateInput.design }}
            className="mt-2 flex-row items-center self-start"
          >
            <Feather
              name={estimateInput.design ? "check-square" : "square"}
              size={16}
              color={estimateInput.design ? "#1e3a8a" : "#94a3b8"}
            />
            <Text className="ml-2 text-sm text-ink">I need design help</Text>
          </Pressable>
          {(printContent?.finishingCharges.length ?? 0) > 0 && (
            <View className="mt-3 flex-row flex-wrap">
              {printContent?.finishingCharges.map((charge) => {
                const selected = estimateInput.finishing.includes(charge.id);
                return (
                  <Pressable
                    key={charge.id}
                    onPress={() =>
                      setEstimateInput((current) => ({
                        ...current,
                        finishing: selected
                          ? current.finishing.filter((id) => id !== charge.id)
                          : [...current.finishing, charge.id],
                      }))
                    }
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    className={`mr-2 mt-1 rounded-full border px-3 py-1.5 ${
                      selected ? "border-navy bg-navy" : "border-line bg-white"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        selected ? "text-white" : "text-ink"
                      }`}
                    >
                      {charge.name} · NPR {charge.amount}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <View className="mt-4 rounded-xl bg-mist p-4">
            {estimate.available ? (
              <>
                <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
                  Estimated
                </Text>
                <Text className="mt-1 font-display text-3xl font-bold text-ink">
                  NPR {estimate.total.toLocaleString("en-IN")}
                </Text>
                <Text className="mt-1 text-xs text-muted">
                  Material · {estimate.totalGrams} g
                  {estimate.designCost > 0
                    ? ` · design NPR ${estimate.designCost.toLocaleString("en-IN")}`
                    : ""}
                  {estimate.discountAmount > 0
                    ? ` · −NPR ${estimate.discountAmount.toLocaleString("en-IN")} (${estimate.discountPercent}%)`
                    : ""}
                  {estimate.minimumApplied ? " · minimum applied" : ""}
                </Text>
                <Text className="mt-3 text-xs leading-5 text-muted">
                  {printContent?.disclaimer}
                </Text>
                <Pressable
                  onPress={() => {
                    setQuote((current) => ({
                      ...current,
                      material: estimateMaterial?.name ?? "",
                      quantity: String(estimate.quantity),
                    }));
                    setQuoteStatus({
                      text: "Estimate copied into the request below — send it for a firm quote.",
                      isError: false,
                    });
                  }}
                  className="mt-3 h-11 items-center justify-center rounded-full bg-gold px-5"
                >
                  <Text className="text-sm font-black text-ink">
                    Send this for a firm quote
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
                  Price on review
                </Text>
                <Text className="mt-2 text-sm leading-6 text-muted">
                  {estimate.reason}
                </Text>
              </>
            )}
          </View>
        </View>
      )}

      <View className="px-5 py-8">
        <View className="gap-4">
          {offers.map((offer) => (
            <View
              key={offer.title}
              className="border-t-2 border-ink bg-card p-5"
            >
              <Text className="text-xs font-black uppercase tracking-widest text-navy">
                {offer.meta}
              </Text>
              <Text className="mt-3 font-display text-xl font-bold text-ink">
                {offer.title}
              </Text>
              <Text className="mt-2 text-sm leading-6 text-muted">
                {offer.text}
              </Text>
              <Pressable
                onPress={() => navigation.push("Contact")}
                className="mt-5 flex-row items-center h-12 items-center gap-1.5 rounded-full bg-navy px-5"
              >
                <Text className="text-sm font-bold text-white">
                  Request a quote
                </Text>
                <Feather name="arrow-up-right" size={14} color="#ffffff" />
              </Pressable>
            </View>
          ))}
        </View>
      </View>

      {/* Text-only quote request — the website route validates, stores and
          emails it; attachments stay on the website for now. */}
      <View className="mx-5 mb-8 rounded-2xl bg-ink p-5">
        <Text className="text-xs font-black uppercase tracking-[0.24em] text-gold">
          Send a request
        </Text>
        <Text className="mt-2 font-display text-2xl font-bold text-white">
          Tell us what you need printed.
        </Text>
        <Text className="mt-2 text-sm leading-6 text-white/70">
          We review the part, material and finish, then send a firm quote.
          Attach STL, STEP or photos below — up to {MAX_QUOTE_FILES} files.
        </Text>

        <View
          className="mt-4 flex-row flex-wrap"
          style={{ marginHorizontal: -4 }}
        >
          {[
            {
              key: "name",
              label: "Name",
              value: quote.name,
              placeholder: "Your name",
              autoCapitalize: "words" as const,
            },
            {
              key: "email",
              label: "Email",
              value: quote.email,
              placeholder: "you@example.com",
              keyboardType: "email-address" as const,
            },
            {
              key: "phone",
              label: "Phone (optional)",
              value: quote.phone,
              placeholder: "98XXXXXXXX",
              keyboardType: "phone-pad" as const,
            },
            {
              key: "quantity",
              label: "Quantity",
              value: quote.quantity,
              placeholder: "1",
              keyboardType: "number-pad" as const,
            },
            {
              key: "dimensions",
              label: "Size (optional)",
              value: quote.dimensions,
              placeholder: "12 × 8 × 10 cm",
            },
            {
              key: "timeline",
              label: "Needed by (optional)",
              value: quote.timeline,
              placeholder: "within 2 weeks",
            },
          ].map((field) => (
            <View key={field.key} style={{ width: "50%", padding: 4 }}>
              <Text className="text-xs font-bold text-white/80">
                {field.label}
              </Text>
              <TextInput
                value={field.value}
                onChangeText={(text) =>
                  setQuote((current) => ({ ...current, [field.key]: text }))
                }
                placeholder={field.placeholder}
                placeholderTextColor="#94a3b8"
                keyboardType={field.keyboardType}
                autoCapitalize={field.autoCapitalize ?? "none"}
                accessibilityLabel={field.label}
                className="mt-1 rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-sm text-white"
              />
            </View>
          ))}
          <View style={{ width: "100%", padding: 4 }}>
            <Text className="text-xs font-bold text-white/80">Material</Text>
            <View className="mt-1 flex-row flex-wrap">
              {[
                { id: "", name: "Not sure" },
                ...(printContent?.materials ?? []).map((m) => ({
                  id: m.name,
                  name: m.name,
                })),
              ].map((option) => {
                const selected = quote.material === option.id;
                return (
                  <Pressable
                    key={option.id || "any"}
                    onPress={() =>
                      setQuote((current) => ({
                        ...current,
                        material: option.id,
                      }))
                    }
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    className={`mr-2 mt-1 rounded-full border px-3 py-1.5 ${
                      selected
                        ? "border-gold bg-gold"
                        : "border-white/25 bg-white/5"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        selected ? "text-ink" : "text-white/80"
                      }`}
                    >
                      {option.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ width: "100%", padding: 4 }}>
            <Text className="text-xs font-bold text-white/80">
              Describe the part
            </Text>
            <TextInput
              value={quote.description}
              onChangeText={(text) =>
                setQuote((current) => ({ ...current, description: text }))
              }
              placeholder="What is it for, and does it need to fit or hold anything?"
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={4}
              accessibilityLabel="Describe the part"
              className="mt-1 min-h-[96px] rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-sm text-white"
              textAlignVertical="top"
            />
          </View>
          <View style={{ width: "100%", padding: 4 }}>
            <Text className="text-xs font-bold text-white/80">
              Files (optional)
            </Text>
            <Pressable
              onPress={() => void pickQuoteFiles()}
              accessibilityRole="button"
              accessibilityLabel="Attach 3D files or photos"
              className="mt-1 flex-row items-center justify-between rounded-lg border border-white/20 bg-white/5 px-3 py-3"
            >
              <Text className="text-sm text-white/80">
                {attachmentSummary(quoteFiles)}
              </Text>
              <Feather name="paperclip" size={16} color="#cbd5e1" />
            </Pressable>
            <Text className="mt-1 text-[11px] leading-4 text-white/50">
              {QUOTE_FILES_ERROR}
            </Text>
            {quoteFiles.map((file, index) => (
              <View
                key={`${file.uri}-${index}`}
                className="mt-2 flex-row items-center justify-between rounded-lg bg-white/5 px-3 py-2"
              >
                <Text
                  className="mr-3 flex-1 text-xs text-white/80"
                  numberOfLines={1}
                >
                  {file.name}
                </Text>
                <Pressable
                  onPress={() =>
                    setQuoteFiles((current) =>
                      current.filter((_, i) => i !== index),
                    )
                  }
                  accessibilityLabel={`Remove ${file.name}`}
                >
                  <Feather name="x" size={16} color="#cbd5e1" />
                </Pressable>
              </View>
            ))}
          </View>
        </View>

        {quoteStatus && (
          <Text
            accessibilityRole="alert"
            className={`mt-3 rounded-lg px-3 py-2 text-sm font-bold ${
              quoteStatus.isError
                ? "bg-red-500/15 text-red-300"
                : "bg-emerald-500/15 text-emerald-300"
            }`}
          >
            {quoteStatus.text}
          </Text>
        )}

        <Pressable
          onPress={() => void sendQuote()}
          disabled={sendingQuote}
          accessibilityState={{ disabled: sendingQuote }}
          className="mt-4 h-12 flex-row items-center justify-center rounded-full bg-gold px-5"
        >
          {sendingQuote ? (
            <ActivityIndicator color="#0f172a" />
          ) : (
            <Text className="text-sm font-black text-ink">Request a quote</Text>
          )}
        </Pressable>
      </View>

      {/* U-47v5: the store grid now lives at the TOP of the tab with the
          full search/filter stack (owner request) — the old duplicate
          section that sat here was removed; offers continue below. */}

      <View className="mx-5 mb-8">
        <View className="gap-6 border-t border-b border-line py-8">
          <View>
            <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
              The workflow
            </Text>
            <Text className="mt-3 font-display text-2xl font-bold text-ink">
              A useful loop, not a mystery box.
            </Text>
          </View>
          <View className="gap-4">
            {[
              "01 · Share — Send an STL, STEP, sketch, or reference.",
              "02 · Review — We check fit, material, supports, and finish.",
              "03 · Print — You approve the estimate before the machine starts.",
              "04 · Learn — Get the part plus notes for the next iteration.",
            ].map((step) => (
              <View key={step} className="border-l-2 border-gold pl-4">
                <Text className="text-sm leading-6 text-muted">{step}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Open model library */}
      <View className="mx-5 mb-8 border-t border-line pt-8">
        <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
          Open model library
        </Text>
        <Text className="mt-2 font-display text-2xl font-bold text-ink">
          Browse before you design.
        </Text>
        <Text className="mt-1 text-sm leading-6 text-muted">
          These libraries open in a separate browser tab - they do not allow
          embedding, so we link straight to the source.
        </Text>
        <View className="mt-6 gap-4 sm: ">
          {modelSites.map((site) => (
            <Pressable
              key={site.name}
              onPress={() => void Linking.openURL(site.url)}
              className="rounded-2xl border border-line bg-card p-5"
            >
              <View className="flex-row items-center justify-between">
                <View className="h-9 w-9 items-center justify-center rounded-full bg-navy-light">
                  <Feather name="globe" size={16} color="#1e3a8a" />
                </View>
                <Feather name="external-link" size={18} color="#94a3b8" />
              </View>
              <Text className="mt-4 font-display text-lg font-bold text-ink">
                {site.name}
              </Text>
              <Text className="mt-1.5 text-sm leading-6 text-muted">
                {site.blurb}
              </Text>
              <Text className="mt-3 text-xs font-bold uppercase tracking-widest text-navy">
                {site.domain}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="mx-5 mb-8 rounded-2xl bg-ink p-6">
        <Text className="text-xs font-black uppercase tracking-[0.24em] text-gold">
          Have a file?
        </Text>
        <Text className="mt-2 font-display text-xl font-bold text-ink">
          Let us review the first print.
        </Text>
        <Pressable
          onPress={() => navigation.push("Contact")}
          className="mt-4 flex-row items-center h-12 items-center gap-1.5 rounded-full bg-gold px-5"
        >
          <Text className="text-sm font-bold text-ink">
            Request a print review
          </Text>
          <Feather name="arrow-up-right" size={14} color="#1e3a8a" />
        </Pressable>
      </View>
    </ScrollView>
  );
}
