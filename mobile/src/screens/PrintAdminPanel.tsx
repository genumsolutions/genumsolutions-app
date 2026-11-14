// =====================================================================
// PrintAdminPanel — the app mirror of the website's Admin → 3D Products
// studio (components/admin/AdminPrint.tsx).
//
// Sections: Categories · Pricing (materials + calculator + approval) ·
// Costs (internal) · Promotions · Services · Gallery · Requests · Reports.
// "Catalog" stays with the existing 3D product list in AdminScreen.
//
// Every read/write goes through printAdminService; the print_* tables grant
// staff writes, and approval stays admin-only in the UI (RLS is looser).
// =====================================================================
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  PRINT_QUOTE_STATUSES,
  PRINT_QUOTE_STATUS_LABELS,
  defaultPrintSettings,
  deletePrintRecord,
  derivePrintReports,
  loadPrintAdminData,
  savePrintCategory,
  savePrintCosting,
  savePrintGalleryItem,
  savePrintMaterial,
  savePrintPromotion,
  savePrintService,
  savePrintSettings,
  setPrintApproval,
  updatePrintQuote,
  type PrintAdminData,
  type PrintCategory,
  type PrintGalleryItem,
  type PrintMaterial,
  type PrintPromotion,
  type PrintQuote,
  type PrintQuoteStatus,
  type PrintServiceItem,
  type PrintSettings,
} from "../services/printAdminService";
import {
  defaultPrintCosting,
  costingStatus,
  type PrintCosting,
} from "../lib/print-costing";

export const PRINT_ADMIN_SECTIONS = [
  "Categories",
  "Pricing",
  "Costs",
  "Promotions",
  "Services",
  "Gallery",
  "Requests",
  "Reports",
] as const;

export type PrintAdminSection = (typeof PRINT_ADMIN_SECTIONS)[number];

const inputClass =
  "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink";
const labelClass = "mb-1 text-xs font-bold text-muted";

const emptyCategory: PrintCategory = {
  id: "",
  name: "",
  description: "",
  imageUrl: "",
  sortOrder: 1000,
  active: true,
};

const emptyMaterial: PrintMaterial = {
  id: "",
  name: "",
  description: "",
  ratePerGram: 0,
  note: "",
  sortOrder: 1000,
  active: true,
};

const emptyPromotion: PrintPromotion = {
  id: "",
  title: "",
  body: "",
  imageUrl: "",
  ctaLabel: "",
  ctaHref: "",
  discountType: "none",
  discountValue: 0,
  startsAt: null,
  endsAt: null,
  active: false,
  sortOrder: 1000,
};

const emptyGallery: PrintGalleryItem = {
  id: "",
  imageUrl: "",
  caption: "",
  category: "",
  featured: false,
  active: true,
  sortOrder: 1000,
};

const emptyService: PrintServiceItem = {
  id: "",
  title: "",
  description: "",
  priceNote: "",
  sortOrder: 1000,
  active: true,
};

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View className="mb-3 rounded-xl border border-line bg-card p-3">
      {children}
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  numeric,
  decimal,
  multiline,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
  decimal?: boolean;
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <View className="mb-2 flex-1">
      <Text className={labelClass}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#8a8f98"
        keyboardType={
          decimal ? "decimal-pad" : numeric ? "number-pad" : "default"
        }
        multiline={multiline}
        className={`${inputClass} ${multiline ? "min-h-[64px]" : ""}`}
      />
    </View>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View className="mb-2 flex-row items-center justify-between gap-3">
      <Text className="min-w-0 flex-1 text-xs font-bold text-muted">
        {label}
      </Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

function Button({
  label,
  onPress,
  busy,
  disabled,
  tone = "primary",
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: "primary" | "ghost" | "danger";
}) {
  const base =
    tone === "primary"
      ? "bg-navy"
      : tone === "danger"
        ? "border border-line bg-card"
        : "border border-line bg-surface";
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`rounded-full px-4 py-2 ${base} ${busy || disabled ? "opacity-60" : ""}`}
    >
      <Text
        className={`text-xs font-black ${tone === "primary" ? "text-white" : tone === "danger" ? "text-red-600" : "text-ink"}`}
      >
        {busy ? "Saving…" : label}
      </Text>
    </Pressable>
  );
}

