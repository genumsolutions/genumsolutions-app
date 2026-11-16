// =====================================================================
// PrintAdminPanel — the app mirror of the website's Admin → 3D Products
// studio (components/admin/AdminPrint.tsx).
//
// Sections: Categories · Pricing (materials + calculator + approval) ·
// Costs (internal) · Promotions · Services · Requests · Reports.
// "Catalog" stays with the existing 3D product list in AdminScreen.
// The Gallery section was removed: the 3D Products studio no longer tracks
// per-image uploads, so its list, editor, and uploader were deleted.
//
// Every read/write goes through printAdminService; the print_* tables grant
// staff writes, and approval stays admin-only in the UI (RLS is looser).
// =====================================================================
import React, { useCallback, useEffect, useState } from "react";
import { AdminEditorSheet } from "../components/admin/AdminEditorSheet";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { AdminSubTabs } from "../components/admin/AdminSubTabs";
import {
  PRINT_QUOTE_STATUSES,
  PRINT_QUOTE_STATUS_LABELS,
  defaultPrintSettings,
  deletePrintRecord,
  derivePrintReports,
  loadPrintAdminData,
  savePrintCategory,
  savePrintCosting,
  savePrintMaterial,
  savePrintPromotion,
  savePrintService,
  savePrintSettings,
  setPrintApproval,
  updatePrintQuote,
  type PrintAdminData,
  type PrintCategory,
  type PrintMaterial,
  type PrintPromotion,
  type PrintQuote,
  type PrintQuoteStatus,
  type PrintServiceItem,
  type PrintSettings,
} from "../services/printAdminService";
import { costingStatus, type PrintCosting } from "../lib/print-costing";

export const PRINT_ADMIN_SECTIONS = [
  "Categories",
  "Pricing",
  "Costs",
  "Promotions",
  "Services",
  "Requests",
  "Reports",
] as const;

export type PrintAdminSection = (typeof PRINT_ADMIN_SECTIONS)[number];
const PRINT_ADMIN_TABS = ["Catalog", ...PRINT_ADMIN_SECTIONS] as const;

const inputClass =
  "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink";
const labelClass = "mb-1 text-sm font-bold text-ink";