/** The section chips shown above the 3D Products console. */
export function PrintSectionTabs({
  value,
  onChange,
}: {
  value: PrintAdminSection | "Catalog";
  onChange: (next: PrintAdminSection | "Catalog") => void;
}) {
  const items: (PrintAdminSection | "Catalog")[] = [
    "Catalog",
    ...PRINT_ADMIN_SECTIONS,
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="mb-3 mt-1"
      contentContainerStyle={{ gap: 8 }}
    >
      {items.map((item) => {
        const active = item === value;
        return (
          <Pressable
            key={item}
            onPress={() => onChange(item)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={`rounded-full px-3 py-1.5 ${active ? "bg-navy" : "border border-line bg-card"}`}
          >
            <Text
              className={`text-[11px] font-black ${active ? "text-white" : "text-ink"}`}
            >
              {item}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function PrintAdminPanel({
  section,
  canApprove,
  canDelete,
  approverEmail,
}: {
  section: PrintAdminSection;
  canApprove: boolean;
  canDelete: boolean;
  approverEmail: string;
}) {
  const [data, setData] = useState<PrintAdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const [settings, setSettings] = useState<PrintSettings>(defaultPrintSettings);
  const [materials, setMaterials] = useState<PrintMaterial[]>([]);
  const [costing, setCosting] = useState<PrintCosting>(defaultPrintCosting);
  const [category, setCategory] = useState<PrintCategory | null>(null);
  const [promotion, setPromotion] = useState<PrintPromotion | null>(null);
  const [galleryItem, setGalleryItem] = useState<PrintGalleryItem | null>(null);
  const [service, setService] = useState<PrintServiceItem | null>(null);
  const [quote, setQuote] = useState<PrintQuote | null>(null);

  const reload = useCallback(async () => {
    try {
      const next = await loadPrintAdminData();
      setData(next);
      setSettings(next.settings);
      setMaterials(next.materials);
      setCosting(next.costing);
      setNotice("");
    } catch (error) {
      setNotice(String((error as Error)?.message || error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true);
    try {
      await action();
      setNotice(done);
      await reload();
    } catch (error) {
      setNotice(String((error as Error)?.message || error));
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(
    kind: "category" | "material" | "promotion" | "gallery" | "service",
    id: string,
  ) {
    Alert.alert("Delete this row?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          void run(async () => {
            await deletePrintRecord(kind, id);
            setCategory(null);
            setPromotion(null);
            setGalleryItem(null);
            setService(null);
          }, "Deleted."),
      },
    ]);
  }

  if (loading) {
    return (
      <View className="items-center py-10">
        <ActivityIndicator />
        <Text className="mt-2 text-xs text-muted">
          Loading the 3D print studio…
        </Text>
      </View>
    );
  }

  if (!data) {
    return (
      <Card>
        <Text className="text-sm text-ink">
          {notice || "Could not load the 3D print studio."}
        </Text>
        <View className="mt-3">
          <Button label="Retry" onPress={() => void reload()} />
        </View>
      </Card>
    );
  }

  const noticeBar = notice ? (
    <Text className="mb-3 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink">
      {notice}
    </Text>
  ) : null;

  // ── Categories ─────────────────────────────────────────────────────
  if (section === "Categories") {
    const editor = category ?? emptyCategory;
    const patch = (part: Partial<PrintCategory>) =>
      setCategory({ ...editor, ...part });
    return (
      <View>
        {noticeBar}
        <View className="mb-3 flex-row items-center justify-between gap-2">
          <Text className="flex-1 text-xs text-muted">
            The buckets shown on /3d-printing and the app's 3D screen.
          </Text>
          <Button
            label="New"
            onPress={() => setCategory({ ...emptyCategory })}
            tone="ghost"
          />
        </View>
        <Card>
          <Text className="mb-2 font-display text-base font-bold text-ink">
            {category && category.id ? "Edit category" : "New category"}
          </Text>
          <Field
            label="Slug / id"
            value={editor.id}
            onChange={(id) => patch({ id })}
            placeholder="gifts"
          />
          <Field
            label="Name"
            value={editor.name}
            onChange={(name) => patch({ name })}
          />
          <Field
            label="Description"
            value={editor.description}
            onChange={(description) => patch({ description })}
            multiline
          />
          <Field
            label="Image URL"
            value={editor.imageUrl}
            onChange={(imageUrl) => patch({ imageUrl })}
          />
          <Field
            label="Sort order"
            value={String(editor.sortOrder)}
            onChange={(raw) =>
              patch({ sortOrder: Math.round(Number(raw) || 0) })
            }
            numeric
          />
          <Toggle
            label="Active"
            value={editor.active}
            onChange={(active) => patch({ active })}
          />
          <View className="mt-2 flex-row gap-2">
            <Button
              label="Save category"
              busy={busy}
              disabled={!editor.id.trim() || !editor.name.trim()}
              onPress={() =>
                void run(() => savePrintCategory(editor), "Category saved.")
              }
            />
            {category && category.id && canDelete ? (
              <Button
                label="Delete"
                tone="danger"
                onPress={() => confirmDelete("category", editor.id)}
              />
            ) : null}
          </View>
        </Card>
        {data.categories.map((item) => (
          <Card key={item.id}>
            <View className="flex-row items-center justify-between gap-2">
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-bold text-ink">{item.name}</Text>
                <Text className="text-xs text-muted">
                  {item.id} · sort {item.sortOrder}{" "}
                  {item.active ? "" : "· hidden"}
                </Text>
              </View>
              <Button
                label="Edit"
                tone="ghost"
                onPress={() => setCategory(item)}
              />
            </View>
          </Card>
        ))}
      </View>
    );
  }

  // ── Pricing: approval, selling rates, calculator rules ────────────
  if (section === "Pricing") {
    const approved = settings.pricingStatus === "approved";
    const patchSettings = (part: Partial<PrintSettings>) =>
      setSettings({ ...settings, ...part });
    return (
      <View>
        {noticeBar}
        <Card>
          <Text className="font-display text-base font-bold text-ink">
            Rates published?
          </Text>
          <Text className="mt-1 text-xs leading-5 text-muted">
            {approved
              ? `Published${settings.pricingApprovedBy ? ` by ${settings.pricingApprovedBy}` : ""}${
                  settings.pricingApprovedAt
                    ? ` on ${new Date(settings.pricingApprovedAt).toLocaleDateString()}`
                    : ""
                }`
              : 'Draft — customers see "rate on request" and no calculator.'}
          </Text>
          <View className="mt-3">
            {canApprove ? (
              <Button
                label={approved ? "Withdraw rates" : "Approve & publish rates"}
                busy={busy}
                onPress={() =>
                  void run(
                    () => setPrintApproval(!approved, approverEmail),
                    approved ? "Rates withdrawn." : "Rates published.",
                  )
                }
              />
            ) : (
              <Text className="text-[10px] font-black uppercase text-muted">
                Admin only
              </Text>
            )}
          </View>
        </Card>

        <Card>
          <Text className="mb-2 font-display text-base font-bold text-ink">
            Material rates
          </Text>
          <Text className="mb-3 text-xs text-muted">
            NPR per gram. Zero stays hidden from customers as "rate on request".
          </Text>
          {materials.map((material, index) => (
            <View
              key={material.id || index}
              className="mb-3 rounded-lg border border-line p-2"
            >
              <Text className="mb-1 text-sm font-bold text-ink">
                {material.name || "Material"}
              </Text>
              <View className="flex-row gap-2">
                <Field
                  label="NPR / g"
                  value={String(material.ratePerGram)}
                  numeric
                  onChange={(raw) => {
                    const next = [...materials];
                    next[index] = {
                      ...material,
                      ratePerGram: Math.max(0, Math.round(Number(raw) || 0)),
                    };
                    setMaterials(next);
                  }}
                />
                <Field
                  label="Note"
                  value={material.note}
                  onChange={(note) => {
                    const next = [...materials];
                    next[index] = { ...material, note };
                    setMaterials(next);
                  }}
                />
              </View>
              <Toggle
                label="Active"
                value={material.active}
                onChange={(active) => {
                  const next = [...materials];
                  next[index] = { ...material, active };
                  setMaterials(next);
                }}
              />
            </View>
          ))}
          <Button
            label="Save rates"
            busy={busy}
            onPress={() =>
              void run(async () => {
                for (const material of materials)
                  await savePrintMaterial(material);
              }, "Rates saved.")
            }
          />
        </Card>

        <Card>
          <Text className="mb-2 font-display text-base font-bold text-ink">
            Calculator
          </Text>
          <Toggle
            label="Calculator enabled"
            value={settings.calculatorEnabled}
            onChange={(calculatorEnabled) =>
              patchSettings({ calculatorEnabled })
            }
          />
          <View className="flex-row gap-2">
            <Field
              label="Minimum order (NPR)"
              value={String(settings.minimumOrder)}
              numeric
              onChange={(raw) =>
                patchSettings({
                  minimumOrder: Math.max(0, Math.round(Number(raw) || 0)),
                })
              }
            />
            <Field
              label="Design base charge (NPR)"
              value={String(settings.designBaseCharge)}
              numeric
              onChange={(raw) =>
                patchSettings({
                  designBaseCharge: Math.max(0, Math.round(Number(raw) || 0)),
                })
              }
            />
          </View>
          <Field
            label="Materials intro"
            value={settings.materialsIntro}
            onChange={(materialsIntro) => patchSettings({ materialsIntro })}
            multiline
          />
          <Field
            label="Disclaimer"
            value={settings.disclaimer}
            onChange={(disclaimer) => patchSettings({ disclaimer })}
            multiline
          />

          <Text className="mb-1 mt-2 text-xs font-bold text-muted">
            Bulk tiers
          </Text>
          {settings.bulkTiers.map((tier, index) => (
            <View
              key={`tier-${index}`}
              className="mb-2 flex-row items-end gap-2"
            >
              <Field
                label="Min qty"
                value={String(tier.minQty)}
                numeric
                onChange={(raw) => {
                  const next = [...settings.bulkTiers];
                  next[index] = {
                    ...tier,
                    minQty: Math.max(1, Math.round(Number(raw) || 1)),
                  };
                  patchSettings({ bulkTiers: next });
                }}
              />
              <Field
                label="Discount %"
                value={String(tier.discountPercent)}
                numeric
                onChange={(raw) => {
                  const next = [...settings.bulkTiers];
                  next[index] = {
                    ...tier,
                    discountPercent: Math.min(
                      90,
                      Math.max(0, Math.round(Number(raw) || 0)),
                    ),
                  };
                  patchSettings({ bulkTiers: next });
                }}
              />
              <Button
                label="Remove"
                tone="danger"
                onPress={() =>
                  patchSettings({
                    bulkTiers: settings.bulkTiers.filter((_, i) => i !== index),
                  })
                }
              />
            </View>
          ))}
          <Button
            label="Add tier"
            tone="ghost"
            onPress={() =>
              patchSettings({
                bulkTiers: [
                  ...settings.bulkTiers,
                  { minQty: 10, discountPercent: 5 },
                ],
              })
            }
          />

          <Text className="mb-1 mt-3 text-xs font-bold text-muted">
            Finishing charges
          </Text>
          {settings.finishingCharges.map((charge, index) => (
            <View
              key={`charge-${index}`}
              className="mb-2 flex-row items-end gap-2"
            >
              <Field
                label="Name"
                value={charge.name}
                onChange={(name) => {
                  const next = [...settings.finishingCharges];
                  next[index] = { ...charge, name, id: charge.id || name };
                  patchSettings({ finishingCharges: next });
                }}
              />
              <Field
                label="NPR"
                value={String(charge.amount)}
                numeric
                onChange={(raw) => {
                  const next = [...settings.finishingCharges];
                  next[index] = {
                    ...charge,
                    amount: Math.max(0, Math.round(Number(raw) || 0)),
                  };
                  patchSettings({ finishingCharges: next });
                }}
              />
              <Button
                label="Remove"
                tone="danger"
                onPress={() =>
                  patchSettings({
                    finishingCharges: settings.finishingCharges.filter(
                      (_, i) => i !== index,
                    ),
                  })
                }
              />
            </View>
          ))}
          <Button
            label="Add charge"
            tone="ghost"
            onPress={() =>
              patchSettings({
                finishingCharges: [
                  ...settings.finishingCharges,
                  { id: "", name: "", amount: 0 },
                ],
              })
            }
          />

          <View className="mt-3">
            <Button
              label="Save settings"
              busy={busy}
              onPress={() =>
                void run(() => savePrintSettings(settings), "Settings saved.")
              }
            />
          </View>
        </Card>
      </View>
    );
  }

  // ── Costs (internal, staff-only) ───────────────────────────────────
  if (section === "Costs") {
    const patch = (part: Partial<PrintCosting>) =>
      setCosting({ ...costing, ...part });
    const status = costingStatus(costing);
    return (
      <View>
        {noticeBar}
        <Card>
          <Text className="font-display text-base font-bold text-ink">
            Costing sheet
          </Text>
          <Text className="mt-1 text-xs leading-5 text-muted">
            Internal only — never shown to a customer. Every figure starts at
            zero on purpose; margins print "—" until the sheet is complete.
          </Text>
          <Text className="mt-2 text-xs font-bold text-ink">
            {status.complete
              ? "Complete"
              : `Missing: ${status.missing.join(", ")}`}
          </Text>
        </Card>
        <Card>
          <View className="flex-row gap-2">
            <Field
              label="Filament / g"
              value={String(costing.filamentCostPerGram)}
              decimal
              onChange={(raw) =>
                patch({ filamentCostPerGram: Number(raw) || 0 })
              }
            />
            <Field
              label="Waste %"
              value={String(costing.wastagePercent)}
              numeric
              onChange={(raw) =>
                patch({
                  wastagePercent: Math.min(100, Math.max(0, Number(raw) || 0)),
                })
              }
            />
          </View>
          <View className="flex-row gap-2">
            <Field
              label="Electricity / kWh"
              value={String(costing.electricityRatePerKwh)}
              decimal
              onChange={(raw) =>
                patch({ electricityRatePerKwh: Number(raw) || 0 })
              }
            />
            <Field
              label="Printer watts"
              value={String(costing.printerWatts)}
              numeric
              onChange={(raw) =>
                patch({ printerWatts: Math.round(Number(raw) || 0) })
              }
            />
          </View>
          <View className="flex-row gap-2">
            <Field
              label="Machine cost"
              value={String(costing.machineCost)}
              numeric
              onChange={(raw) =>
                patch({ machineCost: Math.round(Number(raw) || 0) })
              }
            />
            <Field
              label="Life hours"
              value={String(costing.machineLifeHours)}
              numeric
              onChange={(raw) =>
                patch({ machineLifeHours: Math.round(Number(raw) || 0) })
              }
            />
          </View>
          <View className="flex-row gap-2">
            <Field
              label="Maintenance / h"
              value={String(costing.maintenancePerHour)}
              decimal
              onChange={(raw) =>
                patch({ maintenancePerHour: Number(raw) || 0 })
              }
            />
            <Field
              label="Labour / h"
              value={String(costing.labourPerHour)}
              decimal
              onChange={(raw) => patch({ labourPerHour: Number(raw) || 0 })}
            />
          </View>
          <View className="flex-row gap-2">
            <Field
              label="Packaging / job"
              value={String(costing.packagingPerJob)}
              numeric
              onChange={(raw) =>
                patch({ packagingPerJob: Math.round(Number(raw) || 0) })
              }
            />
            <Field
              label="Payment fee %"
              value={String(costing.paymentFeePercent)}
              decimal
              onChange={(raw) => patch({ paymentFeePercent: Number(raw) || 0 })}
            />
          </View>
          <View className="flex-row gap-2">
            <Field
              label="Overhead / month"
              value={String(costing.overheadPerMonth)}
              numeric
              onChange={(raw) =>
                patch({ overheadPerMonth: Math.round(Number(raw) || 0) })
              }
            />
            <Field
              label="Order target / month"
              value={String(costing.monthlyOrderTarget)}
              numeric
              onChange={(raw) =>
                patch({ monthlyOrderTarget: Math.round(Number(raw) || 0) })
              }
            />
          </View>
          <Field
            label="Target margin %"
            value={String(costing.targetMarginPercent)}
            numeric
            onChange={(raw) =>
              patch({
                targetMarginPercent: Math.min(
                  95,
                  Math.max(0, Math.round(Number(raw) || 0)),
                ),
              })
            }
          />
          <Field
            label="Notes"
            value={costing.notes}
            onChange={(notes) => patch({ notes })}
            multiline
          />
          <Button
            label="Save costing"
            busy={busy}
            onPress={() =>
              void run(() => savePrintCosting(costing), "Costing saved.")
            }
          />
        </Card>
      </View>
    );
  }

  // ── Promotions ─────────────────────────────────────────────────────
  if (section === "Promotions") {
    const editor = promotion ?? emptyPromotion;
    const patch = (part: Partial<PrintPromotion>) =>
      setPromotion({ ...editor, ...part });
    return (
      <View>
        {noticeBar}
        <View className="mb-3 flex-row items-center justify-between gap-2">
          <Text className="flex-1 text-xs text-muted">
            Only one active, in-date promotion is shown to customers.
          </Text>
          <Button
            label="New"
            tone="ghost"
            onPress={() => setPromotion({ ...emptyPromotion })}
          />
        </View>
        <Card>
          <Text className="mb-2 font-display text-base font-bold text-ink">
            {editor.id ? "Edit promotion" : "New promotion"}
          </Text>
          <Field
            label="Title"
            value={editor.title}
            onChange={(title) => patch({ title })}
          />
          <Field
            label="Body"
            value={editor.body}
            onChange={(body) => patch({ body })}
            multiline
          />
          <Field
            label="Image URL"
            value={editor.imageUrl}
            onChange={(imageUrl) => patch({ imageUrl })}
          />
          <View className="flex-row gap-2">
            <Field
              label="CTA label"
              value={editor.ctaLabel}
              onChange={(ctaLabel) => patch({ ctaLabel })}
            />
            <Field
              label="CTA href"
              value={editor.ctaHref}
              onChange={(ctaHref) => patch({ ctaHref })}
            />
          </View>
          <View className="mb-2 flex-row gap-2">
            {(["none", "percent", "flat"] as const).map((type) => (
              <Pressable
                key={type}
                onPress={() => patch({ discountType: type })}
                className={`rounded-full px-3 py-1.5 ${
                  editor.discountType === type
                    ? "bg-navy"
                    : "border border-line bg-surface"
                }`}
              >
                <Text
                  className={`text-[11px] font-black ${
                    editor.discountType === type ? "text-white" : "text-ink"
                  }`}
                >
                  {type}
                </Text>
              </Pressable>
            ))}
          </View>
          <Field
            label="Discount value"
            value={String(editor.discountValue)}
            numeric
            onChange={(raw) =>
              patch({
                discountValue: Math.max(0, Math.round(Number(raw) || 0)),
              })
            }
          />
          <Toggle
            label="Active"
            value={editor.active}
            onChange={(active) => patch({ active })}
          />
          <View className="mt-2 flex-row gap-2">
            <Button
              label="Save promotion"
              busy={busy}
              disabled={!editor.title.trim()}
              onPress={() =>
                void run(() => savePrintPromotion(editor), "Promotion saved.")
              }
            />
            {editor.id && canDelete ? (
              <Button
                label="Delete"
                tone="danger"
                onPress={() => confirmDelete("promotion", editor.id)}
              />
            ) : null}
          </View>
        </Card>
        {data.promotions.map((item) => (
          <Card key={item.id}>
            <View className="flex-row items-center justify-between gap-2">
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-bold text-ink">{item.title}</Text>
                <Text className="text-xs text-muted">
                  {item.discountType === "none"
                    ? "no discount"
                    : `${item.discountValue} ${item.discountType}`}
                  {item.active ? " · active" : " · hidden"}
                </Text>
              </View>
              <Button
                label="Edit"
                tone="ghost"
                onPress={() => setPromotion(item)}
              />
            </View>
          </Card>
        ))}
      </View>
    );
  }

  // ── Services ───────────────────────────────────────────────────────
  if (section === "Services") {
    const editor = service ?? emptyService;
    const patch = (part: Partial<PrintServiceItem>) =>
      setService({ ...editor, ...part });
    return (
      <View>
        {noticeBar}
        <View className="mb-3 flex-row items-center justify-between gap-2">
          <Text className="flex-1 text-xs text-muted">
            The custom-services strip on the website and the app's 3D screen.
          </Text>
          <Button
            label="New"
            tone="ghost"
            onPress={() => setService({ ...emptyService })}
          />
        </View>
        <Card>
          <Text className="mb-2 font-display text-base font-bold text-ink">
            {editor.id ? "Edit service" : "New service"}
          </Text>
          <Field
            label="Title"
            value={editor.title}
            onChange={(title) => patch({ title })}
          />
          <Field
            label="Description"
            value={editor.description}
            onChange={(description) => patch({ description })}
            multiline
          />
          <Field
            label="Price note"
            value={editor.priceNote}
            onChange={(priceNote) => patch({ priceNote })}
          />
          <Field
            label="Sort order"
            value={String(editor.sortOrder)}
            numeric
            onChange={(raw) =>
              patch({ sortOrder: Math.round(Number(raw) || 0) })
            }
          />
          <Toggle
            label="Active"
            value={editor.active}
            onChange={(active) => patch({ active })}
          />
          <View className="mt-2 flex-row gap-2">
            <Button
              label="Save service"
              busy={busy}
              disabled={!editor.title.trim()}
              onPress={() =>
                void run(() => savePrintService(editor), "Service saved.")
              }
            />
            {editor.id && canDelete ? (
              <Button
                label="Delete"
                tone="danger"
                onPress={() => confirmDelete("service", editor.id)}
              />
            ) : null}
          </View>
        </Card>
        {data.services.map((item) => (
          <Card key={item.id}>
            <View className="flex-row items-center justify-between gap-2">
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-bold text-ink">{item.title}</Text>
                <Text className="text-xs text-muted">
                  {item.priceNote || "no price note"}{" "}
                  {item.active ? "" : "· hidden"}
                </Text>
              </View>
              <Button
                label="Edit"
                tone="ghost"
                onPress={() => setService(item)}
              />
            </View>
          </Card>
        ))}
      </View>
    );
  }

  // ── Gallery ────────────────────────────────────────────────────────
  if (section === "Gallery") {
    const editor = galleryItem ?? emptyGallery;
    const patch = (part: Partial<PrintGalleryItem>) =>
      setGalleryItem({ ...editor, ...part });
    return (
      <View>
        {noticeBar}
        <View className="mb-3 flex-row items-center justify-between gap-2">
          <Text className="flex-1 text-xs text-muted">
            {data.gallery.length} item{data.gallery.length === 1 ? "" : "s"} —
            paste an image URL (uploads stay website-only).
          </Text>
          <Button
            label="New"
            tone="ghost"
            onPress={() => setGalleryItem({ ...emptyGallery })}
          />
        </View>
        <Card>
          <Text className="mb-2 font-display text-base font-bold text-ink">
            {editor.id ? "Edit gallery item" : "New gallery item"}
          </Text>
          <Field
            label="Image URL"
            value={editor.imageUrl}
            onChange={(imageUrl) => patch({ imageUrl })}
          />
          <Field
            label="Caption"
            value={editor.caption}
            onChange={(caption) => patch({ caption })}
          />
          <Field
            label="Category"
            value={editor.category}
            onChange={(category) => patch({ category })}
          />
          <Field
            label="Sort order"
            value={String(editor.sortOrder)}
            numeric
            onChange={(raw) =>
              patch({ sortOrder: Math.round(Number(raw) || 0) })
            }
          />
          <Toggle
            label="Featured"
            value={editor.featured}
            onChange={(featured) => patch({ featured })}
          />
          <Toggle
            label="Active"
            value={editor.active}
            onChange={(active) => patch({ active })}
          />
          <View className="mt-2 flex-row gap-2">
            <Button
              label="Save item"
              busy={busy}
              disabled={!editor.imageUrl.trim()}
              onPress={() =>
                void run(
                  () => savePrintGalleryItem(editor),
                  "Gallery item saved.",
                )
              }
            />
            {editor.id && canDelete ? (
              <Button
                label="Delete"
                tone="danger"
                onPress={() => confirmDelete("gallery", editor.id)}
              />
            ) : null}
          </View>
        </Card>
        {data.gallery.map((item) => (
          <Card key={item.id}>
            <View className="flex-row items-center justify-between gap-2">
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-bold text-ink">
                  {item.caption || item.imageUrl}
                </Text>
                <Text className="text-xs text-muted">
                  {item.category || "uncategorised"}{" "}
                  {item.active ? "" : "· hidden"}
                </Text>
              </View>
              <Button
                label="Edit"
                tone="ghost"
                onPress={() => setGalleryItem(item)}
              />
            </View>
          </Card>
        ))}
      </View>
    );
  }

  // ── Requests ───────────────────────────────────────────────────────
  if (section === "Requests") {
    const editor = quote;
    return (
      <View>
        {noticeBar}
        <Text className="mb-3 text-xs text-muted">
          {data.quotes.length} request{data.quotes.length === 1 ? "" : "s"} —
          quote them, then move the status along.
        </Text>
        {editor ? (
          <Card>
            <Text className="font-display text-base font-bold text-ink">
              {editor.name}
            </Text>
            <Text className="mb-2 text-xs text-muted">
              {editor.email}
              {editor.phone ? ` · ${editor.phone}` : ""} · qty {editor.quantity}
            </Text>
            <Text className="mb-2 text-xs leading-5 text-ink">
              {editor.description}
            </Text>
            <Text className="mb-2 text-xs text-muted">
              {[editor.material, editor.dimensions, editor.timeline]
                .filter(Boolean)
                .join(" · ") || "no material/dimensions/timeline"}
            </Text>
            <Text className="mb-1 text-xs font-bold text-muted">Status</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {PRINT_QUOTE_STATUSES.map((status) => (
                <Pressable
                  key={status}
                  onPress={() => setQuote({ ...editor, status })}
                  className={`rounded-full px-3 py-1.5 ${
                    editor.status === status
                      ? "bg-navy"
                      : "border border-line bg-surface"
                  }`}
                >
                  <Text
                    className={`text-[11px] font-black ${
                      editor.status === status ? "text-white" : "text-ink"
                    }`}
                  >
                    {PRINT_QUOTE_STATUS_LABELS[status]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View className="mt-2 flex-row gap-2">
              <Field
                label="Quoted (NPR)"
                value={String(editor.quotedAmount)}
                numeric
                onChange={(raw) =>
                  setQuote({
                    ...editor,
                    quotedAmount: Math.max(0, Math.round(Number(raw) || 0)),
                  })
                }
              />
              <Field
                label="Grams"
                value={String(editor.estimatedGrams)}
                numeric
                onChange={(raw) =>
                  setQuote({
                    ...editor,
                    estimatedGrams: Math.max(0, Math.round(Number(raw) || 0)),
                  })
                }
              />
            </View>
            <View className="flex-row gap-2">
              <Field
                label="Print hours"
                value={String(editor.printHours)}
                decimal
                onChange={(raw) =>
                  setQuote({
                    ...editor,
                    printHours: Math.max(0, Number(raw) || 0),
                  })
                }
              />
              <Field
                label="Admin notes"
                value={editor.adminNotes}
                onChange={(adminNotes) => setQuote({ ...editor, adminNotes })}
                multiline
              />
            </View>
            <Toggle
              label="Reprint"
              value={editor.reprint}
              onChange={(reprint) => setQuote({ ...editor, reprint })}
            />
            <View className="mt-2 flex-row gap-2">
              <Button
                label="Save request"
                busy={busy}
                onPress={() =>
                  void run(
                    () =>
                      updatePrintQuote(editor.id, {
                        status: editor.status as PrintQuoteStatus,
                        adminNotes: editor.adminNotes,
                        quotedAmount: editor.quotedAmount,
                        estimatedGrams: editor.estimatedGrams,
                        printHours: editor.printHours,
                        reprint: editor.reprint,
                      }),
                    "Request updated.",
                  )
                }
              />
              <Button
                label="Close"
                tone="ghost"
                onPress={() => setQuote(null)}
              />
            </View>
          </Card>
        ) : null}
        {data.quotes.map((item) => (
          <Card key={item.id}>
            <View className="flex-row items-center justify-between gap-2">
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-bold text-ink">{item.name}</Text>
                <Text className="text-xs text-muted">
                  {PRINT_QUOTE_STATUS_LABELS[item.status]} ·{" "}
                  {item.quotedAmount > 0
                    ? `NPR ${item.quotedAmount.toLocaleString("en-IN")}`
                    : "unquoted"}{" "}
                  · {new Date(item.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <Button
                label="Open"
                tone="ghost"
                onPress={() => setQuote(item)}
              />
            </View>
          </Card>
        ))}
        {data.quotes.length === 0 ? (
          <Card>
            <Text className="text-xs text-muted">
              No requests yet. The website quote form and the app's 3D screen
              both land here.
            </Text>
          </Card>
        ) : null}
      </View>
    );
  }

  // ── Reports ────────────────────────────────────────────────────────
  const stats = derivePrintReports(data.quotes, data.costing);
  return (
    <View>
      {noticeBar}
      <Text className="mb-3 text-xs text-muted">
        Derived from quote requests — estimates only, never profit. Add a
        quote's amount and slicer grams to include it.
      </Text>
      {stats.map((stat) => (
        <Card key={stat.label}>
          <Text className="text-[10px] font-black uppercase text-muted">
            {stat.label}
          </Text>
          <Text className="font-display text-xl font-bold text-ink">
            {stat.value}
          </Text>
          <Text className="text-xs text-muted">{stat.note}</Text>
        </Card>
      ))}
    </View>
  );
}