const emptyCategory: PrintCategory = {
  id: "",
  name: "",
  description: "",
  imageUrl: "",
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
    <View className="mb-3 rounded-xl border border-line bg-card p-4">
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
      <Text className="min-w-0 flex-1 text-sm font-bold text-ink">{label}</Text>
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
      hitSlop={6}
      // 2026-11-14: same button floor as AdminAction — 36px, centred, single
      // line, self-start so a flex row cannot stretch it to its tallest
      // sibling. Before this, "Delete" next to "Save item" grew into a tall
      // lozenge on narrow screens.
      className={`min-h-9 shrink-0 self-start items-center justify-center rounded-full px-4 ${base} ${busy || disabled ? "opacity-60" : ""}`}
    >
      <Text
        numberOfLines={1}
        className={`text-sm font-black ${tone === "primary" ? "text-white" : tone === "danger" ? "text-red-600" : "text-ink"}`}
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
  return (
    <AdminSubTabs
      label="3D Products sections"
      options={PRINT_ADMIN_TABS}
      value={value}
      onChange={onChange}
    />
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
  const [costing, setCosting] = useState({
    filamentCostPerGram: 0,
    wastagePercent: 0,
    electricityRatePerKwh: 0,
    printerWatts: 0,
    machineCost: 0,
    machineLifeHours: 0,
    maintenancePerHour: 0,
    labourPerHour: 0,
    packagingPerJob: 0,
    paymentFeePercent: 0,
    overheadPerMonth: 0,
    monthlyOrderTarget: 0,
    targetMarginPercent: 0,
    notes: "",
  });
  const [category, setCategory] = useState<PrintCategory | null>(null);
  const [promotion, setPromotion] = useState<PrintPromotion | null>(null);
  // Gallery section removed: the 3D studio no longer tracks per-image
  // 2026-11-14 (owner: "add the imported picture preview"): full-size look at an
  // uploaded gallery photo. The editor thumbnail is h-32, the list rows had no
  // thumbnail at all — neither is enough to check the right file went up.
  const [service, setService] = useState<PrintServiceItem | null>(null);
  // Storefront preview for the sections that publish a card on /3d-printing.
  // Rates + calculator stay read-only until Edit is pressed, matching every
  // other editor in the console.
  const [editingPricing, setEditingPricing] = useState(false);
  const [preview, setPreview] = useState<{
    eyebrow: string;
    title: string;
    body: string;
    note?: string;
    imageUrl?: string;
    active: boolean;
  } | null>(null);
  const [quote, setQuote] = useState<PrintQuote | null>(null);

  const reload = useCallback(async () => {
    try {
      const next = await loadPrintAdminData();
      setData(next);
      setSettings(next.settings);
      setMaterials(next.materials);
      setCosting(next.costing);
      setNotice("");
      return true;
    } catch (error) {
      setNotice(String((error as Error)?.message || error));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // reload() raises its own spinner flag before the request; the rows land in
    // promise callbacks.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async load
    void reload();
  }, [reload]);

  async function run(
    action: () => Promise<void>,
    done: string,
    onSuccess?: () => void,
  ) {
    setBusy(true);
    try {
      await action();
      const refreshed = await reload();
      onSuccess?.();
      if (refreshed) setNotice(done);
    } catch (error) {
      setNotice(String((error as Error)?.message || error));
    } finally {
      setBusy(false);
    }
  }

  /** Pick, validate, upload one gallery image to the public bucket. */
  // Gallery section removed: the app's 3D Products studio no longer has a

  function confirmDelete(
    kind:
      "category" | "material" | "promotion" | "gallery" | "service" | "quote",
    id: string,
  ) {
    if (!canDelete || !id.trim()) return;
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
            setService(null);
            setQuote(null);
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
  // Rendered with the notice bar, which every section header already includes,
  // so each list can preview without restructuring its own return tree.
  const previewHost = preview ? (
    <StorefrontPreviewModal
      eyebrow={preview.eyebrow}
      title={preview.title}
      body={preview.body}
      note={preview.note}
      imageUrl={preview.imageUrl}
      active={preview.active}
      onClose={() => setPreview(null)}
    />
  ) : null;

  // ── Categories ─────────────────────────────────────────────────────
  if (section === "Categories") {
    const editor = category ?? emptyCategory;
    const patch = (part: Partial<PrintCategory>) =>
      setCategory({ ...editor, ...part });
    return (
      <View>
        {noticeBar}
        {previewHost}
        {category ? (
          <AdminEditorSheet
            visible
            title={category.id ? "Edit category" : "New category"}
            onClose={() => setCategory(null)}
          >
            <Card>
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
                    void run(
                      () => savePrintCategory(editor),
                      "Category saved.",
                      () => setCategory(null),
                    )
                  }
                />
                {category.id && canDelete ? (
                  <Button
                    label="Delete"
                    tone="danger"
                    onPress={() => confirmDelete("category", editor.id)}
                  />
                ) : null}
              </View>
            </Card>
          </AdminEditorSheet>
        ) : (
          <>
            <View className="mb-3 flex-row items-center justify-between gap-2">
              <Text className="min-w-0 flex-1 text-sm text-muted">
                The buckets shown on /3d-printing and the app's 3D screen.
              </Text>
              <Button
                label="New"
                onPress={() => setCategory({ ...emptyCategory })}
                tone="ghost"
              />
            </View>
            {data.categories.length === 0 ? (
              <Card>
                <Text className="text-sm text-muted">
                  No categories yet. Select New to add the first one.
                </Text>
              </Card>
            ) : (
              data.categories.map((item) => (
                <Card key={item.id}>
                  <View className="flex-row items-center justify-between gap-2">
                    <View className="min-w-0 flex-1">
                      <Text className="font-display text-base font-bold text-ink">
                        {item.name}
                      </Text>
                      <Text className="text-xs text-muted">
                        {item.id} · sort {item.sortOrder}{" "}
                        {item.active ? "" : "· hidden"}
                      </Text>
                    </View>
                    <View className="shrink-0 flex-row gap-1">
                      <Button
                        label="Preview"
                        tone="ghost"
                        onPress={() =>
                          setPreview({
                            eyebrow: "3D printing category",
                            title: item.name,
                            body: item.description,
                            note: `Sort ${item.sortOrder}`,
                            imageUrl: item.imageUrl,
                            active: item.active,
                          })
                        }
                      />
                      <Button
                        label="Edit"
                        tone="ghost"
                        onPress={() => setCategory(item)}
                      />
                      {canDelete ? (
                        <Button
                          label="Delete"
                          tone="danger"
                          onPress={() => confirmDelete("category", item.id)}
                        />
                      ) : null}
                    </View>
                  </View>
                </Card>
              ))
            )}
          </>
        )}
      </View>
    );
  }

  // ── Pricing: approval, selling rates, calculator rules ────────────
  if (section === "Pricing") {
    const approved = settings.pricingStatus === "approved";
    const patchSettings = (part: Partial<PrintSettings>) =>
      setSettings({ ...settings, ...part });
    if (!editingPricing) {
      const summary: [string, string][] = [
        ["Calculator", settings.calculatorEnabled ? "Enabled" : "Hidden"],
        ["Minimum order", `${settings.minimumOrder} NPR`],
        ["Design base charge", `${settings.designBaseCharge} NPR`],
        [
          "Bulk tiers",
          settings.bulkTiers.length
            ? settings.bulkTiers
                .map((tier) => `${tier.minQty}+ ${tier.discountPercent}%`)
                .join(" · ")
            : "None",
        ],
        [
          "Finishing charges",
          settings.finishingCharges.length
            ? settings.finishingCharges
                .map((charge) => `${charge.name} ${charge.amount} NPR`)
                .join(" · ")
            : "None",
        ],
        ["Materials intro", settings.materialsIntro],
        ["Disclaimer", settings.disclaimer],
      ];
      return (
        <View>
          {noticeBar}
          {previewHost}
          <Card>
            <View className="flex-row items-center justify-between gap-2">
              <Text className="min-w-0 flex-1 font-display text-base font-bold text-ink">
                Material rates
              </Text>
              <Button
                label="Edit"
                tone="ghost"
                onPress={() => setEditingPricing(true)}
              />
            </View>
            <Text className="mt-0.5 text-xs leading-5 text-muted">
              NPR per gram · zero shows as "rate on request".
            </Text>
            <View className="mt-2">
              {materials.length === 0 ? (
                <Text className="text-xs text-muted">No materials yet.</Text>
              ) : (
                materials.map((material, index) => (
                  <View
                    key={material.id || index}
                    className="border-b border-line py-2"
                  >
                    <View className="flex-row items-center justify-between gap-2">
                      <Text
                        numberOfLines={1}
                        className="min-w-0 flex-1 text-sm font-bold text-ink"
                      >
                        {material.name || "Material"}
                      </Text>
                      <Text className="text-xs text-muted">
                        {material.ratePerGram > 0
                          ? `${material.ratePerGram} NPR/g`
                          : "rate on request"}
                      </Text>
                    </View>
                    <Text numberOfLines={1} className="text-xs text-muted">
                      {material.active
                        ? material.note || "Active"
                        : `Hidden${material.note ? ` · ${material.note}` : ""}`}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </Card>
          <Card>
            <View className="flex-row items-center justify-between gap-2">
              <Text className="min-w-0 flex-1 font-display text-base font-bold text-ink">
                Calculator
              </Text>
              <Button
                label="Edit"
                tone="ghost"
                onPress={() => setEditingPricing(true)}
              />
            </View>
            <View className="mt-2">
              {summary.map(([label, value]) => (
                <View key={label} className="border-b border-line py-2">
                  <Text className="text-[10px] font-black uppercase tracking-widest text-muted">
                    {label}
                  </Text>
                  <Text className="mt-0.5 text-sm leading-5 text-ink">
                    {value || "—"}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        </View>
      );
    }
    return (
      <AdminEditorSheet
        full
        visible
        title="Rates and calculator"
        onClose={() => setEditingPricing(false)}
      >
        <View>
          {noticeBar}
          {previewHost}
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
                  label={
                    approved ? "Withdraw rates" : "Approve & publish rates"
                  }
                  busy={busy}
                  onPress={() =>
                    void run(
                      () => setPrintApproval(!approved, approverEmail),
                      approved ? "Rates withdrawn." : "Rates published.",
                    )
                  }
                />
              ) : (
                <Text className="text-[10px] font-black uppercase tracking-widest text-muted">
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
              NPR per gram. Zero stays hidden from customers as "rate on
              request".
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
                {canDelete ? (
                  <Button
                    label="Delete material"
                    tone="danger"
                    onPress={() => confirmDelete("material", material.id)}
                  />
                ) : null}
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
                      bulkTiers: settings.bulkTiers.filter(
                        (_, i) => i !== index,
                      ),
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
              <Button
                label="Done"
                tone="ghost"
                onPress={() => setEditingPricing(false)}
              />
            </View>
          </Card>
        </View>
      </AdminEditorSheet>
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
        {previewHost}
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
        {previewHost}
        {promotion ? (
          <AdminEditorSheet
            visible
            title={promotion.id ? "Edit promotion" : "New promotion"}
            onClose={() => setPromotion(null)}
          >
            <Card>
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
                    void run(
                      () => savePrintPromotion(editor),
                      "Promotion saved.",
                      () => setPromotion(null),
                    )
                  }
                />
                {promotion.id && canDelete ? (
                  <Button
                    label="Delete"
                    tone="danger"
                    onPress={() => confirmDelete("promotion", editor.id)}
                  />
                ) : null}
              </View>
            </Card>
          </AdminEditorSheet>
        ) : (
          <>
            <View className="mb-3 flex-row items-center justify-between gap-2">
              <Text className="min-w-0 flex-1 text-sm text-muted">
                Only one active, in-date promotion is shown to customers.
              </Text>
              <Button
                label="New"
                tone="ghost"
                onPress={() => setPromotion({ ...emptyPromotion })}
              />
            </View>
            {data.promotions.length === 0 ? (
              <Card>
                <Text className="text-sm text-muted">
                  No promotions yet. Select New to create one.
                </Text>
              </Card>
            ) : (
              data.promotions.map((item) => (
                <Card key={item.id}>
                  <View className="flex-row items-center justify-between gap-2">
                    <View className="min-w-0 flex-1">
                      <Text className="font-display text-base font-bold text-ink">
                        {item.title}
                      </Text>
                      <Text className="text-xs text-muted">
                        {item.discountType === "none"
                          ? "no discount"
                          : `${item.discountValue} ${item.discountType}`}
                        {item.active ? " · active" : " · hidden"}
                      </Text>
                    </View>
                    <View className="shrink-0 flex-row gap-1">
                      <Button
                        label="Preview"
                        tone="ghost"
                        onPress={() =>
                          setPreview({
                            eyebrow: "Promotion",
                            title: item.title,
                            body: item.body,
                            note:
                              item.discountType === "none"
                                ? "No discount"
                                : `${item.discountValue} ${item.discountType}`,
                            imageUrl: item.imageUrl,
                            active: item.active,
                          })
                        }
                      />
                      <Button
                        label="Edit"
                        tone="ghost"
                        onPress={() => setPromotion(item)}
                      />
                      {canDelete ? (
                        <Button
                          label="Delete"
                          tone="danger"
                          onPress={() => confirmDelete("promotion", item.id)}
                        />
                      ) : null}
                    </View>
                  </View>
                </Card>
              ))
            )}
          </>
        )}
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
        {previewHost}
        {service ? (
          <AdminEditorSheet
            visible
            title={service.id ? "Edit service" : "New service"}
            onClose={() => setService(null)}
          >
            <Card>
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
                    void run(
                      () => savePrintService(editor),
                      "Service saved.",
                      () => setService(null),
                    )
                  }
                />
                {service.id && canDelete ? (
                  <Button
                    label="Delete"
                    tone="danger"
                    onPress={() => confirmDelete("service", editor.id)}
                  />
                ) : null}
              </View>
            </Card>
          </AdminEditorSheet>
        ) : (
          <>
            <View className="mb-3 flex-row items-center justify-between gap-2">
              <Text className="min-w-0 flex-1 text-sm text-muted">
                The custom-services strip on the website and the app's 3D
                screen.
              </Text>
              <Button
                label="New"
                tone="ghost"
                onPress={() => setService({ ...emptyService })}
              />
            </View>
            {data.services.length === 0 ? (
              <Card>
                <Text className="text-sm text-muted">
                  No services yet. Select New to add one.
                </Text>
              </Card>
            ) : (
              data.services.map((item) => (
                <Card key={item.id}>
                  <View className="flex-row items-center justify-between gap-2">
                    <View className="min-w-0 flex-1">
                      <Text className="font-display text-base font-bold text-ink">
                        {item.title}
                      </Text>
                      <Text className="text-xs text-muted">
                        {item.priceNote || "no price note"}{" "}
                        {item.active ? "" : "· hidden"}
                      </Text>
                    </View>
                    <View className="shrink-0 flex-row gap-1">
                      <Button
                        label="Preview"
                        tone="ghost"
                        onPress={() =>
                          setPreview({
                            eyebrow: "Print service",
                            title: item.title,
                            body: item.description,
                            note: item.priceNote,
                            active: item.active,
                          })
                        }
                      />
                      <Button
                        label="Edit"
                        tone="ghost"
                        onPress={() => setService(item)}
                      />
                      {canDelete ? (
                        <Button
                          label="Delete"
                          tone="danger"
                          onPress={() => confirmDelete("service", item.id)}
                        />
                      ) : null}
                    </View>
                  </View>
                </Card>
              ))
            )}
          </>
        )}
      </View>
    );
  }

  // ── Requests ───────────────────────────────────────────────────────
  if (section === "Requests") {
    return (
      <View>
        {noticeBar}
        {previewHost}
        <Text className="mb-3 text-xs text-muted">
          {data.quotes.length} request{data.quotes.length === 1 ? "" : "s"} —
          quote them, then move the status along.
        </Text>
        {quote ? (
          <AdminEditorSheet
            visible
            title="Request details"
            onClose={() => setQuote(null)}
          >
            <Card>
              <Text className="font-display text-base font-bold text-ink">
                {quote.name}
              </Text>
              <Text className="mb-2 text-xs text-muted">
                {quote.email}
                {quote.phone ? ` · ${quote.phone}` : ""} · qty {quote.quantity}
              </Text>
              <Text className="mb-2 text-sm leading-5 text-ink">
                {quote.description}
              </Text>
              <Text className="mb-2 text-xs text-muted">
                {[quote.material, quote.dimensions, quote.timeline]
                  .filter(Boolean)
                  .join(" · ") || "no material/dimensions/timeline"}
              </Text>
              <Text className="mb-1 text-sm font-bold text-ink">Status</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {PRINT_QUOTE_STATUSES.map((status) => (
                  <Pressable
                    key={status}
                    onPress={() => setQuote({ ...quote, status })}
                    className={`rounded-full px-3 py-1.5 ${
                      quote.status === status
                        ? "bg-navy"
                        : "border border-line bg-surface"
                    }`}
                  >
                    <Text
                      className={`text-[11px] font-black ${
                        quote.status === status ? "text-white" : "text-ink"
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
                  value={String(quote.quotedAmount)}
                  numeric
                  onChange={(raw) =>
                    setQuote({
                      ...quote,
                      quotedAmount: Math.max(0, Math.round(Number(raw) || 0)),
                    })
                  }
                />
                <Field
                  label="Grams"
                  value={String(quote.estimatedGrams)}
                  numeric
                  onChange={(raw) =>
                    setQuote({
                      ...quote,
                      estimatedGrams: Math.max(0, Math.round(Number(raw) || 0)),
                    })
                  }
                />
              </View>
              <View className="flex-row gap-2">
                <Field
                  label="Print hours"
                  value={String(quote.printHours)}
                  decimal
                  onChange={(raw) =>
                    setQuote({
                      ...quote,
                      printHours: Math.max(0, Number(raw) || 0),
                    })
                  }
                />
                <Field
                  label="Admin notes"
                  value={quote.adminNotes}
                  onChange={(adminNotes) => setQuote({ ...quote, adminNotes })}
                  multiline
                />
              </View>
              <Toggle
                label="Reprint"
                value={quote.reprint}
                onChange={(reprint) => setQuote({ ...quote, reprint })}
              />
              <View className="mt-2">
                <Button
                  label="Save request"
                  busy={busy}
                  onPress={() =>
                    void run(
                      () =>
                        updatePrintQuote(quote.id, {
                          status: quote.status as PrintQuoteStatus,
                          adminNotes: quote.adminNotes,
                          quotedAmount: quote.quotedAmount,
                          estimatedGrams: quote.estimatedGrams,
                          printHours: quote.printHours,
                          reprint: quote.reprint,
                        }),
                      "Request updated.",
                      () => setQuote(null),
                    )
                  }
                />
              </View>
            </Card>
          </AdminEditorSheet>
        ) : (
          data.quotes.map((item) => (
            <Card key={item.id}>
              <View className="flex-row items-center justify-between gap-2">
                <View className="min-w-0 flex-1">
                  <Text className="font-display text-base font-bold text-ink">
                    {item.name}
                  </Text>
                  <Text className="text-xs text-muted">
                    {PRINT_QUOTE_STATUS_LABELS[item.status]} ·{" "}
                    {item.quotedAmount > 0
                      ? `NPR ${item.quotedAmount.toLocaleString("en-IN")}`
                      : "unquoted"}{" "}
                    · {new Date(item.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <View className="shrink-0 flex-row gap-1">
                  <Button
                    label="Open"
                    tone="ghost"
                    onPress={() => setQuote(item)}
                  />
                  {canDelete ? (
                    <Button
                      label="Delete"
                      tone="danger"
                      onPress={() => confirmDelete("quote", item.id)}
                    />
                  ) : null}
                </View>
              </View>
            </Card>
          ))
        )}
        {!quote && data.quotes.length === 0 ? (
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
      {/* Two KPI tiles per row. These used to be one full-width card each,
          which stacked six tall cards and wasted half of every row; the
          tiles now share the row like the dashboard stat cards do. */}
      <View className="flex-row flex-wrap gap-2">
        {stats.map((stat) => (
          <View
            key={stat.label}
            className="min-w-[45%] flex-1 rounded-xl border border-line bg-card p-4"
          >
            <Text className="text-[10px] font-black uppercase tracking-widest text-muted">
              {stat.label}
            </Text>
            <Text className="mt-1 font-display text-xl font-bold text-ink">
              {stat.value}
            </Text>
            <Text className="mt-0.5 text-xs text-muted">{stat.note}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Storefront preview: the card an admin-managed print record publishes on the
 * 3D printing page and the app's 3D screen. Deliberately plain (image, eyebrow,
 * title, body, note) so it reads like the customer surface rather than the
 * console; a hidden record is called out instead of pretending to be live.
 */
function StorefrontPreviewModal({
  eyebrow,
  title,
  body,
  note,
  imageUrl,
  active,
  onClose,
}: {
  eyebrow: string;
  title: string;
  body: string;
  note?: string;
  imageUrl?: string;
  active: boolean;
  onClose: () => void;
}) {
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(15, 23, 42, 0.72)",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close preview"
      >
        <Pressable onPress={() => {}} className="w-full max-w-sm">
          <View className="overflow-hidden rounded-2xl border border-line bg-card">
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                className="h-40 w-full bg-mist"
                resizeMode="cover"
                accessibilityLabel={`${title} preview image`}
              />
            ) : null}
            <View className="p-4">
              <View className="flex-row items-center justify-between gap-2">
                <Text className="min-w-0 flex-1 text-[10px] font-black uppercase tracking-widest text-navy">
                  {eyebrow}
                </Text>
                {!active ? (
                  <Text className="shrink-0 rounded bg-mist px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-red-600">
                    Hidden
                  </Text>
                ) : null}
              </View>
              <Text className="mt-1 font-display text-base font-bold leading-snug text-ink">
                {title || "(untitled)"}
              </Text>
              {body ? (
                <Text className="mt-1 break-words text-sm leading-5 text-muted">
                  {body}
                </Text>
              ) : null}
              {note ? (
                <Text className="mt-2 text-xs font-bold text-navy">{note}</Text>
              ) : null}
            </View>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close preview"
            className="mt-3 min-h-11 items-center justify-center rounded-full bg-card px-6"
          >
            <Text className="text-xs font-black text-ink">Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
