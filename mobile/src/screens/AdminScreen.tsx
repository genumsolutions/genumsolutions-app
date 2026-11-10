// =====================================================================
// AdminScreen - native admin dashboard mirroring the website AdminPanel.
// Tabs (9): Dashboard · Orders · Electronic Products · 3D Products · Projects
// · Content · Users · Logs · Settings.
// U-R3: "System Logs" added (fleet crash reports + app logs).
// U-R4: "User Logs" + "Profile Entries" added (per-user audit log and
// per-user car/project profiles from the shared Supabase tables).
// U-R5: those two and "System Logs" merged into one "Logs" tab.
// U-UI1 (2026-11-09): chrome rebuilt to match the website — role/email console
// bar with the tab's refresh control, one-row uppercase tab strip, and the
// shared per-tab description (ADMIN_TAB_HINTS).
// This line used to say "Catalog" and "6 tabs" — Catalog was split into three.
// =====================================================================
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { ADMIN_TAB_HINTS } from "../config/adminTabs";
import { PlatformPager } from "../components/PlatformPager";
import type {
  PagerViewOnPageSelectedEvent,
  PlatformPagerRef,
} from "../components/PlatformPager";
import { useApp } from "../context/AppContext";
import { CategoryDropdown } from "../components/CategoryDropdown";
import { PagePager } from "../components/PagePager";
import { isProjectPackage } from "../services/projectService";
import { applyComponentsScope } from "../services/productService";
import { galleryImages } from "../types";
import { logger } from "../services/logger";
import { IMAGE_BUDGET_HINT } from "../lib/imageLimits";
import {
  loadBiometricsPref,
  authenticate as biometricAuthenticate,
  biometricsSupport,
  setBiometricsEnabled,
} from "../services/biometricsService";
import { fetchSiteContent, upsertSiteContent } from "../services/orderService";
import {
  listAdminOrders,
  updateOrderStatus,
  listAdminProducts,
  upsertAdminProduct,
  deleteAdminProduct,
  previewLinkImport,
  createLinkImport,
  listAdminServices,
  upsertAdminService,
  deleteAdminService,
  listAdminUsers,
  toggleAdminRole,
  setUserTier,
  deleteAdminUser,
  type AdminRobotSetting,
  listUserRobotSettings,
  upsertUserRobotSettings,
  deleteUserRobotSetting,
  type AdminCarProfile,
  listUserCarProfiles,
  upsertAdminCarProfile,
  deleteAdminCarProfile,
  listAdminMessages,
  markMessageReplied,
  fetchDashboardStats,
  fetchAdminAnalytics,
  listAdminActivity,
  listDeviceCrashReports,
  listAppLogs,
  deleteDeviceCrashReport,
  deleteAppLog,
  listUserActivityLogs,
  deleteUserActivityLog,
  listUserProfileEntries,
  listProfileEntryTypes,
  deleteUserProfileEntry,
  listAdminJournalPosts,
  upsertAdminJournalPost,
  deleteAdminJournalPost,
  getCompanyInfo,
  saveCompanyInfo,
  listAdminTrainingPrograms,
  upsertAdminTrainingProgram,
  deleteAdminTrainingProgram,
  listAdminPilotCostLines,
  upsertAdminPilotCostLine,
  deleteAdminPilotCostLine,
  listAdminCurriculumHighlights,
  upsertAdminCurriculumHighlight,
  deleteAdminCurriculumHighlight,
  type AdminOrder,
  type AdminProduct,
  type AdminService,
  type AdminUser,
  type AdminMessage,
  type AdminJournalPost,
  type AdminCompanyInfo,
  type AdminTrainingProgram,
  type AdminPilotCostLine,
  type AdminCurriculumHighlight,
  type DashboardStats,
  type AdminAnalytics,
  type ActivityEntry,
  type AdminCrashReport,
  type AdminAppLog,
  type AdminUserLog,
  type AdminProfileEntry,
  type AdminProfileEntryType,
  type ProjectComponentLink,
  listProjectComponents,
  saveProjectComponents,
} from "../services/adminService";
import {
  dedupeSuggestions,
  isComponentsCatalogRow,
  suggestComponents,
  type CatalogCandidate,
  type ProjectComponentSuggestion,
} from "../lib/project-components";

type BackHandlerRemove = () => void;
type Tab =
  | "Dashboard"
  | "Orders"
  | "Electronic Products"
  | "3D Products"
  | "Projects"
  | "Content"
  | "Users"
  | "Settings";

// U-44 (2026-09-26, owner): the Catalog tab becomes THREE tabs mirroring the
// customer storefront — Electronic Products (/products), 3D Products
// (/3d-printing), Projects (/projects, + Pre-packaged Kits). Each tab carries
// its OWN import section preset to its catalog. Must match the website's
// tests/admin-parity.test.ts ADMIN_TABS exactly.
const TABS: Tab[] = [
  "Dashboard",
  "Orders",
  "Electronic Products",
  "3D Products",
  "Projects",
  "Content",
  "Users",
  "Settings",
];

// U-UI1 (2026-11-09): measured widths, not an assumed 96 px per tab. The old
// scroll math multiplied a fixed width while the labels themselves differ in
// length (Electronic Products vs Logs), so the active tab drifted off-centre.
const TAB_MIN_WIDTH = 96;

export function AdminScreen() {
  const { isAdmin, isOwner, signOut, user: currentUser } = useApp();
  // Staff can operate every admin panel except deletions; isAdmin means
  // admin+owner (deletion rights). Only the sole owner may delete users
  // (see the Users tab).
  const canDelete = isAdmin;
  const [tab, setTab] = useState<Tab>("Dashboard");
  const pagerRef = useRef<PlatformPagerRef>(null);
  const tabScrollRef = useRef<ScrollView>(null);
  const currentPageRef = useRef<number>(0);
  const [visited, setVisited] = useState<Record<string, boolean>>({
    Dashboard: true,
  });
  const [loading, setLoading] = useState(false);
  // U-UI1: stamped after each successful tab load, shown in the console bar.
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const tabOffsets = useRef<number[]>([]);
  const [backHandlerRef, setBackHandlerRef] =
    useState<BackHandlerRemove | null>(null);

  // ── C7: biometric admin lock (local opt-in from Menu → Security) ──
  // When the user enabled the lock on this device, the console stays
  // blurred + inert until the Face ID / fingerprint prompt passes. The
  // gate re-arms whenever the app returns to the foreground, so a phone
  // parked mid-session is protected too. This is a convenience lock:
  // every admin action is still authorized server-side.
  const [bioLocked, setBioLocked] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      const enabled = await loadBiometricsPref();
      if (active && enabled) setBioLocked(true);
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!bioLocked) return;
    let cancelled = false;
    void (async () => {
      // U-47v3 fix (owner: lock "doesn't turn off" + flicker on resume):
      // when biometrics became UNAVAILABLE after the pref was enabled (OTA on
      // an older APK, sensor removal), the prompt can never succeed and the
      // screen would stay blurred forever. In that case auto-unlock AND
      // clear the stale pref so the lock stops re-arming.
      const support = await biometricsSupport();
      if (!support.supported || !support.available) {
        if (!cancelled) {
          setBioLocked(false);
          await setBiometricsEnabled(false).catch(() => undefined);
        }
        return;
      }
      const ok = await biometricAuthenticate("Unlock the admin console");
      if (!cancelled && ok) setBioLocked(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [bioLocked]);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        // U-47v3 fix: only re-arm when the pref is on AND the device can
        // actually prompt (previously an unavailable module still locked,
        // and the re-arm fired the blur/prompt on EVERY foreground — the
        // owner's millisecond card-deflect when returning to the app).
        void (async () => {
          const [support, enabled] = await Promise.all([
            biometricsSupport(),
            loadBiometricsPref(),
          ]);
          if (support.supported && support.available && enabled)
            setBioLocked(true);
        })();
      }
    });
    return () => sub.remove();
  }, []);

  // Keep the horizontal tab strip scrolled so the active tab stays visible.
  // Use useLayoutEffect so the scroll happens before the screen paints the
  // re-render — this keeps the tab strip highlight and scroll position in sync
  // with the pager's selected page, whether the change came from a swipe or a
  // tab tap. Offsets come from each tab's measured layout (U-UI1), so a long
  // label no longer throws the centring off.
  useLayoutEffect(() => {
    const index = TABS.indexOf(tab);
    if (index < 0) return;
    const offset = tabOffsets.current[index] ?? index * TAB_MIN_WIDTH;
    tabScrollRef.current?.scrollTo({
      x: Math.max(0, offset - 40),
      y: 0,
      animated: false,
    });
  }, [tab]);

  // (BackHandler for admin editors is registered after the editing state
  // declarations below, so it can reference editingProduct / editingService /
  // journalOpen without TypeScript complaining about ordering.)

  // Orders
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersTotalPages, setOrdersTotalPages] = useState(1);
  const [orderQuery, setOrderQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Products
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [productQuery, setProductQuery] = useState("");

  // Services
  const [services, setServices] = useState<AdminService[]>([]);

  // Journal posts
  const [journals, setJournals] = useState<AdminJournalPost[]>([]);
  const [journalOpen, setJournalOpen] = useState(false);
  const [journalEditId, setJournalEditId] = useState("");
  const [journalTag, setJournalTag] = useState("");
  const [journalTitle, setJournalTitle] = useState("");
  const [journalText, setJournalText] = useState("");
  const [journalSort, setJournalSort] = useState("0");
  const [journalActive, setJournalActive] = useState(true);

  // Users
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [userQuery, setUserQuery] = useState("");

  // Messages
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [messagesPage, setMessagesPage] = useState(1);
  const [messagesTotalPages, setMessagesTotalPages] = useState(1);
  const [messagesTotal, setMessagesTotal] = useState(0);
  const [messageStatus, setMessageStatus] = useState("");

  // Site content
  const [siteContent, setSiteContent] = useState<{
    id: number;
    home_title: string;
    home_body: string;
  } | null>(null);
  const [contentTitle, setContentTitle] = useState("");
  const [contentBody, setContentBody] = useState("");
  const [contentSaved, setContentSaved] = useState(false);

  // Dashboard
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);

  // Activity
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [activityPage, setActivityPage] = useState(1);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityTotalPages, setActivityTotalPages] = useState(1);

  // System Logs (U-R3): fleet crash reports + app log lines
  const [crashReports, setCrashReports] = useState<AdminCrashReport[]>([]);
  const [crashReportPage, setCrashReportPage] = useState(1);
  const [crashReportTotal, setCrashReportTotal] = useState(0);
  const [crashReportTotalPages, setCrashReportTotalPages] = useState(1);
  const [appLogs, setAppLogs] = useState<AdminAppLog[]>([]);
  const [appLogPage, setAppLogPage] = useState(1);
  const [appLogTotal, setAppLogTotal] = useState(0);
  const [appLogTotalPages, setAppLogTotalPages] = useState(1);

  // User Logs + Profile Entries (U-R4): per-user audit log and per-user
  // car/project profiles from the shared tables.
  const [userLogs, setUserLogs] = useState<AdminUserLog[]>([]);
  const [userLogPage, setUserLogPage] = useState(1);
  const [userLogTotal, setUserLogTotal] = useState(0);
  const [userLogTotalPages, setUserLogTotalPages] = useState(1);
  const [profileEntries, setProfileEntries] = useState<AdminProfileEntry[]>([]);
  const [profileEntryTypes, setProfileEntryTypes] = useState<
    AdminProfileEntryType[]
  >([]);
  const [profileEntryPage, setProfileEntryPage] = useState(1);
  const [profileEntryTotal, setProfileEntryTotal] = useState(0);
  const [profileEntryTotalPages, setProfileEntryTotalPages] = useState(1);

  // Settings (company + programs)
  const [companyInfo, setCompanyInfo] = useState<AdminCompanyInfo | null>(null);
  const [trainingPrograms, setTrainingPrograms] = useState<
    AdminTrainingProgram[]
  >([]);
  const [pilotCostLines, setPilotCostLines] = useState<AdminPilotCostLine[]>(
    [],
  );
  const [curriculumHighlights, setCurriculumHighlights] = useState<
    AdminCurriculumHighlight[]
  >([]);

  // Editing
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(
    null,
  );
  const [editingService, setEditingService] = useState<AdminService | null>(
    null,
  );
  const [editingProject, setEditingProject] = useState<AdminProduct | null>(
    null,
  );
  // Set while the Most Recent "Import by link" product is being previewed; a
  // product seeded from a link is saved through the shared link-import flow
  // (uploads the extracted image into product-images + records documentationUrl).
  const [pendingImportUrl, setPendingImportUrl] = useState<string | null>(null);
  // U-44: which catalog the import dialog will seed (set by the tab that
  // opened it). "projects" imports from the Projects tab keep their
  // project type; product tabs force Retail kit + their default category.
  const [importDest, setImportDest] = useState<
    "electronic" | "models" | "projects"
  >("electronic");
  const [importBusy, setImportBusy] = useState(false);
  // U-48: set while ANY editor save (product / import / service / journal /
  // project) is in flight — the editor's Save button disables + shows
  // "Saving…" so a slow write can never be double-submitted.
  const [saveSaving, setSaveSaving] = useState(false);
  // U-24 (2026-09-24): import-by-link used Alert.prompt, which is iOS-only —
  // on Android the promise NEVER resolves, so the flow silently died after
  // Cancel and "import is not working anywhere". This owned modal gives both
  // platforms a real paste-and-look-up dialog.
  const [importLinkOpen, setImportLinkOpen] = useState(false);
  const [importLinkDraft, setImportLinkDraft] = useState("");
  // Settings editors (company inputs, training programs, pilot costs,
  // curriculum highlights) report their editing state through this flag —
  // it is owned here so the admin pager can disable swiping while ANY
  // Settings item is being edited.
  const [settingsEditing, setSettingsEditing] = useState(false);
  // U-48: Content tab hero save is async — guard + disable its Save button.
  const [contentSaving, setContentSaving] = useState(false);

  // Admin editor BackHandler: when an inline editor is open (product/service/
  // journal) on the CURRENT tab, Android Back should close the editor instead
  // of letting the MainTabPager's BackHandler jump to Home. Only active when
  // the editor's tab is the one currently visible — if the user swiped away,
  // Back goes to Home via MainTabPager's handler (the editor state persists
  // across swipes but the user is no longer looking at it).
  //
  // editorOnCurrentTab lives at render scope (not only inside the effect) so
  // the pager below can ALSO disable swiping while an editor is open on the
  // current tab — once an editor is up, the user is "deep" in the tab and a
  // swipe must not flip to another tab until the editor is closed.
  const editorOnCurrentTab =
    ((tab === "Electronic Products" || tab === "3D Products") &&
      editingProduct != null) ||
    (tab === "Projects" && editingProject != null) ||
    (tab === "Content" && (editingService != null || journalOpen)) ||
    (tab === "Settings" && settingsEditing);

  useEffect(() => {
    if (!editorOnCurrentTab) {
      if (backHandlerRef) {
        backHandlerRef();
        setBackHandlerRef(null);
      }
      return;
    }
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (
        (tab === "Electronic Products" || tab === "3D Products") &&
        editingProduct != null
      ) {
        setEditingProduct(null);
        return true; // consumed
      }
      if (tab === "Projects" && editingProject != null) {
        setEditingProject(null);
        return true; // consumed
      }
      if (tab === "Content" && (editingService != null || journalOpen)) {
        setEditingService(null);
        setJournalOpen(false);
        return true; // consumed
      }
      if (tab === "Settings" && settingsEditing) {
        // Settings editors hold their own local state; Back just dismisses
        // the keyboard (company fields) so the pager can swipe again.
        Keyboard.dismiss();
        return true; // consumed
      }
      return false;
    });
    setBackHandlerRef(() => sub.remove);
    return () => {
      sub.remove();
      setBackHandlerRef(null);
    };
  }, [
    tab,
    editingProduct != null,
    editingService != null,
    editingProject != null,
    settingsEditing,
    journalOpen,
  ]);

  useEffect(() => {
    void loadTab();
  }, [tab]);

  async function loadTab() {
    setLoading(true);
    try {
      if (tab === "Dashboard") {
        setStats(await fetchDashboardStats());
        // Analytics is best-effort: a page_views query failure (e.g. RLS)
        // shouldn't break the rest of the dashboard.
        try {
          setAnalytics(await fetchAdminAnalytics(30));
        } catch (e) {
          logger.error("admin", "Admin analytics load error:", e);
          setAnalytics(null);
        }
      } else if (tab === "Orders") {
        void loadOrders(1);
        if (!stats) setStats(await fetchDashboardStats());
      } else if (tab === "Electronic Products" || tab === "3D Products") {
        setProducts(await listAdminProducts());
      } else if (tab === "Projects") {
        setProducts(await listAdminProducts());
      } else if (tab === "Content") {
        setServices(await listAdminServices());
        setJournals(await listAdminJournalPosts());
        const result = await fetchSiteContent();
        const content = result?.content;
        if (content) {
          setSiteContent(content);
          setContentTitle(content.home_title || "");
          setContentBody(content.home_body || "");
        }
      } else if (tab === "Users") {
        void loadUsers(1);
        // Merged Users tab: also load activity, profiles and diagnostics.
        void loadCrashReports(1);
        void loadAppLogs(1);
        void loadUserLogs(1);
        void loadProfileEntries(1);
        setProfileEntryTypes(await listProfileEntryTypes());
      } else if (tab === "Settings") {
        setCompanyInfo(await getCompanyInfo());
        setTrainingPrograms(await listAdminTrainingPrograms());
        setPilotCostLines(await listAdminPilotCostLines());
        setCurriculumHighlights(await listAdminCurriculumHighlights());
        void loadMessages(1);
      }
      setRefreshedAt(new Date());
    } catch (e) {
      logger.error("admin", "Admin load error:", e);
    } finally {
      setLoading(false);
      setVisited((v) => ({ ...v, [tab]: true }));
    }
  }

  async function loadOrders(page: number) {
    const result = await listAdminOrders(
      page,
      20,
      statusFilter || undefined,
      orderQuery.trim() || undefined,
    );
    setOrders(result.orders);
    setOrdersTotal(result.total);
    setOrdersPage(result.page);
    setOrdersTotalPages(result.totalPages);
  }

  async function loadMessages(page: number) {
    const result = await listAdminMessages(
      page,
      20,
      messageStatus || undefined,
    );
    setMessages(result.messages);
    setMessagesPage(result.page);
    setMessagesTotal(result.total);
    setMessagesTotalPages(result.totalPages);
  }

  async function loadUsers(page: number) {
    const result = await listAdminUsers(
      page,
      10,
      userQuery.trim() || undefined,
    );
    setUsers(result.users);
    setUsersPage(result.page);
    setUsersTotal(result.total);
    setUsersTotalPages(result.totalPages);
  }

  async function handleUpdateOrderStatus(orderId: string, status: string) {
    await updateOrderStatus(orderId, status);
    void loadOrders(ordersPage);
  }

  /** Validate + persist a product, then refresh the current tab's rows. */
  async function saveProduct(product: AdminProduct): Promise<boolean> {
    const normalized = {
      ...product,
      id: product.id.trim().toLowerCase().replace(/\s+/g, "-"),
    };
    if (!normalized.id || !normalized.name.trim()) {
      Alert.alert(
        "Missing fields",
        "Give the product at least an id and a name.",
      );
      return false;
    }
    await upsertAdminProduct(normalized);
    await loadTab();
    return true;
  }

  async function handleSaveProduct() {
    if (!editingProduct || saveSaving) return;
    setSaveSaving(true);
    try {
      if (pendingImportUrl) {
        if (!editingProduct.name.trim()) {
          Alert.alert(
            "Missing name",
            "Give the imported product a name before saving.",
          );
          return;
        }
        const created = await createLinkImport(
          pendingImportUrl,
          editingProduct,
        );
        setEditingProduct(null);
        setPendingImportUrl(null);
        // U-39b (2026-09-26): the pasted link stuck in the import dialog for
        // the next run — clear the draft so every import starts fresh.
        setImportLinkDraft("");
        void loadTab();
        Alert.alert("Imported", `"${created.name}" was saved.`);
        return;
      }
      if (await saveProduct(editingProduct)) setEditingProduct(null);
    } catch (e) {
      Alert.alert(
        "Save failed",
        e instanceof Error ? e.message : "Could not save the product.",
      );
    } finally {
      setSaveSaving(false);
    }
  }

  function handleDeleteProduct(id: string) {
    Alert.alert(
      "Delete Product",
      `Are you sure you want to delete product ${id.slice(0, 8)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAdminProduct(id);
              void loadTab();
            } catch (e) {
              Alert.alert(
                "Delete failed",
                e instanceof Error
                  ? e.message
                  : "Could not delete the product.",
              );
            }
          },
        },
      ],
    );
  }

  async function handleSaveService() {
    if (!editingService || saveSaving) return;
    setSaveSaving(true);
    const normalized = {
      ...editingService,
      id: editingService.id.trim().toLowerCase().replace(/\s+/g, "-"),
    };
    if (!normalized.id || !normalized.name.trim()) {
      Alert.alert(
        "Missing fields",
        "A service needs at least an id and a name.",
      );
      return;
    }
    try {
      await upsertAdminService(normalized);
      setEditingService(null);
      void loadTab();
    } catch (e) {
      Alert.alert(
        "Save failed",
        e instanceof Error ? e.message : "Could not save the service.",
      );
    } finally {
      setSaveSaving(false);
    }
  }

  function handleDeleteService(id: string) {
    Alert.alert(
      "Delete Service",
      `Are you sure you want to delete this service?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAdminService(id);
              void loadTab();
            } catch (e) {
              Alert.alert(
                "Delete failed",
                e instanceof Error
                  ? e.message
                  : "Could not delete the service.",
              );
            }
          },
        },
      ],
    );
  }

  function blankProduct(
    productType: string,
    category = "Controllers & Boards",
  ): AdminProduct {
    return {
      id: "",
      name: "",
      category,
      projectCategory: null,
      price: 0,
      priceLabel: "Request quote",
      sku: "",
      productType,
      inventoryType: null,
      note: "",
      description: "",
      specs: [],
      stock: 0,
      delivery: "Ships in 1-2 working days",
      image: "",
      gallery: [],
      importMeta: {},
      badge: null,
      active: true,
      sortOrder: 1000,
      projectOverview: "",
      objectives: [],
      materialsRequired: [],
      learningOutcomes: [],
      buildSteps: [],
      controlMethods: [],
      prerequisites: [],
      deliverables: [],
      estimatedDuration: "",
      sourceFolder: "",
      documentationUrl: "",
      videoUrl: "",
      maintenanceNotes: "",
      audience: "",
      difficulty: "Beginner",
      warranty: "",
    };
  }

  function blankService(): AdminService {
    return {
      id: "",
      name: "",
      category: "General",
      priceLabel: "Request quote",
      description: "",
      tag: "",
      sortOrder: 1000,
      active: true,
    };
  }

  async function handleToggleProductActive(product: AdminProduct) {
    await upsertAdminProduct({ ...product, active: !product.active });
    void loadTab();
  }

  async function handleToggleServiceActive(service: AdminService) {
    try {
      await upsertAdminService({ ...service, active: !service.active });
      void loadTab();
    } catch (e) {
      Alert.alert(
        "Update failed",
        e instanceof Error ? e.message : "Could not update the service.",
      );
    }
  }

  function handleNewProduct(kind: "electronic" | "models" = "electronic") {
    // U-39b follow-up (2026-09-26): a leftover pendingImportUrl would turn
    // this plain "new product" save into a silent re-import of the old link.
    setPendingImportUrl(null);
    setEditingProduct(
      blankProduct(
        "Retail kit",
        kind === "models" ? "3D Models" : "Controllers & Boards",
      ),
    );
    setEditingService(null);
  }

  /** Open the "Import product by link" dialog (see importLinkOpen state).
   *  U-44: the destination is preset from the tab that opened the dialog. */
  function handleImportFromLink(kind: "electronic" | "models" = "electronic") {
    setImportDest(kind);
    setImportLinkDraft("");
    setImportLinkOpen(true);
  }

  function dismissImportLink() {
    setImportLinkOpen(false);
  }

  /** Preview a pasted link via the shared edge function and seed the editor
   *  so staff can review/fine-tune before saving. */
  async function confirmImportLink() {
    const link = importLinkDraft.trim();
    if (!link) return;
    setImportLinkOpen(false);
    setImportBusy(true);
    try {
      const preview = await previewLinkImport(link);
      if (!preview?.found && !preview?.title) {
        Alert.alert(
          "No details found",
          "That page blocked the scan. The editor will open empty — fill the name, image, and details manually, then save.",
        );
      }
      // U-44: the destination was chosen by the tab that opened this dialog
      // (importDest). Product tabs force Retail kit + their own category so a
      // project-family hint can never strand a row outside its catalog; the
      // Projects tab keeps the project-package shape.
      const seedingProjects = importDest === "projects";
      const seedCategory = seedingProjects
        ? "Project Packages"
        : importDest === "models"
          ? "3D Models"
          : preview?.categoryHint &&
              !/^(robot cars|pre-packaged kits)$/i.test(preview.categoryHint)
            ? preview.categoryHint
            : "Controllers & Boards";
      const seeded = {
        ...blankProduct(
          seedingProjects ? "Project package" : "Retail kit",
          seedCategory,
        ),
        ...(seedingProjects
          ? { projectCategory: "Robo Car" as string | null }
          : {}),
        name: preview?.title || "",
        description: preview?.description || "",
        specs: preview?.specs ?? [],
        image: preview?.images?.[0] || "",
        // U-23 (2026-09-24): seed the FULL gallery so a saved import persists
        // every extracted photo (not just the cover) — "last link sticks".
        gallery: (preview?.images ?? []).slice(0, 8),
        documentationUrl: link,
        id: preview?.title
          ? String(preview.title)
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "")
              .slice(0, 60)
          : "",
      };
      setEditingProduct(seeded);
      setPendingImportUrl(link);
      goToTab(
        importDest === "projects"
          ? "Projects"
          : importDest === "models"
            ? "3D Products"
            : "Electronic Products",
      );
      if (preview?.found && preview?.title) {
        Alert.alert(
          `Found: ${preview.provider}`,
          `Imported "${preview.title}". Review the fields below, then save.`,
        );
      }
    } catch (e) {
      Alert.alert(
        "Lookup failed",
        e instanceof Error ? e.message : "Could not read that link.",
      );
    } finally {
      setImportBusy(false);
    }
  }

  function handleNewService() {
    setEditingService(blankService());
    setEditingProduct(null);
  }

  // --- Journal post handlers ---

  function startEditJournal(post: AdminJournalPost | null) {
    setJournalOpen(true);
    setJournalEditId(post?.id ?? "");
    setJournalTag(post?.tag ?? "");
    setJournalTitle(post?.title ?? "");
    setJournalText(post?.text ?? "");
    setJournalSort(String(post?.sortOrder ?? 0));
    setJournalActive(post ? post.active : true);
  }

  function slugify(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  async function handleSaveJournal() {
    if (!journalTitle.trim()) {
      Alert.alert("Missing title", "A journal post needs a title.");
      return;
    }
    if (saveSaving) return;
    setSaveSaving(true);
    try {
      await upsertAdminJournalPost({
        id: journalEditId.trim()
          ? slugify(journalEditId)
          : slugify(journalTitle),
        tag: journalTag.trim(),
        title: journalTitle.trim(),
        text: journalText.trim(),
        active: journalActive,
        sortOrder: Math.max(0, Number(journalSort) || 0),
      });
      setJournalOpen(false);
      void loadTab();
    } catch (e) {
      logger.error("admin", "Journal save error:", e);
      Alert.alert(
        "Save failed",
        e instanceof Error ? e.message : "Could not save the journal post.",
      );
    } finally {
      setSaveSaving(false);
    }
  }

  function handleDeleteJournal(id: string) {
    Alert.alert(
      "Delete Journal Post",
      `Delete journal post "${id}"? This also removes it from the website.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteAdminJournalPost(id);
            void loadTab();
          },
        },
      ],
    );
  }

  async function handleToggleJournalPublished(post: AdminJournalPost) {
    try {
      await upsertAdminJournalPost({ ...post, active: !post.active });
      void loadTab();
    } catch (e) {
      logger.error("admin", "Journal publish toggle error:", e);
    }
  }

  function handleToggleUserTier(user: AdminUser) {
    const nextTier = user.tier === "pro" ? "free" : "pro";
    Alert.alert(
      "Change tier",
      nextTier === "pro"
        ? `Upgrade ${user.email} to PRO? (Pro unlocks per-robot preference profiles.)`
        : `Downgrade ${user.email} to FREE? (Robot preference rows are kept but become read-only.)`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: nextTier === "pro" ? "Make Pro" : "Make Free",
          style: nextTier === "pro" ? "default" : "destructive",
          onPress: async () => {
            try {
              await setUserTier(user.id, nextTier);
              void loadUsers(usersPage);
            } catch (e) {
              logger.error("admin", "Tier toggle error:", e);
              Alert.alert(
                "Could not change tier",
                e instanceof Error ? e.message : "Please try again.",
              );
            }
          },
        },
      ],
    );
  }

  function handleToggleUserRole(user: AdminUser) {
    const newRole = user.role === "admin" ? "customer" : "admin";
    if (newRole === "customer" && user.id === currentUser?.id) {
      Alert.alert("Not allowed", "You cannot revoke your own admin role.");
      return;
    }
    Alert.alert(
      "Change role",
      newRole === "admin"
        ? `Grant admin access to ${user.email}?`
        : `Revoke admin access from ${user.email}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: newRole === "admin" ? "Make admin" : "Revoke admin",
          style: newRole === "admin" ? "default" : "destructive",
          onPress: async () => {
            try {
              await toggleAdminRole(user.id, newRole);
              void loadUsers(usersPage);
            } catch (e) {
              logger.error("admin", "Role toggle error:", e);
              // Surface the failure — role changes previously failed silently
              // (the DB trigger rejected the direct anon-key update).
              Alert.alert(
                "Could not change role",
                e instanceof Error ? e.message : "Please try again.",
              );
            }
          },
        },
      ],
    );
  }

  async function loadActivity(page: number) {
    const result = await listAdminActivity(page, 20);
    setActivities(result.entries);
    setActivityPage(result.page);
    setActivityTotal(result.total);
    setActivityTotalPages(result.totalPages);
  }

  // System Logs pagination (U-R3): newest-first crash reports + app log lines.
  async function loadCrashReports(page: number) {
    const result = await listDeviceCrashReports(page, 20);
    setCrashReports(result.entries);
    setCrashReportPage(result.page);
    setCrashReportTotal(result.total);
    setCrashReportTotalPages(result.totalPages);
  }

  async function loadAppLogs(page: number) {
    const result = await listAppLogs(page, 20);
    setAppLogs(result.entries);
    setAppLogPage(result.page);
    setAppLogTotal(result.total);
    setAppLogTotalPages(result.totalPages);
  }

  // User Logs + Profile Entries (U-R4): newest-first, 20 rows per page.
  async function loadUserLogs(page: number) {
    const result = await listUserActivityLogs(page, 20);
    setUserLogs(result.entries);
    setUserLogPage(result.page);
    setUserLogTotal(result.total);
    setUserLogTotalPages(result.totalPages);
  }

  async function loadProfileEntries(page: number) {
    const result = await listUserProfileEntries(page, 20);
    setProfileEntries(result.entries);
    setProfileEntryPage(result.page);
    setProfileEntryTotal(result.total);
    setProfileEntryTotalPages(result.totalPages);
  }

  function handleDeleteCrashReport(row: AdminCrashReport) {
    if (!canDelete) return;
    Alert.alert(
      "Delete crash report",
      `Remove the report for ${row.boardId || "this board"}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDeviceCrashReport(row.id);
              void loadCrashReports(crashReportPage);
            } catch (e) {
              logger.error("admin", "Crash report delete error:", e);
              Alert.alert(
                "Could not delete",
                e instanceof Error ? e.message : "Please try again.",
              );
            }
          },
        },
      ],
    );
  }

  function handleDeleteAppLog(row: AdminAppLog) {
    if (!canDelete) return;
    Alert.alert(
      "Delete log line",
      "Remove this app log entry? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAppLog(row.id);
              void loadAppLogs(appLogPage);
            } catch (e) {
              logger.error("admin", "App log delete error:", e);
              Alert.alert(
                "Could not delete",
                e instanceof Error ? e.message : "Please try again.",
              );
            }
          },
        },
      ],
    );
  }

  function handleDeleteUserLog(row: AdminUserLog) {
    if (!canDelete) return;
    Alert.alert(
      "Delete log entry",
      `Remove this "${row.action || "(no action)"}" entry? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteUserActivityLog(row.id);
              void loadUserLogs(userLogPage);
            } catch (e) {
              logger.error("admin", "User log delete error:", e);
              Alert.alert(
                "Could not delete",
                e instanceof Error ? e.message : "Please try again.",
              );
            }
          },
        },
      ],
    );
  }

  function handleDeleteProfileEntry(row: AdminProfileEntry) {
    if (!canDelete) return;
    Alert.alert(
      "Delete profile entry",
      `Remove "${row.title || row.typeName || "this entry"}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteUserProfileEntry(row.id);
              void loadProfileEntries(profileEntryPage);
            } catch (e) {
              logger.error("admin", "Profile entry delete error:", e);
              Alert.alert(
                "Could not delete",
                e instanceof Error ? e.message : "Please try again.",
              );
            }
          },
        },
      ],
    );
  }

  function handleDeleteUser(user: AdminUser) {
    if (!isOwner) return;
    Alert.alert(
      "Delete user",
      `Permanently delete ${user.email}? This removes their account and all related data. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete user",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAdminUser(user.id);
              void loadUsers(usersPage);
            } catch (e) {
              logger.error("admin", "User delete error:", e);
              Alert.alert(
                "Could not delete user",
                e instanceof Error ? e.message : "Please try again.",
              );
            }
          },
        },
      ],
    );
  }

  async function handleMarkReplied(id: string) {
    await markMessageReplied(id);
    void loadMessages(messagesPage);
  }

  const onPageSelected = useCallback((event: PagerViewOnPageSelectedEvent) => {
    const index = event.nativeEvent.position;
    const key = TABS[index];
    if (!key) return;
    // Capture the page we're leaving so we only clear editors when actually
    // switching tabs (not on a no-op swipe that doesn't change the page).
    const previousKey = TABS[currentPageRef.current];
    currentPageRef.current = index;
    setTab(key);
    if (key !== previousKey) {
      setEditingProduct(null);
      setEditingService(null);
      setJournalOpen(false);
    }
  }, []);

  const goToTab = useCallback((key: Tab) => {
    const index = TABS.indexOf(key);
    if (index < 0 || index === currentPageRef.current) return;
    const previousKey = TABS[currentPageRef.current];
    currentPageRef.current = index;
    setTab(key);
    // Clear editors when switching to a different tab. If we're already on the
    // target tab (index === currentPageRef.current, caught above), the caller
    // (e.g. onEdit) already set the editor state and we must not clear it.
    if (key !== previousKey) {
      setEditingProduct(null);
      setEditingService(null);
      setJournalOpen(false);
    }
    pagerRef.current?.setPage(index);
  }, []);

  function renderTabContent(t: Tab) {
    const Sub = ({ children }: { children: React.ReactNode }) => (
      <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
    );
    switch (t) {
      case "Dashboard":
        return (
          <Sub>
            <DashboardTab stats={stats} analytics={analytics} />
            <ActivityTab
              activities={activities}
              page={activityPage}
              totalPages={activityTotalPages}
              total={activityTotal}
              onLoadMore={(p) => loadActivity(p)}
            />
          </Sub>
        );
      case "Orders":
        return (
          <Sub>
            <OrdersTab
              orders={orders}
              total={ordersTotal}
              page={ordersPage}
              totalPages={ordersTotalPages}
              onPage={(p) => void loadOrders(p)}
              onStatusChange={handleUpdateOrderStatus}
              query={orderQuery}
              onQueryChange={setOrderQuery}
              status={statusFilter}
              onStatusFilter={(s) => {
                setStatusFilter(s);
                void loadOrders(1);
              }}
              onApply={() => void loadOrders(1)}
            />
            <FinanceTab stats={stats} />
          </Sub>
        );
      case "Electronic Products":
      case "3D Products": {
        const kind = tab === "3D Products" ? "models" : "electronic";
        // U-47v2 fix: the old string-split exclusion tokenized "3D Models"
        // into "3d" + "models", so the whole category leaked into the
        // Electronic tab. Use the shared components scope (same contract as
        // the storefront screen + the web applyScope).
        const catalog =
          kind === "models"
            ? products.filter(
                (p) => p.category?.trim().toLowerCase() === "3d models",
              )
            : applyComponentsScope(products);
        return (
          <Sub>
            <ProductsTab
              kind={kind}
              products={catalog}
              query={productQuery}
              onQueryChange={setProductQuery}
              editing={editingProduct}
              onChange={setEditingProduct}
              onEdit={(product) => {
                // U-39b follow-up (2026-09-26): row-edit is a normal edit —
                // drop any stale pending import link so saving can't re-import
                // the old URL into this product.
                setPendingImportUrl(null);
                setEditingProduct(product);
              }}
              onNew={() => handleNewProduct(kind)}
              onImportLink={() => void handleImportFromLink(kind)}
              importBusy={importBusy}
              onSave={handleSaveProduct}
              canDelete={canDelete}
              onDelete={handleDeleteProduct}
              onToggleActive={(p) => void handleToggleProductActive(p)}
              onImportCancel={() => setPendingImportUrl(null)}
              fromLink={pendingImportUrl != null}
              saveSaving={saveSaving}
            />
          </Sub>
        );
      }
      case "Projects":
        return (
          <Sub>
            <ProjectTab
              title="Projects"
              products={products.filter(isProjectPackage)}
              catalogProducts={products}
              editing={editingProject}
              onChange={setEditingProject}
              onEdit={setEditingProject}
              onNew={() => setEditingProject(blankProjectProduct())}
              onSaveProduct={saveProduct}
              saveSaving={saveSaving}
              canDelete={canDelete}
              onDelete={handleDeleteProduct}
              onToggleActive={(p) => void handleToggleProductActive(p)}
            />
          </Sub>
        );
      case "Content":
        return (
          <Sub>
            <ServicesTab
              services={services}
              editing={editingService}
              onChange={setEditingService}
              onEdit={setEditingService}
              onNew={handleNewService}
              onSave={handleSaveService}
              saveSaving={saveSaving}
              canDelete={canDelete}
              onDelete={handleDeleteService}
              onToggleActive={(s) => void handleToggleServiceActive(s)}
            />
            <JournalTab
              journals={journals}
              editorOpen={journalOpen}
              editId={journalEditId}
              tag={journalTag}
              title={journalTitle}
              text={journalText}
              sort={journalSort}
              active={journalActive}
              onNew={() => startEditJournal(null)}
              onEdit={(post) => startEditJournal(post)}
              onTogglePublish={(post) =>
                void handleToggleJournalPublished(post)
              }
              canDelete={canDelete}
              onDelete={handleDeleteJournal}
              onEditIdChange={setJournalEditId}
              onTagChange={setJournalTag}
              onTitleChange={setJournalTitle}
              onTextChange={setJournalText}
              onSortChange={setJournalSort}
              onActiveChange={setJournalActive}
              onSave={() => void handleSaveJournal()}
              saving={saveSaving}
              onCancel={() => setJournalOpen(false)}
            />
            <ContentTab
              siteContent={siteContent}
              contentTitle={contentTitle}
              contentBody={contentBody}
              onTitleChange={setContentTitle}
              onBodyChange={setContentBody}
              onSave={async () => {
                if (!siteContent || contentSaving) return;
                setContentSaving(true);
                setContentSaved(false);
                try {
                  await upsertSiteContent({
                    id: siteContent.id,
                    home_title: contentTitle,
                    home_body: contentBody,
                  });
                  setContentSaved(true);
                } catch (e) {
                  logger.error("admin", "Site content save error:", e);
                  Alert.alert(
                    "Save failed",
                    e instanceof Error
                      ? e.message
                      : "Could not save the content.",
                  );
                } finally {
                  setContentSaving(false);
                }
              }}
              saved={contentSaved}
              saving={contentSaving}
              trainingPrograms={trainingPrograms}
              setTrainingPrograms={setTrainingPrograms}
              onSaveProgram={async (program, isNew) => {
                await upsertAdminTrainingProgram(program);
              }}
              onDeleteProgram={async (id) => {
                await deleteAdminTrainingProgram(id);
              }}
              pilotCostLines={pilotCostLines}
              setPilotCostLines={setPilotCostLines}
              onSavePilotLine={async (line, isNew) => {
                await upsertAdminPilotCostLine(line);
              }}
              onDeletePilotLine={async (id) => {
                await deleteAdminPilotCostLine(id);
              }}
              curriculumHighlights={curriculumHighlights}
              setCurriculumHighlights={setCurriculumHighlights}
              onSaveCurriculum={async (highlight, isNew) => {
                await upsertAdminCurriculumHighlight(highlight);
              }}
              onDeleteCurriculum={async (id) => {
                await deleteAdminCurriculumHighlight(id);
              }}
              canDelete={canDelete}
            />
          </Sub>
        );
      case "Users":
        return (
          <Sub>
            <UsersSection
              users={users}
              total={usersTotal}
              page={usersPage}
              totalPages={usersTotalPages}
              query={userQuery}
              onQueryChange={setUserQuery}
              onApply={() => void loadUsers(1)}
              onPage={(p) => void loadUsers(p)}
              canDelete={canDelete}
              isOwner={isOwner}
              onToggleRole={handleToggleUserRole}
              onToggleTier={handleToggleUserTier}
              onDeleteUser={handleDeleteUser}
              currentUserId={currentUser?.id ?? ""}
            />
            <LogsTab
              crashes={crashReports}
              crashPage={crashReportPage}
              crashTotal={crashReportTotal}
              crashTotalPages={crashReportTotalPages}
              onLoadCrashes={(p) => void loadCrashReports(p)}
              onDeleteCrash={handleDeleteCrashReport}
              appLogs={appLogs}
              logPage={appLogPage}
              logTotal={appLogTotal}
              logTotalPages={appLogTotalPages}
              onLoadLogs={(p) => void loadAppLogs(p)}
              onDeleteLog={handleDeleteAppLog}
              userLogs={userLogs}
              userLogPage={userLogPage}
              userLogTotal={userLogTotal}
              userLogTotalPages={userLogTotalPages}
              onLoadUserLogs={(p) => void loadUserLogs(p)}
              onDeleteUserLog={handleDeleteUserLog}
              profileEntries={profileEntries}
              profileEntryTypes={profileEntryTypes}
              profileEntryPage={profileEntryPage}
              profileEntryTotal={profileEntryTotal}
              profileEntryTotalPages={profileEntryTotalPages}
              onLoadProfileEntries={(p) => void loadProfileEntries(p)}
              onDeleteProfileEntry={handleDeleteProfileEntry}
              canDelete={canDelete}
            />
          </Sub>
        );
      case "Settings":
        return (
          <Sub>
            <SettingsTab
              company={companyInfo}
              setCompany={setCompanyInfo}
              canDelete={canDelete}
              onCompanySaved={async (next) => {
                await saveCompanyInfo(next);
                setCompanyInfo(next);
              }}
              onEditingChange={setSettingsEditing}
            />
            <MessagesTab
              messages={messages}
              total={messagesTotal}
              page={messagesPage}
              totalPages={messagesTotalPages}
              onPage={(p) => void loadMessages(p)}
              status={messageStatus}
              onStatusFilter={(s) => {
                setMessageStatus(s);
                void loadMessages(1);
              }}
              onMarkReplied={handleMarkReplied}
            />
          </Sub>
        );
    }
  }

  return (
    <View className="flex-1 bg-mist">
      {/* C7 biometric lock overlay — while locked, the console is blurred
          and inert (no tab switches, no data actions); the OS biometric
          prompt is up automatically (bioLocked effect above). Cancel/fail
          leaves this screen locked with an explicit retry button. */}
      {bioLocked ? (
        <>
          <Pressable
            className="absolute inset-0 z-40 bg-mist/95 items-center justify-center px-8"
            accessibilityLabel="Admin locked — tap to unlock"
            onPress={() => setBioLocked(true)} // re-triggers the auth effect
          >
            <View className="w-full max-w-sm items-center rounded-2xl border border-line bg-card p-6">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-navy">
                <Feather name="lock" size={24} color="#ffffff" />
              </View>
              <Text className="mt-4 text-center text-base font-black text-ink">
                Admin locked
              </Text>
              <Text className="mt-1 text-center text-xs leading-4 text-muted">
                Unlock with your fingerprint or face to continue. This device
                lock is separate from your staff sign-in.
              </Text>
              <View className="mt-4 rounded-full bg-navy px-6 py-2.5">
                <Text className="text-sm font-bold text-white">Unlock</Text>
              </View>
            </View>
          </Pressable>
        </>
      ) : null}
      {/* U-UI1 (2026-11-09): console bar. Mirrors the website's admin header:
          who you are (role chip + email), freshness of the data, and the one
          refresh control for the current tab. The refresh spinner lives inside
          the button instead of floating over the content (U-47v5), so nothing
          shifts when a load starts or ends. */}
      <View className="shrink-0 border-b border-line bg-card px-4 py-2">
        <View className="flex-row items-center gap-2.5">
          <View
            className={`rounded-full px-2.5 py-1 ${canDelete ? "bg-navy" : "border border-line"}`}
          >
            <Text
              className={`text-[9px] font-black uppercase tracking-[0.14em] ${canDelete ? "text-white" : "text-navy"}`}
            >
              {isOwner ? "Owner" : canDelete ? "Admin" : "Staff"}
            </Text>
          </View>
          <Text
            numberOfLines={1}
            className="min-w-0 flex-1 text-[11px] font-medium text-muted"
          >
            {currentUser?.email ?? "Signed in"}
          </Text>
          {refreshedAt ? (
            <Text className="shrink-0 text-[10px] text-muted">
              {`Updated ${refreshedAt.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}`}
            </Text>
          ) : null}
          <Pressable
            onPress={() => void loadTab()}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={`Refresh ${tab}`}
            className="h-7 w-7 items-center justify-center rounded-full border border-line"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#1e3a8a" />
            ) : (
              <Feather name="refresh-cw" size={13} color="#1e3a8a" />
            )}
          </Pressable>
        </View>
      </View>

      {/* Tab bar — grow-0 keeps the strip at its own height: RN ScrollViews
          default to flexGrow:1, so without it the strip stretches into a huge
          empty band under the tabs whenever the tab content is shorter than
          the screen.
          U-47v2 (owner): the strip must be ONE ROW on every device — tabs get
          a minimum width and nowrap text so nothing wraps to a second row; the
          strip scrolls horizontally instead (offsets measured in onLayout).
          U-UI1: same uppercase treatment and active underline as the website's
          sticky strip, so the two consoles read as one product. */}
      <View className="grow-0 shrink-0 border-b border-line bg-card">
        <ScrollView
          ref={tabScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          <View className="flex-row">
            {TABS.map((t, index) => (
              <Pressable
                key={t}
                onPress={() => goToTab(t)}
                onLayout={(event) => {
                  tabOffsets.current[index] = event.nativeEvent.layout.x;
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t }}
                accessibilityLabel={t}
                className={`shrink-0 border-b-2 px-4 py-2.5 ${tab === t ? "border-navy" : "border-transparent"}`}
                style={{ minWidth: TAB_MIN_WIDTH }}
              >
                <Text
                  numberOfLines={1}
                  className={`text-[11px] font-black uppercase tracking-[0.08em] ${tab === t ? "text-navy" : "text-muted"}`}
                >
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* What this tab is for — the website renders the identical sentence
          from its TAB_HINTS map, so the two consoles explain themselves alike. */}
      <View className="shrink-0 border-b border-line bg-mist px-4 py-1.5">
        <Text className="text-[11px] leading-4 text-muted">
          {ADMIN_TAB_HINTS[tab]}
        </Text>
      </View>

      {/* Swipeable tab content — each of the 8 tabs is a pager
           page synced with the tab strip above (swipe -> onPageSelected
           -> setTab; tab tap -> goToTab -> setPage). Pages mount lazily
           on first visit so the admin doesn't fire all 6 data loads at
           once, then stay mounted so per-tab state survives swiping away. */}
      <PlatformPager
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageSelected={onPageSelected}
        offscreenPageLimit={1}
        scrollEnabled={!editorOnCurrentTab}
      >
        {TABS.map((t) => (
          <View key={t} className="flex-1 bg-mist">
            {visited[t] ? renderTabContent(t) : <View className="flex-1" />}
          </View>
        ))}
      </PlatformPager>

      {/* U-24 (2026-09-24): cross-platform import-by-link dialog. Alert.prompt
          is iOS-only, so Android never even got to the lookup — this modal is
          the one place both platforms paste a product URL. */}
      {importLinkOpen && (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={dismissImportLink}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: "rgba(15, 23, 42, 0.7)",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
            onPress={dismissImportLink}
            accessibilityLabel="Close import by link dialog"
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-line bg-card p-5"
            >
              <Text className="text-xs font-black uppercase tracking-widest text-navy">
                Import into{" "}
                {importDest === "models"
                  ? "3D Products"
                  : importDest === "projects"
                    ? "Projects"
                    : "Electronic Products"}
              </Text>
              <Text className="mt-2 text-sm leading-5 text-muted">
                Paste a product page URL (makerworld.com, a shop listing, …). We
                extract the standard details — everything saves into{" "}
                {importDest === "models"
                  ? "the 3D Products catalog (/3d-printing)"
                  : importDest === "projects"
                    ? "the Projects catalog (/projects)"
                    : "the Electronic Products catalog (/products)"}
                . Review them in the editor before saving.
              </Text>
              <TextInput
                value={importLinkDraft}
                onChangeText={setImportLinkDraft}
                placeholder="https://makerworld.com/en/models/..."
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={() => void confirmImportLink()}
                className="mt-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink"
              />
              {/* The budget is stated where the import starts, not buried in docs:
                  the edge function re-encodes every picture, keeps at most 8 per
                  item, and skips anything over 4 MB. */}
              <Text className="mt-2 text-[11px] leading-4 text-muted">
                {IMAGE_BUDGET_HINT}
              </Text>
              <View className="mt-4 flex-row items-center justify-end gap-2">
                <Pressable
                  onPress={dismissImportLink}
                  className="rounded-full border border-line px-4 py-2"
                >
                  <Text className="text-xs font-black text-ink">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => void confirmImportLink()}
                  disabled={!importLinkDraft.trim()}
                  className={`rounded-full px-4 py-2 ${importLinkDraft.trim() ? "bg-navy" : "bg-slate-300"}`}
                >
                  <Text className="text-xs font-black text-white">
                    Look up product
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

/** Split a multi-line TextInput value into a trimmed, non-empty string array. */
function toStringArrayLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

// ─── Sub-tabs ────────────────────────────────────────────────────────

/** A blank project-package row for the Project packages tab's "+ New project". */
function blankProjectProduct(): AdminProduct {
  return {
    id: "",
    name: "",
    category: "Project Packages",
    projectCategory: "Robo Car",
    price: 0,
    priceLabel: "Request quote",
    sku: "",
    productType: "Project package",
    inventoryType: null,
    note: "",
    description: "",
    specs: [],
    stock: 0,
    delivery: "Ships in 1-2 working days",
    image: "",
    gallery: [],
    importMeta: {},
    badge: null,
    active: true,
    sortOrder: 1000,
    projectOverview: "",
    objectives: [],
    materialsRequired: [],
    learningOutcomes: [],
    buildSteps: [],
    controlMethods: [],
    prerequisites: [],
    deliverables: [],
    estimatedDuration: "",
    sourceFolder: "",
    documentationUrl: "",
    videoUrl: "",
    maintenanceNotes: "",
    audience: "",
    difficulty: "Beginner",
    warranty: "",
  };
}

function DashboardTab({
  stats,
  analytics,
}: {
  stats: DashboardStats | null;
  analytics: AdminAnalytics | null;
}) {
  if (!stats) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  const conversionRate =
    stats.totalOrders > 0 && stats.totalUsers > 0
      ? `${((stats.succeededTransactions / Math.max(1, stats.totalUsers)) * 100).toFixed(1)}%`
      : "—";

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <Text className="font-display text-2xl font-bold tracking-tight text-ink">
        Dashboard
      </Text>
      <View className="mt-3 flex-row flex-wrap gap-3">
        <StatCard
          label="Revenue"
          value={formatNPR(stats.revenue)}
          sub={`Today: ${formatNPR(stats.revenueToday)}`}
        />
        <StatCard label="Users" value={String(stats.totalUsers)} />
        <StatCard
          label="Orders"
          value={String(stats.totalOrders)}
          sub={`${stats.pendingOrders} pending`}
        />
        <StatCard
          label="Cart items"
          value={String(stats.totalCartItems)}
          sub={`${stats.activeCarts} active carts`}
        />
        <StatCard
          label="Products"
          value={String(stats.totalProducts)}
          sub={
            stats.lowStockProducts > 0
              ? `${stats.lowStockProducts} low stock`
              : "OK"
          }
        />
        <StatCard
          label="Messages"
          value={String(stats.totalMessages)}
          sub={`${stats.unreadMessages} unread`}
        />
        <StatCard
          label="Transactions"
          value={String(stats.totalTransactions)}
          sub={`${stats.succeededTransactions} succeeded`}
        />
        <StatCard
          label="Page Views (30d)"
          value={analytics ? String(analytics.totalViews) : "—"}
          sub={`Today: ${analytics?.todayViews ?? "—"}`}
        />
        <StatCard
          label="Conversion Rate"
          value={conversionRate}
          sub="Paid orders / users"
        />
      </View>

      {analytics && analytics.topPaths.length > 0 && (
        <View className="mt-3 rounded-xl border border-line bg-card p-4">
          <Text className="font-display text-lg font-bold text-ink">
            Top Pages (30 days)
          </Text>
          {analytics.topPaths.slice(0, 10).map((pv) => (
            <View
              key={pv.path}
              className="flex-row items-center justify-between gap-3 border-b border-line py-2 last:border-b-0"
            >
              <Text
                className="min-w-0 flex-1 font-mono text-xs text-muted"
                numberOfLines={1}
              >
                {pv.path}
              </Text>
              <Text className="shrink-0 text-xs font-bold text-ink">
                {pv.count} views
              </Text>
            </View>
          ))}
        </View>
      )}

      {analytics && analytics.viewsByDay.length > 0 && (
        <View className="mt-3 rounded-xl border border-line bg-card p-4">
          <Text className="font-display text-lg font-bold text-ink">
            Daily Traffic (30 days)
          </Text>
          <View className="mt-3 flex-row items-end" style={{ height: 120 }}>
            {(() => {
              const max = Math.max(
                ...analytics.viewsByDay.map((x) => x.count),
                1,
              );
              return analytics.viewsByDay.map((d) => (
                <View
                  key={d.date}
                  style={{
                    flex: 1,
                    height: Math.max((d.count / max) * 110, 2),
                    backgroundColor: "#1e3a8a",
                    marginHorizontal: 1,
                  }}
                />
              ));
            })()}
          </View>
          <View className="mt-1 flex-row justify-between">
            <Text className="text-[10px] text-muted">
              {analytics.viewsByDay[0]?.date}
            </Text>
            <Text className="text-[10px] text-muted">
              {analytics.viewsByDay[analytics.viewsByDay.length - 1]?.date}
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    // U-47v3: min-w instead of fixed w-[47%] — cards flex with the row
    // instead of overflowing the wrap container on narrow screens.
    <View
      className="min-w-[45%] flex-1 overflow-hidden rounded-xl border border-line bg-card p-4"
      style={{ maxWidth: "100%" }}
    >
      <Text
        numberOfLines={1}
        className="text-xs font-black uppercase tracking-widest text-muted"
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        className="mt-2 font-display text-xl font-bold text-ink"
      >
        {value}
      </Text>
      {sub && (
        <Text numberOfLines={2} className="mt-1 text-xs text-muted">
          {sub}
        </Text>
      )}
    </View>
  );
}

function OrdersTab({
  orders,
  total,
  page,
  totalPages,
  onPage,
  onStatusChange,
  query,
  onQueryChange,
  status,
  onStatusFilter,
  onApply,
}: {
  orders: AdminOrder[];
  total: number;
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  onStatusChange: (id: string, s: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  status: string;
  onStatusFilter: (s: string) => void;
  onApply: () => void;
}) {
  const STATUSES = ["pending", "paid", "fulfilled", "cancelled"] as const;
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      {/* Heading + filters */}
      <View className="mb-3">
        <Text className="font-display text-xl font-bold text-ink">
          Customer orders ({total})
        </Text>
        <View className="mt-3 flex-row gap-2">
          <View className="flex-1">
            <TextInput
              value={query}
              onChangeText={onQueryChange}
              onSubmitEditing={onApply}
              returnKeyType="search"
              placeholder="Search buyer (name or email)…"
              className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink"
            />
          </View>
          <Pressable onPress={onApply} className="rounded-lg bg-navy px-4 py-2">
            <Text className="text-xs font-black text-white">Apply</Text>
          </Pressable>
        </View>
        <View className="mt-2 flex-row flex-wrap gap-2">
          {(["", ...STATUSES] as const).map((s) => (
            <Pressable
              key={s || "all"}
              onPress={() => onStatusFilter(s)}
              className={`rounded-full px-3 py-1.5 ${status === s ? "bg-navy" : "border border-line bg-card"}`}
            >
              <Text
                className={`text-xs font-bold capitalize ${status === s ? "text-white" : "text-muted"}`}
              >
                {s || "All"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {orders.length === 0 ? (
        <Text className="py-8 text-center text-sm text-muted">
          No orders found.
        </Text>
      ) : (
        <>
          {orders.map((o) => (
            <View
              key={o.id}
              className="mb-3 rounded-xl border border-line bg-card p-4"
            >
              <View className="flex-row items-center justify-between">
                <View className="min-w-0 flex-1 pr-2">
                  <Text
                    numberOfLines={1}
                    className="text-sm font-bold text-ink"
                  >
                    #{o.id.slice(0, 8).toUpperCase()} · NPR{" "}
                    {o.totalNpr.toLocaleString("en-IN")}
                  </Text>
                  <Text numberOfLines={1} className="text-xs text-muted">
                    {o.customerName} · {o.email}
                  </Text>
                  {o.address ? (
                    <Text className="text-xs text-muted" numberOfLines={1}>
                      {o.address}
                    </Text>
                  ) : null}
                  <Text className="text-xs text-muted">
                    {o.provider ? `${o.provider} · ` : ""}
                    {new Date(o.createdAt).toLocaleString()}
                  </Text>
                </View>
                <Text className="shrink-0 text-xs font-bold uppercase text-navy">
                  {o.status}
                </Text>
              </View>
              {o.items.length > 0 && (
                <View className="mt-2 border-t border-line pt-2">
                  {o.items.map((item, i) => (
                    <Text
                      key={`${o.id}-${i}`}
                      className="text-xs leading-5 text-muted"
                      numberOfLines={1}
                    >
                      {item.quantity} × {item.name} (NPR{" "}
                      {(item.price * item.quantity).toLocaleString("en-IN")})
                    </Text>
                  ))}
                </View>
              )}
              <View className="mt-2 flex-row flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => onStatusChange(o.id, s)}
                    className={`rounded-full px-3 py-1 ${o.status === s ? "bg-navy" : "border border-line"}`}
                  >
                    <Text
                      className={`text-xs font-bold ${o.status === s ? "text-white" : "text-muted"}`}
                    >
                      {s}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
          <AdminPager page={page} totalPages={totalPages} onPage={onPage} />
          <Text className="mt-1 text-center text-xs text-muted">
            {total} total order{total === 1 ? "" : "s"}
          </Text>
        </>
      )}
    </ScrollView>
  );
}

function ProductsTab({
  kind,
  products,
  query,
  onQueryChange,
  editing,
  onChange,
  onEdit,
  onNew,
  onImportLink,
  importBusy,
  onImportCancel,
  onSave,
  canDelete,
  onDelete,
  onToggleActive,
  fromLink,
  saveSaving,
}: {
  /** U-44: which catalog this tab manages (drives copy + import preset). */
  kind: "electronic" | "models";
  products: AdminProduct[];
  query: string;
  onQueryChange: (q: string) => void;
  editing: AdminProduct | null;
  onChange: (p: AdminProduct) => void;
  onEdit: (p: AdminProduct | null) => void;
  onNew: () => void;
  onImportLink: () => void;
  importBusy: boolean;
  onSave: () => void;
  canDelete: boolean;
  onDelete: (id: string) => void;
  onToggleActive: (p: AdminProduct) => void;
  onImportCancel: () => void;
  fromLink: boolean;
  saveSaving: boolean;
}) {
  const [preview, setPreview] = useState<AdminProduct | null>(null);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("All");
  const PAGE_SIZE = 8;
  const categories = [
    "All",
    ...Array.from(new Set(products.map((p) => p.category).filter(Boolean))),
  ];
  const needle = query.trim().toLowerCase();
  const filtered = products.filter(
    (p) =>
      (category === "All" || p.category === category) &&
      (!needle ||
        `${p.name} ${p.sku} ${p.id} ${p.category}`
          .toLowerCase()
          .includes(needle)),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  React.useEffect(() => {
    setPage(1);
  }, [query, category]);

  if (editing) {
    return (
      <View className="flex-1">
        <ProductEditor
          product={editing}
          onChange={onChange}
          onSave={onSave}
          onCancel={() => {
            onEdit(null);
            onImportCancel();
          }}
          isNew={!products.some((p) => p.id === editing.id)}
          categoryOptions={categories.filter((c) => c !== "All")}
          fromLink={fromLink}
          saving={saveSaving}
        />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListHeaderComponent={
          <View className="mb-3">
            {/* U-47v5 (owner: toolbar overflowed the right edge): the title
                and the Import/+New pills shared one flex-row — on phones the
                pills pushed past the screen. Title and actions now stack,
                actions wrap on their own full-width row. */}
            <View className="flex-row items-center justify-between gap-2">
              <Text
                numberOfLines={1}
                className="min-w-0 flex-1 font-display text-xl font-bold text-ink"
              >
                {kind === "models" ? "3D Products" : "Electronic Products"} (
                {products.length})
              </Text>
            </View>
            <View className="mt-2 flex-row flex-wrap gap-2">
              <Pressable
                onPress={onImportLink}
                disabled={importBusy}
                className="self-start rounded-full bg-gold px-4 py-2"
                accessibilityRole="button"
                accessibilityLabel={`Import into ${kind === "models" ? "3D Products" : "Electronic Products"} by link`}
              >
                <Text className="text-xs font-black text-ink">
                  {importBusy ? "Importing..." : "Import by link"}
                </Text>
              </Pressable>
              <Pressable
                onPress={onNew}
                className="self-start rounded-full bg-navy px-4 py-2"
              >
                <Text className="text-xs font-black text-white">
                  + New product
                </Text>
              </Pressable>
            </View>
            <View className="mt-3 flex-row flex-wrap items-center gap-2">
              <View className="flex-1">
                <CategoryDropdown
                  value={category}
                  options={categories}
                  onChange={setCategory}
                  placeholder="All categories"
                  title="Filter by category"
                />
              </View>
              <TextInput
                value={query}
                onChangeText={onQueryChange}
                placeholder="Search name, SKU, id…"
                className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink"
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text className="py-8 text-center text-sm text-muted">
            No products found.
          </Text>
        }
        ListFooterComponent={
          totalPages > 1 ? (
            <AdminPager page={page} totalPages={totalPages} onPage={setPage} />
          ) : null
        }
        renderItem={({ item }) => (
          <View className="mb-3 rounded-xl border border-line bg-card p-4">
            <View className="flex-row items-start">
              {galleryImages(item)[0] ? (
                <Image
                  source={{ uri: galleryImages(item)[0] }}
                  className="mr-3 h-14 w-14 rounded-lg bg-mist"
                  resizeMode="cover"
                />
              ) : null}
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center justify-between gap-2">
                  <Text
                    className="shrink-1 text-sm font-bold text-ink"
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <Text className="shrink-0 text-xs font-black text-navy">
                    {item.priceLabel ||
                      `NPR ${item.price.toLocaleString("en-IN")}`}
                  </Text>
                </View>
                <Text
                  className="mt-0.5 text-xs font-bold uppercase tracking-wide text-gold"
                  numberOfLines={1}
                >
                  {item.category}
                </Text>
                {!item.active && (
                  <Text className="mt-0.5 text-[10px] font-black uppercase text-red-500">
                    Hidden from customers
                  </Text>
                )}
              </View>
            </View>
            <View className="mt-2 flex-row flex-wrap gap-2">
              <AdminAction
                onPress={() => onEdit(item)}
                label="Edit"
                tone="navy"
              />
              <AdminAction
                onPress={() => setPreview(item)}
                label="Preview"
                tone="plain"
              />
              <AdminAction
                onPress={() => onToggleActive(item)}
                label={item.active ? "Hide" : "Show"}
                tone="plain"
              />
              {canDelete && (
                <AdminAction
                  onPress={() => onDelete(item.id)}
                  label="Delete"
                  tone="red"
                />
              )}
            </View>
          </View>
        )}
      />
      {preview && (
        <ProductPreviewModal
          product={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </View>
  );
}

function ProjectTab({
  title,
  products,
  catalogProducts,
  editing,
  onChange,
  onEdit,
  onNew,
  onSaveProduct,
  canDelete,
  onDelete,
  onToggleActive,
  saveSaving,
}: {
  title: string;
  products: AdminProduct[];
  /** U-45 Phase 2: FULL admin catalog snapshot for the component linker's
      suggestions + product-name resolution (this tab's list is project-scoped). */
  catalogProducts: AdminProduct[];
  editing: AdminProduct | null;
  onChange: (p: AdminProduct | null) => void;
  onEdit: (p: AdminProduct) => void;
  onNew: () => void;
  onSaveProduct: (p: AdminProduct) => Promise<boolean>;
  saveSaving: boolean;
  canDelete: boolean;
  onDelete: (id: string) => void;
  onToggleActive: (p: AdminProduct) => void;
}) {
  const isNew = editing ? !products.some((p) => p.id === editing.id) : false;
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  // U-48: this tab saves through onSaveProduct directly (not the guarded
  // parent handler), so it owns its saving flag for the Save button.
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<AdminProduct | null>(null);
  const PAGE_SIZE = 6;
  const categories = [
    "All",
    ...Array.from(new Set(products.map((p) => p.category).filter(Boolean))),
  ];
  const needle = query.trim().toLowerCase();
  const filtered = products.filter(
    (p) =>
      (category === "All" || p.category === category) &&
      (!needle ||
        `${p.name} ${p.sku} ${p.id} ${p.description}`
          .toLowerCase()
          .includes(needle)),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  React.useEffect(() => {
    setPage(1);
  }, [category, query]);

  // ── U-45 Phase 2 (2026-09-27): component linker for the OPEN project —
  // mirror of the website's AdminProjectPackages linker. Suggestions run the
  // SAME matcher as the website (src/lib/project-components.ts) locally over
  // the Electronic Products catalog; links save through the staff-gated
  // save_project_components RPC (replace-all, same contract as the web PUT).
  const [linkerLinks, setLinkerLinks] = useState<ProjectComponentLink[]>([]);
  const [linkerSuggestions, setLinkerSuggestions] = useState<
    ProjectComponentSuggestion[]
  >([]);
  const [linkerBusy, setLinkerBusy] = useState(false);
  const [linkerLoadedId, setLinkerLoadedId] = useState<string | null>(null);
  const linkerProjectId =
    editing?.productType === "Project package" ? editing.id : null;

  // Load saved links + compute fresh suggestions whenever a (saved) project
  // opens in the editor. Keyed on the project ID — not the whole editing
  // object — so staff edits to other fields while the linker is open can't
  // wipe the in-progress link list.
  React.useEffect(() => {
    if (!linkerProjectId) {
      setLinkerLinks([]);
      setLinkerSuggestions([]);
      return;
    }
    let active = true;
    setLinkerBusy(true);
    void listProjectComponents(linkerProjectId)
      .then((saved) => {
        if (!active) return;
        if (saved.length > 0) {
          setLinkerLinks(saved);
        }
        // With no saved links the prefill effect (below) fills from the
        // matcher's confident suggestions once they exist.
        setLinkerLoadedId(linkerProjectId);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLinkerBusy(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkerProjectId]);

  // Suggestions: match the project's materials_required against the
  // Electronic Products catalog. ProjectTab's own list is project-scoped,
  // so the FULL catalog snapshot comes in via a separate prop (same rows
  // the website matcher's endpoint queries).
  const linkerCatalog: CatalogCandidate[] = catalogProducts
    .filter(
      (p) =>
        p.id !== editing?.id && p.active !== false && isComponentsCatalogRow(p),
    )
    .map((p) => ({ id: p.id, name: p.name, sku: p.sku }));
  React.useEffect(() => {
    if (!linkerProjectId || !editing) return;
    setLinkerSuggestions(
      dedupeSuggestions(
        suggestComponents(editing.materialsRequired, linkerCatalog),
      ),
    );
    // Recompute when the project (its materials) or the catalog changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkerProjectId, editing?.materialsRequired.join("\n"), catalogProducts]);

  // Auto-prefill ONCE per project when nothing is saved yet: first confident
  // matcher suggestions become the editable starting list (web parity).
  React.useEffect(() => {
    if (
      linkerLoadedId &&
      linkerLoadedId === linkerProjectId &&
      linkerLinks.length === 0 &&
      linkerSuggestions.some((s) => s.productId)
    ) {
      setLinkerLinks(
        linkerSuggestions
          .filter((s) => s.productId)
          .map((s) => ({
            productId: s.productId as string,
            quantity: s.quantity,
          })),
      );
      setLinkerLoadedId(null); // never re-prefill after a staff removal
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkerLoadedId, linkerProjectId, linkerLinks, linkerSuggestions]);

  async function saveComponentLinks() {
    if (!linkerProjectId) return;
    setLinkerBusy(true);
    try {
      const savedCount = await saveProjectComponents(
        linkerProjectId,
        linkerLinks,
      );
      Alert.alert("Saved", `Component links saved (${savedCount}).`);
    } catch (e) {
      Alert.alert(
        "Save failed",
        e instanceof Error ? e.message : "Could not save component links.",
      );
    } finally {
      setLinkerBusy(false);
    }
  }

  if (editing) {
    return (
      <View className="flex-1">
        <ProductEditor
          product={editing}
          onChange={onChange}
          saving={saving}
          onSave={() => {
            if (saving) return;
            setSaving(true);
            void onSaveProduct(editing)
              .then((saved) => {
                if (saved) onChange(null);
              })
              .finally(() => setSaving(false));
          }}
          onCancel={() => onChange(null)}
          isNew={isNew}
          categoryOptions={categories.filter((c) => c !== "All")}
        />
        {/* U-45 Phase 2: the linker card — only meaningful for a SAVED
            project row (links hang off its id). Mirrors the website's
            AdminProjectPackages linker: pre-filled list, qty editing,
            remove, suggestion chips, explicit save. */}
        {editing.productType === "Project package" && editing.id ? (
          <ComponentLinkerCard
            links={linkerLinks}
            suggestions={linkerSuggestions}
            busy={linkerBusy}
            products={catalogProducts}
            onLinksChange={setLinkerLinks}
            onSave={() => void saveComponentLinks()}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View className="flex-1">
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListHeaderComponent={
          <View className="mb-3">
            <Text className="font-display text-2xl font-bold tracking-tight text-ink">
              {title}{" "}
              <Text className="text-base font-bold text-muted">
                ({filtered.length})
              </Text>
            </Text>
            <View className="mt-2 flex-row items-center gap-2">
              <View className="flex-1">
                <CategoryDropdown
                  value={category}
                  options={categories}
                  onChange={setCategory}
                  placeholder="All categories"
                  title="Filter by category"
                />
              </View>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search name, SKU, id…"
                className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink"
              />
              <Pressable
                onPress={onNew}
                className="shrink-0 rounded-full bg-navy px-4 py-2"
              >
                <Text className="text-xs font-black text-white">
                  + New project
                </Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text className="py-8 text-center text-sm text-muted">
            No {title.toLowerCase()} found.
          </Text>
        }
        ListFooterComponent={
          totalPages > 1 ? (
            <AdminPager page={page} totalPages={totalPages} onPage={setPage} />
          ) : null
        }
        renderItem={({ item }) => (
          <View className="mb-3 overflow-hidden rounded-xl border border-line bg-card">
            {galleryImages(item)[0] ? (
              <Image
                source={{ uri: galleryImages(item)[0] }}
                className="h-36 w-full bg-mist"
                resizeMode="cover"
              />
            ) : null}
            <View className="p-4">
              <Text className="text-xs font-black uppercase tracking-wide text-gold">
                {item.category}
              </Text>
              <Text className="mt-1 text-sm font-bold text-ink">
                {item.name}
              </Text>
              <Text className="mt-1 text-xs font-black text-navy">
                {item.priceLabel || "Request quote"}
              </Text>
              <Text
                className="mt-1 text-xs leading-5 text-muted"
                numberOfLines={3}
              >
                {item.description || item.note}
              </Text>
              {!item.active && (
                <Text className="mt-1 text-[10px] font-black uppercase text-red-500">
                  Hidden from customers
                </Text>
              )}
              <View className="mt-3 flex-row flex-wrap gap-2">
                <AdminAction
                  onPress={() => onEdit(item)}
                  label="Edit"
                  tone="navy"
                />
                <AdminAction
                  onPress={() => setPreview(item)}
                  label="Preview"
                  tone="plain"
                />
                <AdminAction
                  onPress={() => onToggleActive(item)}
                  label={item.active ? "Hide" : "Show"}
                  tone="plain"
                />
                {canDelete && (
                  <AdminAction
                    onPress={() => onDelete(item.id)}
                    label="Delete"
                    tone="red"
                  />
                )}
              </View>
            </View>
          </View>
        )}
      />
      {preview && (
        <ProductPreviewModal
          product={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </View>
  );
}

// ─── U-45 Phase 2 (2026-09-27): project ↔ component linker card ──────
// Mirror of the website's AdminProjectPackages linker card: the editable
// link list (name + qty + remove), the matcher suggestion chips (tap to
// add; "no match" materials render disabled), and the explicit Save. All
// reads/writes ride the public-read join table + save_project_components
// RPC (see adminService).
function ComponentLinkerCard({
  links,
  suggestions,
  busy,
  products,
  onLinksChange,
  onSave,
}: {
  links: ProjectComponentLink[];
  suggestions: ProjectComponentSuggestion[];
  busy: boolean;
  products: AdminProduct[];
  onLinksChange: (next: ProjectComponentLink[]) => void;
  onSave: () => void;
}) {
  return (
    <View className="mx-4 mb-6 mt-3 rounded-xl border border-line bg-card p-4">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="flex-1 font-display text-base font-bold text-ink">
          Components used in this project
        </Text>
        <Pressable
          onPress={onSave}
          disabled={busy}
          className="rounded-full bg-navy px-4 py-2 disabled:opacity-60"
          accessibilityRole="button"
          accessibilityLabel="Save component links"
        >
          <Text className="text-xs font-black text-white">
            {busy ? "Saving…" : "Save links"}
          </Text>
        </Pressable>
      </View>
      <Text className="mt-1 text-xs leading-5 text-muted">
        Pre-filled from the project's materials list where the catalog matched.
        Link the exact Electronic Products a builder needs — they appear (with
        quantities) on the project's page.
      </Text>

      {links.length === 0 && !busy && (
        <Text className="mt-3 text-sm text-muted">
          No components linked yet — add from the suggestions below.
        </Text>
      )}
      {links.map((link) => {
        const linked = products.find((p) => p.id === link.productId);
        return (
          <View
            key={link.productId}
            className="mt-2 rounded-lg border border-line px-3 py-2"
          >
            <View className="flex-row items-center justify-between gap-2">
              <Text
                className="min-w-0 flex-1 text-sm font-bold text-ink"
                numberOfLines={1}
              >
                {linked?.name ?? link.productId}
              </Text>
              <Pressable
                onPress={() =>
                  onLinksChange(
                    links.filter((l) => l.productId !== link.productId),
                  )
                }
                accessibilityRole="button"
                accessibilityLabel={`Remove ${linked?.name ?? link.productId}`}
              >
                <Text className="text-xs font-bold text-red-500 underline">
                  Remove
                </Text>
              </Pressable>
            </View>
            <View className="mt-1.5 flex-row flex-wrap items-center gap-2">
              <Text className="text-xs font-black text-muted">Qty</Text>
              <TextInput
                value={String(link.quantity)}
                onChangeText={(raw) => {
                  const parsed = Math.max(
                    1,
                    Math.min(99, Math.round(Number(raw) || 1)),
                  );
                  onLinksChange(
                    links.map((l) =>
                      l.productId === link.productId
                        ? { ...l, quantity: parsed }
                        : l,
                    ),
                  );
                }}
                keyboardType="number-pad"
                className="w-16 rounded-md border border-line bg-surface px-2 py-1 text-right text-sm text-ink"
                accessibilityLabel={`Quantity for ${linked?.name ?? link.productId}`}
              />
            </View>
          </View>
        );
      })}

      {suggestions.length > 0 && (
        <View className="mt-4 border-t border-line pt-3">
          <Text className="text-[10px] font-black uppercase tracking-widest text-muted">
            Matcher suggestions
          </Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {suggestions.map((s) => {
              const already =
                s.productId != null &&
                links.some((l) => l.productId === s.productId);
              return (
                <Pressable
                  key={s.label}
                  onPress={() => {
                    if (!s.productId || already) return;
                    onLinksChange([
                      ...links,
                      { productId: s.productId, quantity: s.quantity },
                    ]);
                  }}
                  disabled={!s.productId || already}
                  className={`rounded-full border px-3 py-1.5 ${
                    already
                      ? "border-line bg-mist"
                      : s.productId
                        ? "border-navy bg-surface"
                        : "border-dashed border-line"
                  }`}
                  accessibilityRole="button"
                  accessibilityLabel={
                    s.productId
                      ? `Add ${s.label}${s.quantity > 1 ? ` (×${s.quantity})` : ""}`
                      : `${s.label} — no catalog match`
                  }
                >
                  <Text
                    className={`text-xs font-bold ${
                      already || !s.productId ? "text-muted" : "text-navy"
                    }`}
                  >
                    {already ? "✓ " : "+ "}
                    {s.label}
                    {s.quantity > 1 ? ` (×${s.quantity})` : ""}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

function ProductEditor({
  product,
  onChange,
  onSave,
  onCancel,
  isNew,
  categoryOptions,
  fromLink,
  saving,
}: {
  product: AdminProduct;
  onChange: (next: AdminProduct) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew: boolean;
  categoryOptions: string[];
  fromLink?: boolean;
  saving?: boolean;
}) {
  function patch(patchPart: Partial<AdminProduct>) {
    onChange({ ...product, ...patchPart });
  }

  const inputClass =
    "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink";
  const isProject =
    product.productType === "Project package" ||
    product.category === "Robot Cars" ||
    product.category === "Pre-packaged Kits";

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="rounded-xl border border-line bg-card p-4">
        <Text className="mb-1 font-display text-lg font-bold text-ink">
          {isNew ? "Add a new product" : `Edit ${product.id}`}
        </Text>
        <Text className="mb-3 text-xs text-muted">
          Type: {product.productType || "Retail kit"}
        </Text>

        <Text className="mb-1 text-xs font-bold text-muted">
          Id (slug, e.g. arduino-uno)
        </Text>
        <TextInput
          value={product.id}
          onChangeText={(id) =>
            patch({ id: id.trim().toLowerCase().replace(/\s+/g, "-") })
          }
          className={`mb-3 ${inputClass}`}
          placeholder="arduino-uno"
          autoCapitalize="none"
        />
        <Text className="mb-1 text-xs font-bold text-muted">Name</Text>
        <TextInput
          value={product.name}
          onChangeText={(name) => patch({ name })}
          className={`mb-3 ${inputClass}`}
          placeholder="Product name"
        />
        <Text className="mb-1 text-xs font-bold text-muted">Category</Text>
        <View className="mb-3">
          <CategoryDropdown
            value={product.category || ""}
            options={categoryOptions}
            onChange={(category) => patch({ category })}
            placeholder="Select a category"
            title="Category"
            allowCustom
          />
        </View>

        <View className="mb-3 flex-row gap-3">
          <View className="flex-1">
            <Text className="mb-1 text-xs font-bold text-muted">
              Price (NPR)
            </Text>
            <TextInput
              value={String(product.price)}
              onChangeText={(price) =>
                patch({ price: Math.max(0, Number(price) || 0) })
              }
              keyboardType="numeric"
              className={inputClass}
              placeholder="0"
            />
          </View>
          <View className="flex-1">
            <Text className="mb-1 text-xs font-bold text-muted">Stock</Text>
            <TextInput
              value={String(product.stock)}
              onChangeText={(stock) =>
                patch({ stock: Math.max(0, Math.round(Number(stock) || 0)) })
              }
              keyboardType="numeric"
              className={inputClass}
              placeholder="0"
            />
          </View>
        </View>
        <Text className="mb-1 text-xs font-bold text-muted">
          Price label (e.g. NPR 1,450)
        </Text>
        <TextInput
          value={product.priceLabel}
          onChangeText={(priceLabel) => patch({ priceLabel })}
          className={`mb-3 ${inputClass}`}
          placeholder="NPR 1,450"
        />
        <Text className="mb-1 text-xs font-bold text-muted">SKU</Text>
        <TextInput
          value={product.sku}
          onChangeText={(sku) => patch({ sku })}
          className={`mb-3 ${inputClass}`}
          placeholder="GEN-…"
          autoCapitalize="characters"
        />
        <Text className="mb-1 text-xs font-bold text-muted">
          Short summary (note)
        </Text>
        <TextInput
          value={product.note}
          onChangeText={(note) => patch({ note })}
          multiline
          numberOfLines={2}
          className={`mb-3 ${inputClass}`}
          placeholder="Short summary"
        />
        <Text className="mb-1 text-xs font-bold text-muted">Description</Text>
        <TextInput
          value={product.description}
          onChangeText={(description) => patch({ description })}
          multiline
          style={{ textAlignVertical: "top" }}
          className={`mb-3 min-h-20 ${inputClass}`}
          placeholder="Full description"
        />
        <Text className="mb-1 text-xs font-bold text-muted">
          Specs (one per line)
        </Text>
        <TextInput
          value={product.specs.join("\n")}
          onChangeText={(specs) => patch({ specs: specs.split("\n") })}
          multiline
          style={{ textAlignVertical: "top" }}
          className={`mb-3 min-h-20 ${inputClass}`}
          placeholder={"1.3-inch OLED\nI2C interface"}
        />
        <Text className="mb-1 text-xs font-bold text-muted">Image URL</Text>
        {product.image ? (
          // U-39b: remove-cross on the cover thumbnail.
          <View className="mb-2 h-16 w-16">
            <Image
              source={{ uri: product.image }}
              className="h-16 w-16 rounded-lg bg-mist"
              resizeMode="cover"
              accessibilityLabel="Extracted product image"
            />
            <Pressable
              onPress={() => patch({ image: "" })}
              accessibilityRole="button"
              accessibilityLabel="Remove product image"
              className="absolute -right-2 -top-2 h-6 w-6 items-center justify-center rounded-full border border-line bg-card"
            >
              <Text className="text-xs font-black text-ink">×</Text>
            </Pressable>
          </View>
        ) : null}
        <TextInput
          value={product.image}
          onChangeText={(image) => patch({ image })}
          className={`mb-3 ${inputClass}`}
          placeholder="https://…"
          autoCapitalize="none"
        />
        <Text className="mb-1 text-xs font-bold text-muted">
          Gallery (one URL per line, max 8)
        </Text>
        {Array.isArray(product.gallery) && product.gallery.length > 0 && (
          <View className="mb-2 flex-row flex-wrap gap-2">
            {product.gallery.slice(0, 8).map((uri, i) => (
              // U-39b (2026-09-26): per-image remove cross so staff can drop
              // unwanted extraction photos before saving.
              <View key={`${uri}-${i}`} className="h-14 w-14">
                <Image
                  source={{ uri }}
                  className="h-14 w-14 rounded-lg bg-mist"
                  resizeMode="cover"
                  accessibilityLabel={`Gallery ${i + 1}`}
                />
                <Pressable
                  onPress={() =>
                    patch({
                      gallery: (product.gallery as string[]).filter(
                        (_, j) => j !== i,
                      ),
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Remove gallery image ${i + 1}`}
                  className="absolute -right-2 -top-2 h-6 w-6 items-center justify-center rounded-full border border-line bg-card"
                >
                  <Text className="text-xs font-black text-ink">×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
        <TextInput
          value={
            Array.isArray(product.gallery) ? product.gallery.join("\n") : ""
          }
          onChangeText={(gallery) =>
            patch({
              gallery: gallery
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .slice(0, 8),
            })
          }
          multiline
          style={{ textAlignVertical: "top" }}
          className={`mb-3 min-h-20 ${inputClass}`}
          placeholder={"https://…\nhttps://…"}
          autoCapitalize="none"
        />

        <Text className="mb-1 text-xs font-bold text-muted">Product type</Text>
        <View className="mb-3">
          <CategoryDropdown
            value={product.productType || "Retail kit"}
            options={[
              "Retail kit",
              "Project package",
              "Robot Cars",
              "Material",
              "Service package",
            ]}
            onChange={(productType) => patch({ productType })}
            placeholder="Select a product type"
            title="Product type"
            allowCustom
          />
        </View>

        {isProject ? (
          <View className="mb-3 rounded-xl border border-line bg-surface p-3">
            <Text className="mb-2 font-display text-base font-bold text-ink">
              Project information
            </Text>
            <Text className="mb-1 text-xs font-bold text-muted">
              Project overview
            </Text>
            <TextInput
              value={product.projectOverview}
              onChangeText={(projectOverview) => patch({ projectOverview })}
              multiline
              style={{ textAlignVertical: "top" }}
              className={`mb-3 min-h-20 ${inputClass}`}
              placeholder="Fully-built demo car with instructions…"
            />
            <Text className="mb-1 text-xs font-bold text-muted">
              Objectives (one per line)
            </Text>
            <TextInput
              value={product.objectives.join("\n")}
              onChangeText={(v) => patch({ objectives: toStringArrayLines(v) })}
              multiline
              className={`mb-3 ${inputClass}`}
              placeholder="Control motors and servo via ESP32…"
            />
            <Text className="mb-1 text-xs font-bold text-muted">
              Materials required (one per line)
            </Text>
            <TextInput
              value={product.materialsRequired.join("\n")}
              onChangeText={(v) =>
                patch({ materialsRequired: toStringArrayLines(v) })
              }
              multiline
              className={`mb-3 ${inputClass}`}
              placeholder="ESP32 dev board…"
            />
            <Text className="mb-1 text-xs font-bold text-muted">
              Learning outcomes (one per line)
            </Text>
            <TextInput
              value={product.learningOutcomes.join("\n")}
              onChangeText={(v) =>
                patch({ learningOutcomes: toStringArrayLines(v) })
              }
              multiline
              className={`mb-3 ${inputClass}`}
              placeholder="Understand PWM signal control…"
            />
            <Text className="mb-1 text-xs font-bold text-muted">
              Build steps (one per line)
            </Text>
            <TextInput
              value={product.buildSteps.join("\n")}
              onChangeText={(v) => patch({ buildSteps: toStringArrayLines(v) })}
              multiline
              className={`mb-3 ${inputClass}`}
              placeholder="Mount the motors on the chassis…"
            />
            <Text className="mb-1 text-xs font-bold text-muted">
              Control methods (one per line)
            </Text>
            <TextInput
              value={product.controlMethods.join("\n")}
              onChangeText={(v) =>
                patch({ controlMethods: toStringArrayLines(v) })
              }
              multiline
              className={`mb-3 ${inputClass}`}
              placeholder="Bluetooth remote (GENUM app)…"
            />
            <Text className="mb-1 text-xs font-bold text-muted">
              Prerequisites (one per line)
            </Text>
            <TextInput
              value={product.prerequisites.join("\n")}
              onChangeText={(v) =>
                patch({ prerequisites: toStringArrayLines(v) })
              }
              multiline
              className={`mb-3 ${inputClass}`}
              placeholder="Basic wiring knowledge…"
            />
            <Text className="mb-1 text-xs font-bold text-muted">
              Deliverables (one per line)
            </Text>
            <TextInput
              value={product.deliverables.join("\n")}
              onChangeText={(v) =>
                patch({ deliverables: toStringArrayLines(v) })
              }
              multiline
              className={`mb-3 ${inputClass}`}
              placeholder="Fully assembled robot car…"
            />
            <Text className="mb-1 text-xs font-bold text-muted">
              Estimated duration
            </Text>
            <TextInput
              value={product.estimatedDuration}
              onChangeText={(estimatedDuration) => patch({ estimatedDuration })}
              className={`mb-3 ${inputClass}`}
              placeholder="2-3 hours"
            />
            <Text className="mb-1 text-xs font-bold text-muted">
              Source folder
            </Text>
            <TextInput
              value={product.sourceFolder}
              onChangeText={(sourceFolder) => patch({ sourceFolder })}
              className={`mb-3 ${inputClass}`}
              placeholder="Genum_SMART_DUSTBIN_V1.0.0"
              autoCapitalize="none"
            />
            <Text className="mb-1 text-xs font-bold text-muted">
              Documentation URL
            </Text>
            <TextInput
              value={product.documentationUrl}
              onChangeText={(documentationUrl) => patch({ documentationUrl })}
              className={`mb-3 ${inputClass}`}
              placeholder="https://…"
              autoCapitalize="none"
            />
            <Text className="mb-1 text-xs font-bold text-muted">Video URL</Text>
            <TextInput
              value={product.videoUrl}
              onChangeText={(videoUrl) => patch({ videoUrl })}
              className={`mb-3 ${inputClass}`}
              placeholder="https://…"
              autoCapitalize="none"
            />
            <Text className="mb-1 text-xs font-bold text-muted">
              Maintenance notes
            </Text>
            <TextInput
              value={product.maintenanceNotes}
              onChangeText={(maintenanceNotes) => patch({ maintenanceNotes })}
              multiline
              className={`mb-3 ${inputClass}`}
              placeholder="Safety / maintenance notes"
            />
            <Text className="mb-1 text-xs font-bold text-muted">Audience</Text>
            <TextInput
              value={product.audience}
              onChangeText={(audience) => patch({ audience })}
              className={`mb-3 ${inputClass}`}
              placeholder="Students, Makers, Hobbyists"
            />
            <Text className="mb-1 text-xs font-bold text-muted">
              Difficulty
            </Text>
            <View className="mb-3">
              <CategoryDropdown
                value={product.difficulty || "Beginner"}
                options={[
                  "Beginner",
                  "Intermediate",
                  "Advanced",
                  "Professional",
                ]}
                onChange={(difficulty) => patch({ difficulty })}
                placeholder="Difficulty"
                title="Difficulty"
              />
            </View>
            <Text className="mb-1 text-xs font-bold text-muted">Warranty</Text>
            <TextInput
              value={product.warranty}
              onChangeText={(warranty) => patch({ warranty })}
              className={`mb-1 ${inputClass}`}
              placeholder="30 days for manufacturing defects"
            />
          </View>
        ) : null}

        <View className="mb-3 flex-row items-center gap-3">
          <Text className="text-sm font-semibold text-ink">
            Visible to customers
          </Text>
          <Switch
            value={product.active}
            onValueChange={(active) => patch({ active })}
            trackColor={{ true: "#1e3a8a", false: "#e2e8f0" }}
          />
        </View>

        <View className="flex-row gap-3">
          <Pressable
            onPress={onSave}
            disabled={saving}
            className={`rounded-full bg-gold px-5 py-2 ${saving ? "opacity-60" : ""}`}
          >
            <Text className="text-xs font-black text-ink">
              {saving
                ? "Saving…"
                : fromLink
                  ? "Save imported product"
                  : isNew
                    ? "Create product"
                    : "Save"}
            </Text>
          </Pressable>
          <Pressable
            onPress={onCancel}
            className="rounded-full border border-line px-5 py-2"
          >
            <Text className="text-xs font-black text-ink">Cancel</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

function ServicesTab({
  services,
  editing,
  onChange,
  onEdit,
  onNew,
  onSave,
  canDelete,
  onDelete,
  onToggleActive,
  saveSaving,
}: {
  services: AdminService[];
  editing: AdminService | null;
  onChange: (s: AdminService) => void;
  onEdit: (s: AdminService | null) => void;
  onNew: () => void;
  onSave: () => void;
  canDelete: boolean;
  onDelete: (id: string) => void;
  onToggleActive: (s: AdminService) => void;
  saveSaving: boolean;
}) {
  const [preview, setPreview] = useState<AdminService | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("All");
  const PAGE_SIZE = 8;
  const categories = [
    "All",
    ...Array.from(new Set(services.map((s) => s.category).filter(Boolean))),
  ];
  const needle = query.trim().toLowerCase();
  const filtered = services.filter(
    (s) =>
      (category === "All" || s.category === category) &&
      (!needle ||
        `${s.name} ${s.category} ${s.id} ${s.description}`
          .toLowerCase()
          .includes(needle)),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  React.useEffect(() => {
    setPage(1);
  }, [query, category]);

  if (editing) {
    return (
      <View className="flex-1">
        <ServiceEditor
          service={editing}
          onChange={onChange}
          onSave={onSave}
          onCancel={() => onEdit(null)}
          isNew={!services.some((s) => s.id === editing.id)}
          categoryOptions={categories.filter((c) => c !== "All")}
          saving={saveSaving}
        />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <FlatList
        data={shown}
        keyExtractor={(s) => s.id}
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListHeaderComponent={
          <View className="mb-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-display text-xl font-bold text-ink">
                Services ({services.length})
              </Text>
              <Pressable
                onPress={onNew}
                className="rounded-full bg-navy px-4 py-2"
              >
                <Text className="text-xs font-black text-white">
                  + New service
                </Text>
              </Pressable>
            </View>
            <View className="mt-3 flex-row flex-wrap items-center gap-2">
              <View className="flex-1">
                <CategoryDropdown
                  value={category}
                  options={categories}
                  onChange={setCategory}
                  placeholder="All categories"
                  title="Filter by category"
                />
              </View>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search name, category, id…"
                className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink"
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text className="py-8 text-center text-sm text-muted">
            No services found.
          </Text>
        }
        ListFooterComponent={
          totalPages > 1 ? (
            <AdminPager page={page} totalPages={totalPages} onPage={setPage} />
          ) : null
        }
        renderItem={({ item }) => (
          <View className="mb-3 rounded-xl border border-line bg-card p-4">
            <View className="flex-row items-center justify-between gap-2">
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-bold text-ink" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
                  {item.category}
                  {item.tag ? ` · ${item.tag}` : ""}
                </Text>
              </View>
              <Text className="shrink-0 text-xs font-black text-navy">
                {item.priceLabel}
              </Text>
            </View>
            <Text
              className="mt-1 text-xs leading-5 text-muted"
              numberOfLines={2}
            >
              {item.description}
            </Text>
            <View className="mt-2 flex-row flex-wrap items-center gap-2">
              <AdminAction
                onPress={() => onEdit(item)}
                label="Edit"
                tone="navy"
              />
              <AdminAction
                onPress={() => setPreview(item)}
                label="Preview"
                tone="plain"
              />
              <AdminAction
                onPress={() => onToggleActive(item)}
                label={item.active ? "Hide" : "Show"}
                tone="plain"
              />
              {canDelete && (
                <AdminAction
                  onPress={() => onDelete(item.id)}
                  label="Delete"
                  tone="red"
                />
              )}
              {!item.active && (
                <Text className="text-[10px] font-black uppercase text-red-500">
                  Inactive
                </Text>
              )}
            </View>
          </View>
        )}
      />
      {preview && (
        <CatalogPreviewModal
          typeLabel={preview.tag || preview.category || "Service"}
          title={preview.name}
          body={preview.description}
          priceLabel={preview.priceLabel}
          image=""
          active={preview.active}
          onClose={() => setPreview(null)}
        />
      )}
    </View>
  );
}

function ServiceEditor({
  service,
  onChange,
  onSave,
  onCancel,
  isNew,
  categoryOptions,
  saving,
}: {
  service: AdminService;
  onChange: (next: AdminService) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew: boolean;
  categoryOptions: string[];
  saving?: boolean;
}) {
  function patch(patchPart: Partial<AdminService>) {
    onChange({ ...service, ...patchPart });
  }

  const inputClass =
    "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink";

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="rounded-xl border border-line bg-card p-4">
        <Text className="mb-3 font-display text-lg font-bold text-ink">
          {isNew ? "Add a new service" : `Edit ${service.id}`}
        </Text>
        <Text className="mb-1 text-xs font-bold text-muted">Id (slug)</Text>
        <TextInput
          value={service.id}
          onChangeText={(id) =>
            patch({ id: id.trim().toLowerCase().replace(/\s+/g, "-") })
          }
          className={`mb-3 ${inputClass}`}
          placeholder="e.g. website-design"
          autoCapitalize="none"
        />
        <Text className="mb-1 text-xs font-bold text-muted">Name</Text>
        <TextInput
          value={service.name}
          onChangeText={(name) => patch({ name })}
          className={`mb-3 ${inputClass}`}
          placeholder="Service name"
        />
        <Text className="mb-1 text-xs font-bold text-muted">Category</Text>
        <View className="mb-3">
          <CategoryDropdown
            value={service.category || ""}
            options={categoryOptions}
            onChange={(category) => patch({ category })}
            placeholder="Select a category"
            title="Category"
            allowCustom
          />
        </View>
        <Text className="mb-1 text-xs font-bold text-muted">Price label</Text>
        <TextInput
          value={service.priceLabel}
          onChangeText={(priceLabel) => patch({ priceLabel })}
          className={`mb-3 ${inputClass}`}
          placeholder="from NPR 35,000"
        />
        <Text className="mb-1 text-xs font-bold text-muted">Tag / badge</Text>
        <TextInput
          value={service.tag}
          onChangeText={(tag) => patch({ tag })}
          className={`mb-3 ${inputClass}`}
          placeholder="Website, Fabrication, …"
        />
        <Text className="mb-1 text-xs font-bold text-muted">Sort order</Text>
        <TextInput
          value={String(service.sortOrder)}
          onChangeText={(sortOrder) =>
            patch({
              sortOrder: Math.max(0, Math.round(Number(sortOrder) || 0)),
            })
          }
          keyboardType="numeric"
          className={`mb-3 ${inputClass}`}
          placeholder="1000"
        />
        <Text className="mb-1 text-xs font-bold text-muted">Description</Text>
        <TextInput
          value={service.description}
          onChangeText={(description) => patch({ description })}
          multiline
          style={{ textAlignVertical: "top" }}
          className={`mb-3 min-h-20 ${inputClass}`}
          placeholder="Full description"
        />
        <View className="mb-3 flex-row items-center gap-3">
          <Text className="text-sm font-semibold text-ink">
            Active (visible on site + app)
          </Text>
          <Switch
            value={service.active}
            onValueChange={(active) => patch({ active })}
            trackColor={{ true: "#1e3a8a", false: "#e2e8f0" }}
          />
        </View>
        <View className="flex-row gap-3">
          <Pressable
            onPress={onSave}
            disabled={saving}
            className={`rounded-full bg-gold px-5 py-2 ${saving ? "opacity-60" : ""}`}
          >
            <Text className="text-xs font-black text-ink">
              {saving ? "Saving…" : isNew ? "Create service" : "Save"}
            </Text>
          </Pressable>
          <Pressable
            onPress={onCancel}
            className="rounded-full border border-line px-5 py-2"
          >
            <Text className="text-xs font-black text-ink">Cancel</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

// Expandable per-user robot-settings manager (admin view of robot_user_settings).
// Same rows the user edits in their Robot Preferences screen + the website Account
// page — the admin sees and manages them all so nothing stays untracked.
function UserRobotSettingsManager({
  userId,
  email,
  canDelete,
}: {
  userId: string;
  email: string;
  canDelete: boolean;
}) {
  const [rows, setRows] = useState<AdminRobotSetting[] | null>(null);
  const [robotId, setRobotId] = useState("");
  const [robotName, setRobotName] = useState("");
  const [values, setValues] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    void listUserRobotSettings(userId)
      .then(setRows)
      .catch(() => setRows([]));
  }, [userId]);
  useEffect(() => {
    load();
  }, [load]);

  // values: one "key=value" per line (scalars) — kept deliberately simple.
  function parseValues(
    src: string,
  ): Record<string, string | number | boolean | string[]> {
    const out: Record<string, string | number | boolean | string[]> = {};
    for (const line of src.split("\n")) {
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      const raw = line.slice(idx + 1).trim();
      if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(key) || !raw) continue;
      if (/^-?\d+(\.\d+)?$/.test(raw)) out[key] = Number(raw);
      else if (raw === "true" || raw === "false") out[key] = raw === "true";
      else out[key] = raw;
    }
    return out;
  }

  async function handleSave() {
    setErr("");
    const id = robotId
      .trim()
      .toLowerCase()
      .replace(/[^a-zA-Z0-9_.-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!id) {
      setErr("A robot id (or name) is required.");
      return;
    }
    setBusy(true);
    try {
      await upsertUserRobotSettings(
        userId,
        id,
        robotName.trim() || id,
        parseValues(values),
      );
      setRobotId("");
      setRobotName("");
      setValues("");
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(robotIdToDelete: string) {
    setBusy(true);
    try {
      await deleteUserRobotSetting(userId, robotIdToDelete);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete.");
    } finally {
      setBusy(false);
    }
  }

  if (rows === null)
    return (
      <Text className="py-2 text-xs text-muted">Loading robot settings…</Text>
    );
  return (
    <View className="mt-3 rounded-lg border border-line bg-surface p-3">
      <Text className="text-xs font-black uppercase tracking-widest text-navy">
        Robot preferences ({rows.length})
      </Text>
      <Text className="mt-0.5 text-[11px] leading-4 text-muted">
        Same rows the user edits in the app + website. Separate from
        orders/carts.
      </Text>
      {rows.length === 0 ? (
        <Text className="mt-2 text-xs text-muted">
          No robot profiles for this user.
        </Text>
      ) : (
        rows.map((r) => (
          <View
            key={r.robotId}
            className="mt-2 rounded border border-line bg-card p-2"
          >
            <View className="flex-row items-center justify-between gap-2">
              <Text
                className="min-w-0 flex-1 text-xs font-bold text-ink"
                numberOfLines={1}
              >
                {r.robotName || r.robotId}{" "}
                <Text className="font-normal text-muted">· {r.robotId}</Text>
              </Text>
              {canDelete && (
                <Pressable
                  onPress={() => void handleDelete(r.robotId)}
                  disabled={busy}
                  className="shrink-0 rounded border border-line px-2 py-0.5"
                >
                  <Text className="text-[10px] font-bold text-red-600">
                    Delete
                  </Text>
                </Pressable>
              )}
            </View>
            <Text className="mt-1 text-[11px] text-muted" numberOfLines={3}>
              {Object.entries(r.settings)
                .map(
                  ([k, v]) =>
                    `${k}=${Array.isArray(v) ? v.join("|") : String(v)}`,
                )
                .join(" · ") || "(empty)"}
            </Text>
          </View>
        ))
      )}
      <Text className="mt-3 text-xs font-bold text-ink">
        Add / update a robot profile for {email}
      </Text>
      <TextInput
        value={robotName}
        onChangeText={setRobotName}
        placeholder="Robot name (e.g. 2WD Car)"
        placeholderTextColor="#94a3b8"
        className="mt-1 rounded border border-line bg-card px-2 py-1.5 text-xs text-ink"
      />
      <TextInput
        value={values}
        onChangeText={setValues}
        placeholder={
          "One key=value per line, e.g.\nmaxSpeed=220\ntelemetryChannels=battery|us_distance"
        }
        placeholderTextColor="#94a3b8"
        multiline
        style={{ textAlignVertical: "top" }}
        className="mt-1 min-h-16 rounded border border-line bg-card px-2 py-1.5 text-xs text-ink"
      />
      <View className="mt-2 flex-row flex-wrap items-center gap-2">
        <Pressable
          onPress={() => void handleSave()}
          disabled={busy}
          className="rounded-full bg-navy px-4 py-1.5"
        >
          <Text className="text-[11px] font-black text-white">
            Save robot profile
          </Text>
        </Pressable>
        {err ? (
          <Text className="flex-1 text-[11px] text-red-600" numberOfLines={2}>
            {err}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// Project (car) profiles for one user — the same car_profiles rows the build
// screen writes and the website's admin Users panel manages. Read is staff+,
// write is admin+ (enforced by RLS and by the website API alike), so the
// controls hide for staff instead of failing on tap.
function UserProjectProfileManager({
  userId,
  email,
  canDelete,
}: {
  userId: string;
  email: string;
  canDelete: boolean;
}) {
  const [rows, setRows] = useState<AdminCarProfile[] | null>(null);
  const [profileKey, setProfileKey] = useState("");
  const [carName, setCarName] = useState("");
  // Settings are edited as JSON, exactly like the website's Users panel: the
  // real objects can be nested or contain arrays, and a key=value textarea
  // would silently flatten them on save.
  const [values, setValues] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    void listUserCarProfiles(userId)
      .then(setRows)
      .catch(() => setRows([]));
  }, [userId]);
  useEffect(() => {
    load();
  }, [load]);

  function resetDraft() {
    setProfileKey("");
    setCarName("");
    setValues("");
    setEditingKey(null);
  }

  /** Prefill the form with a row so an admin edits the real object, not a
   *  flattened one. The key stays fixed — it is the board's identity. */
  function startEdit(row: AdminCarProfile) {
    setEditingKey(row.profileKey);
    setProfileKey(row.profileKey);
    setCarName(row.carName);
    setValues(JSON.stringify(row.settings ?? {}, null, 2));
    setErr("");
  }

  async function handleSave() {
    setErr("");
    const key = profileKey.trim();
    if (!key) {
      setErr("A profile key is required (e.g. fw:1FB608).");
      return;
    }
    let settings: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(values.trim() || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setErr("Settings must be a JSON object.");
        return;
      }
      settings = parsed as Record<string, unknown>;
    } catch {
      setErr("Settings must be valid JSON.");
      return;
    }
    setBusy(true);
    try {
      await upsertAdminCarProfile(userId, key, carName.trim() || key, settings);
      resetDraft();
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the profile.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(key: string) {
    setBusy(true);
    try {
      await deleteAdminCarProfile(userId, key);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete the profile.");
    } finally {
      setBusy(false);
    }
  }

  if (rows === null)
    return (
      <Text className="py-2 text-xs text-muted">Loading project profiles…</Text>
    );

  return (
    <View className="mt-3 rounded-lg border border-line bg-surface p-3">
      <Text className="text-xs font-black uppercase tracking-widest text-navy">
        Project profiles ({rows.length})
      </Text>
      <Text className="mt-0.5 text-[11px] leading-4 text-muted">
        car_profiles rows — the board key is its stable identity. No Wi-Fi
        passwords are stored here.
      </Text>
      {rows.length === 0 ? (
        <Text className="mt-2 text-xs text-muted">
          No project profiles for this user.
        </Text>
      ) : (
        rows.map((row) => (
          <View
            key={row.id || row.profileKey}
            className="mt-2 rounded border border-line bg-card p-2"
          >
            <View className="flex-row items-center justify-between gap-2">
              <Text
                className="min-w-0 flex-1 text-xs font-bold text-ink"
                numberOfLines={1}
              >
                {row.carName || "Untitled profile"}{" "}
                <Text className="font-normal text-muted">
                  · {row.profileKey}
                </Text>
              </Text>
              {canDelete && (
                <View className="shrink-0 flex-row gap-1">
                  <Pressable
                    onPress={() => startEdit(row)}
                    disabled={busy}
                    className="rounded border border-line px-2 py-0.5"
                  >
                    <Text className="text-[10px] font-bold text-navy">
                      Edit
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void handleDelete(row.profileKey)}
                    disabled={busy}
                    className="rounded border border-line px-2 py-0.5"
                  >
                    <Text className="text-[10px] font-bold text-red-600">
                      Delete
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
            <Text className="mt-1 text-[11px] text-muted" numberOfLines={3}>
              {Object.entries(row.settings)
                .map(
                  ([k, v]) =>
                    `${k}=${Array.isArray(v) ? v.join("|") : String(v)}`,
                )
                .join(" · ") || "(empty)"}
            </Text>
          </View>
        ))
      )}
      {canDelete ? (
        <>
          <Text className="mt-3 text-xs font-bold text-ink">
            {editingKey
              ? `Editing ${editingKey} for ${email}`
              : `Add a project profile for ${email}`}
          </Text>
          <TextInput
            value={profileKey}
            onChangeText={setProfileKey}
            autoCapitalize="none"
            editable={!editingKey}
            placeholder="Profile key (e.g. fw:1FB608)"
            placeholderTextColor="#94a3b8"
            className={`mt-1 rounded border border-line px-2 py-1.5 text-xs ${
              editingKey ? "bg-mist text-muted" : "bg-card text-ink"
            }`}
          />
          <TextInput
            value={carName}
            onChangeText={setCarName}
            placeholder="Display name (e.g. 4WD Car)"
            placeholderTextColor="#94a3b8"
            className="mt-1 rounded border border-line bg-card px-2 py-1.5 text-xs text-ink"
          />
          <TextInput
            value={values}
            onChangeText={setValues}
            placeholder={'Settings JSON, e.g.\n{"mode_id":"4wd4m","speed":170}'}
            placeholderTextColor="#94a3b8"
            multiline
            style={{ textAlignVertical: "top" }}
            className="mt-1 min-h-16 rounded border border-line bg-card px-2 py-1.5 font-mono text-xs text-ink"
          />
          <View className="mt-2 flex-row flex-wrap items-center gap-2">
            <Pressable
              onPress={() => void handleSave()}
              disabled={busy}
              className="rounded-full bg-navy px-4 py-1.5"
            >
              <Text className="text-[11px] font-black text-white">
                {editingKey ? "Save changes" : "Save project profile"}
              </Text>
            </Pressable>
            {editingKey ? (
              <Pressable
                onPress={resetDraft}
                disabled={busy}
                className="rounded-full border border-line px-4 py-1.5"
              >
                <Text className="text-[11px] font-black text-ink">Cancel</Text>
              </Pressable>
            ) : null}
            {err ? (
              <Text
                className="flex-1 text-[11px] text-red-600"
                numberOfLines={2}
              >
                {err}
              </Text>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

// One user row in the admin Users tab: identity, role + tier badges, the
// role/tier toggle buttons (admin+), an owner-only delete button, and the
// expandable robot-preferences manager.
function UsersSection({
  users,
  total,
  page,
  totalPages,
  query,
  onQueryChange,
  onApply,
  onPage,
  canDelete,
  isOwner,
  onToggleRole,
  onToggleTier,
  onDeleteUser,
  currentUserId,
}: {
  users: AdminUser[];
  total: number;
  page: number;
  totalPages: number;
  query: string;
  onQueryChange: (q: string) => void;
  onApply: () => void;
  onPage: (p: number) => void;
  canDelete: boolean;
  isOwner: boolean;
  onToggleRole: (u: AdminUser) => void;
  onToggleTier: (u: AdminUser) => void;
  onDeleteUser: (u: AdminUser) => void;
  currentUserId: string;
}) {
  // Section state
  const [showUserDir, setShowUserDir] = useState(true);
  const [showCarProfiles, setShowCarProfiles] = useState(true);
  const [showRobotProfiles, setShowRobotProfiles] = useState(true);
  const [userDirSearch, setUserDirSearch] = useState("");
  const [carSearch, setCarSearch] = useState("");
  const [robotSearch, setRobotSearch] = useState("");

  // Filter users into categories
  const filteredUsers = users.filter((user) => {
    const matchesQuery =
      !userDirSearch ||
      user.name.toLowerCase().includes(userDirSearch.toLowerCase()) ||
      user.email.toLowerCase().includes(userDirSearch.toLowerCase());
    return matchesQuery;
  });

  // Render user directory section header
  const renderUserDirHeader = () => (
    <View className="mb-3">
      <Text className="font-display text-sm font-bold text-muted uppercase tracking-wide">
        User Directory ({filteredUsers.length})
      </Text>
      <View className="mt-2 flex-row gap-2">
        <TextInput
          value={userDirSearch}
          onChangeText={setUserDirSearch}
          onSubmitEditing={onApply}
          returnKeyType="search"
          placeholder="Search users..."
          className="flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink"
        />
        <Pressable onPress={onApply} className="rounded-lg bg-navy px-4 py-2">
          <Text className="text-xs font-black text-white">Apply</Text>
        </Pressable>
      </View>
    </View>
  );

  // Render car profile card
  const renderCarProfile = (carProfile: any) => (
    <View
      key={carProfile.profile_key || carProfile.unique_id}
      className="mb-3 rounded-xl border border-line bg-card p-4"
    >
      <Text className="font-display text-sm font-bold text-ink">
        {carProfile.car_name || "Unnamed Car"}
      </Text>
      <View className="mt-2 grid grid-cols-2 gap-2">
        <View>
          <Text className="text-xs text-muted">profile_key</Text>
          <Text className="mt-0.5 text-sm font-mono text-ink">
            {carProfile.profile_key || "—"}
          </Text>
        </View>
        <View>
          <Text className="text-xs text-muted">unique_id</Text>
          <Text className="mt-0.5 text-sm text-ink">
            {carProfile.unique_id || "—"}
          </Text>
        </View>
      </View>
      <View className="mt-2 grid grid-cols-2 gap-2">
        <View>
          <Text className="text-xs text-muted">firmware</Text>
          <Text className="mt-0.5 text-sm">
            {carProfile.settings?.firmware || "—"}
          </Text>
        </View>
        <View>
          <Text className="text-xs text-muted">last_seen</Text>
          <Text className="mt-0.5 text-sm">
            {carProfile.settings?.last_seen || "—"}
          </Text>
        </View>
      </View>
      <View className="mt-3 flex-row justify-end gap-1">
        <Pressable
          onPress={() => setCarEditing(!carEditing)}
          className="rounded-full border border-line px-2 py-1 text-xs font-bold text-navy"
        >
          Edit
        </Pressable>
      </View>
    </View>
  );

  // Render edit form for car profile
  const [editCar, setEditCar] = useState<{
    profile_key: string;
    car_name: string;
    settings: any;
  } | null>(null);
  const [carEditing, setCarEditing] = useState(false);

  const saveCarProfile = async (
    profileKey: string,
    carName: string,
    settings: any,
  ) => {
    try {
      await upsertAdminCarProfile(currentUserId, profileKey, carName, settings);
      setCarEditing(false);
      setEditCar(null);
      onApply();
    } catch (e) {
      logger.error("admin", "Car profile save error:", e);
      Alert.alert(
        "Save failed",
        e instanceof Error ? e.message : "Could not save car profile.",
      );
    }
  };

  const cancelCarProfile = () => {
    setEditCar(null);
    setCarEditing(false);
  };

  // Render robot profile card
  const renderRobotProfile = (robotSettings: any) => (
    <View
      key={robotSettings.unique_id || robotSettings.robot_code}
      className="mb-3 rounded-xl border border-line bg-card p-4"
    >
      <Text className="font-display text-sm font-bold text-ink">
        Robot {robotSettings?.robot_code || robotSettings.robot_code || "—"}
      </Text>
      <View className="mt-2 grid grid-cols-2 gap-2">
        <View>
          <Text className="text-xs text-muted">robot_code</Text>
          <Text className="mt-0.5 text-sm font-mono text-ink">
            {robotSettings.robot_code || "—"}
          </Text>
        </View>
        <View>
          <Text className="text-xs text-muted">telemetry_channel</Text>
          <Text className="mt-0.5 text-sm">
            {robotSettings.telemetry_channel || "—"}
          </Text>
        </View>
      </View>
      <View className="mt-2 grid grid-cols-2 gap-2">
        <View>
          <Text className="text-xs text-muted">parameters</Text>
          <Text className="mt-0.5 text-sm">
            {JSON.stringify(robotSettings.parameters || {})}
          </Text>
        </View>
        <View>
          <Text className="text-xs text-muted">profile_key</Text>
          <Text className="mt-0.5 text-sm font-mono text-ink">
            {robotSettings.profile_key || "—"}
          </Text>
        </View>
      </View>
      <View className="mt-3 flex-row justify-end gap-1">
        <Pressable
          onPress={() => setRobotEditing(!robotEditing)}
          className="rounded-full border border-line px-2 py-1 text-xs font-bold text-navy"
        >
          Edit
        </Pressable>
      </View>
    </View>
  );

  // Render edit form for robot profile
  const [editRobot, setEditRobot] = useState<{
    robot_code: string;
    telemetry_channel: string;
    parameters: any;
    profile_key: string;
  } | null>(null);
  const [robotEditing, setRobotEditing] = useState(false);

  const saveRobotProfile = async (
    robotCode: string,
    telemetryChannel: string,
    parameters: any,
    profileKey: string,
  ) => {
    try {
      await upsertUserRobotSettings(
        currentUserId,
        robotCode,
        telemetryChannel,
        parameters,
      );
      setRobotEditing(false);
      setEditRobot(null);
      onApply();
    } catch (e) {
      logger.error("admin", "Robot profile save error:", e);
      Alert.alert(
        "Save failed",
        e instanceof Error ? e.message : "Could not save robot profile.",
      );
    }
  };

  const cancelRobotProfile = () => {
    setEditRobot(null);
    setRobotEditing(false);
  };

  return (
    <View className="flex-1">
      <FlatList
        data={filteredUsers}
        keyExtractor={(u) => u.id}
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListHeaderComponent={
          <View className="mb-3">
            <Text className="font-display text-xl font-bold text-ink">
              Users ({total})
            </Text>
            <View className="mb-3 flex-row gap-2">{renderUserDirHeader()}</View>
          </View>
        }
        ListEmptyComponent={
          <Text className="py-8 text-center text-sm text-muted">
            No users found.
          </Text>
        }
        ListFooterComponent={
          totalPages > 1 ? (
            <AdminPager page={page} totalPages={totalPages} onPage={onPage} />
          ) : null
        }
        renderItem={({ item }) => (
          <View className="mb-3 rounded-xl border border-line bg-card p-4">
            <Text className="font-display text-sm font-bold text-ink">
              {item.name || "—"}
            </Text>
            <Text className="font-normal text-muted">· {item.email}</Text>
            {item.phone ? (
              <Text className="mt-0.5 text-xs text-muted">{item.phone}</Text>
            ) : null}
            {item.address ? (
              <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
                {item.address}
              </Text>
            ) : null}
            {item.createdAt ? (
              <Text className="mt-0.5 text-xs text-muted">
                Joined {new Date(item.createdAt).toLocaleDateString()}
                {item.lastSeenAt
                  ? " · Last seen " +
                    new Date(item.lastSeenAt).toLocaleDateString()
                  : ""}
              </Text>
            ) : null}
            <View className="mt-1 flex-row gap-1">
              <Text
                className={`rounded px-2 py-0.5 text-[10px] font-black uppercase ${
                  item.role === "owner"
                    ? "bg-ink text-white"
                    : item.role === "admin"
                      ? "bg-amber-100 text-amber-700"
                      : item.role === "staff"
                        ? "bg-navy text-white"
                        : "bg-sky text-navy"
                }`}
              >
                {item.role}
              </Text>
              <Text
                className={`rounded px-2 py-0.5 text-[10px] font-black uppercase ${
                  item.tier === "pro"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-mist text-muted"
                }`}
              >
                {item.tier}
              </Text>
            </View>
          </View>
        )}
      />
      {showUserDir && <View className="mt-3">{renderUserDirHeader()}</View>}
      {showCarProfiles && (
        <View className="mt-3">
          <Text className="font-display text-sm font-bold text-muted uppercase tracking-wide">
            Car Profiles ({filteredUsers.length})
          </Text>
          {filteredUsers.length > 0 && (
            <FlatList
              data={filteredUsers.flatMap((u) => u.car_profiles || [])}
              keyExtractor={(c) => c.profile_key || c.unique_id}
              contentContainerStyle={{ padding: 8 }}
              renderItem={({ item }) => (
                <View className="mb-3 rounded-xl border border-line bg-card p-4">
                  <View className="flex-row justify-between">
                    <Text className="font-display text-sm font-bold text-ink">
                      {item.car_name || "Unnamed Car"}
                    </Text>
                    <Pressable
                      onPress={() => {
                        setEditCar(item);
                        setCarEditing(true);
                      }}
                      className="rounded-full border border-line px-2 py-1 text-xs font-bold text-navy"
                    >
                      Edit
                    </Pressable>
                  </View>
                  <View className="mt-2 flex-row gap-4 text-xs">
                    <View>
                      <Text className="text-muted">profile_key</Text>
                      <Text className="font-mono">
                        {item.profile_key || "—"}
                      </Text>
                    </View>
                    <View>
                      <Text className="text-muted">unique_id</Text>
                      <Text className="font-mono">{item.unique_id || "—"}</Text>
                    </View>
                  </View>
                  {canDelete && (
                    <Pressable
                      onPress={async () => {
                        Alert.alert(
                          "Delete car profile",
                          "Remove this car profile? This cannot be undone.",
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Delete",
                              style: "destructive",
                              onPress: async () => {
                                try {
                                  await deleteAdminCarProfile(
                                    currentUserId,
                                    item.profile_key,
                                  );
                                  onApply();
                                } catch (e) {
                                  logger.error(
                                    "admin",
                                    "Car profile delete error:",
                                    e,
                                  );
                                  Alert.alert(
                                    "Could not delete",
                                    e instanceof Error
                                      ? e.message
                                      : "Please try again.",
                                  );
                                }
                              },
                            },
                          ],
                        );
                      }}
                      className="mt-2 rounded-lg border border-red-500/30 px-3 py-1 text-xs font-bold text-red-600"
                    >
                      Delete
                    </Pressable>
                  )}
                </View>
              )}
              horizontal={false}
            />
          )}
          {editCar && (
            <View className="mt-3 rounded-xl border border-line bg-card p-4">
              <Text className="font-display text-xs font-bold uppercase tracking-wide text-muted">
                Edit Car Profile
              </Text>
              <View className="mt-2 grid grid-cols-2 gap-2">
                <TextInput
                  value={editCar.car_name || ""}
                  onChangeText={(text) =>
                    setEditCar({ ...editCar, car_name: text })
                  }
                  placeholder="Car name"
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                />
                <TextInput
                  value={JSON.stringify(editCar.settings || {})}
                  onChangeText={(text) => {
                    try {
                      const parsed = JSON.parse(text);
                      setEditCar({ ...editCar, settings: parsed });
                    } catch {
                      // keep current if invalid JSON
                    }
                  }}
                  multiline
                  numberOfLines={3}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                />
              </View>
              <View className="mt-3 flex-row justify-end gap-1">
                <Pressable
                  onPress={() =>
                    saveCarProfile(
                      editCar.profile_key,
                      editCar.car_name,
                      editCar.settings,
                    )
                  }
                  disabled={carEditing}
                  className="rounded-lg bg-emerald-600 px-4 py-2"
                >
                  <Text className="text-xs font-black text-white">Save</Text>
                </Pressable>
                <Pressable
                  onPress={cancelCarProfile}
                  className="rounded-lg border border-line px-4 py-2"
                >
                  <Text className="text-xs font-black text-navy">Cancel</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}
      {showRobotProfiles && (
        <View className="mt-3">
          <Text className="font-display text-sm font-bold text-muted uppercase tracking-wide">
            Robot Profiles ({filteredUsers.length})
          </Text>
          {filteredUsers.length > 0 && (
            <FlatList
              data={filteredUsers.flatMap((u) => u.robot_user_settings || [])}
              keyExtractor={(r) => r.robot_code || r.profile_key}
              contentContainerStyle={{ padding: 8 }}
              renderItem={({ item }) => (
                <View className="mb-3 rounded-xl border border-line bg-card p-4">
                  <View className="flex-row justify-between">
                    <Text className="font-display text-sm font-bold text-ink">
                      Robot {item.robot_code || "—"}
                    </Text>
                    <Pressable
                      onPress={() => {
                        setEditRobot(item);
                        setRobotEditing(true);
                      }}
                      className="rounded-full border border-line px-2 py-1 text-xs font-bold text-navy"
                    >
                      Edit
                    </Pressable>
                  </View>
                  <View className="mt-2 flex-row gap-4 text-xs">
                    <View>
                      <Text className="text-muted">robot_code</Text>
                      <Text className="font-mono">
                        {item.robot_code || "—"}
                      </Text>
                    </View>
                    <View>
                      <Text className="text-muted">telemetry_channel</Text>
                      <Text className="font-mono">
                        {item.telemetry_channel || "—"}
                      </Text>
                    </View>
                  </View>
                  {canDelete && (
                    <Pressable
                      onPress={async () => {
                        Alert.alert(
                          "Delete robot profile",
                          "Remove this robot profile? This cannot be undone.",
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Delete",
                              style: "destructive",
                              onPress: async () => {
                                try {
                                  await deleteUserRobotSetting(
                                    currentUserId,
                                    item.robot_code,
                                  );
                                  onApply();
                                } catch (e) {
                                  logger.error(
                                    "admin",
                                    "Robot profile delete error:",
                                    e,
                                  );
                                  Alert.alert(
                                    "Could not delete",
                                    e instanceof Error
                                      ? e.message
                                      : "Please try again.",
                                  );
                                }
                              },
                            },
                          ],
                        );
                      }}
                      className="mt-2 rounded-lg border border-red-500/30 px-3 py-1 text-xs font-bold text-red-600"
                    >
                      Delete
                    </Pressable>
                  )}
                </View>
              )}
              horizontal={false}
            />
          )}
          {editRobot && (
            <View className="mt-3 rounded-xl border border-line bg-card p-4">
              <Text className="font-display text-xs font-bold uppercase tracking-wide text-muted">
                Edit Robot Profile
              </Text>
              <View className="mt-2 grid grid-cols-2 gap-2">
                <TextInput
                  value={editRobot.robot_code || ""}
                  onChangeText={(text) =>
                    setEditRobot({ ...editRobot, robot_code: text })
                  }
                  placeholder="Robot code"
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                />
                <TextInput
                  value={editRobot.telemetry_channel || ""}
                  onChangeText={(text) =>
                    setEditRobot({ ...editRobot, telemetry_channel: text })
                  }
                  placeholder="Telemetry channel"
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                />
                <TextInput
                  value={JSON.stringify(editRobot.parameters || {})}
                  onChangeText={(text) => {
                    try {
                      const parsed = JSON.parse(text);
                      setEditRobot({ ...editRobot, parameters: parsed });
                    } catch {
                      // keep current if invalid JSON
                    }
                  }}
                  multiline
                  numberOfLines={3}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                />
              </View>
              <View className="mt-3 flex-row justify-end gap-1">
                <Pressable
                  onPress={() =>
                    saveRobotProfile(
                      editRobot.robot_code,
                      editRobot.telemetry_channel,
                      editRobot.parameters,
                      editRobot.profile_key,
                    )
                  }
                  disabled={robotEditing}
                  className="rounded-lg bg-emerald-600 px-4 py-2"
                >
                  <Text className="text-xs font-black text-white">Save</Text>
                </Pressable>
                <Pressable
                  onPress={cancelRobotProfile}
                  className="rounded-lg border border-line px-4 py-2"
                >
                  <Text className="text-xs font-black text-navy">Cancel</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function ContentTab({
  siteContent,
  contentTitle,
  contentBody,
  onTitleChange,
  onBodyChange,
  onSave,
  saved,
  saving,
  trainingPrograms,
  setTrainingPrograms,
  onSaveProgram,
  onDeleteProgram,
  pilotCostLines,
  setPilotCostLines,
  onSavePilotLine,
  onDeletePilotLine,
  curriculumHighlights,
  setCurriculumHighlights,
  onSaveCurriculum,
  onDeleteCurriculum,
  canDelete,
}: {
  siteContent: { id: number; home_title: string; home_body: string } | null;
  contentTitle: string;
  contentBody: string;
  onTitleChange: (t: string) => void;
  onBodyChange: (b: string) => void;
  onSave: () => void;
  saved: boolean;
  saving: boolean;
  trainingPrograms: AdminTrainingProgram[];
  setTrainingPrograms: (p: AdminTrainingProgram[]) => void;
  onSaveProgram: (p: AdminTrainingProgram, isNew: boolean) => void;
  onDeleteProgram: (id: string) => void;
  pilotCostLines: AdminPilotCostLine[];
  setPilotCostLines: (p: AdminPilotCostLine[]) => void;
  onSavePilotLine: (p: AdminPilotCostLine, isNew: boolean) => void;
  onDeletePilotLine: (id: string) => void;
  curriculumHighlights: AdminCurriculumHighlight[];
  setCurriculumHighlights: (c: AdminCurriculumHighlight[]) => void;
  onSaveCurriculum: (c: AdminCurriculumHighlight, isNew: boolean) => void;
  onDeleteCurriculum: (id: string) => void;
  canDelete: boolean;
}) {
  const inputClass =
    "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink";
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <Text className="text-base font-bold text-ink">Home page content</Text>
      <Text className="mt-1 text-xs leading-5 text-muted">
        Edit the hero title and body shown on the app home screen and the
        website homepage.
      </Text>
      <View className="mt-4 rounded-xl border border-line bg-card p-4">
        <Text className="text-xs font-bold uppercase tracking-wide text-muted">
          Hero title
        </Text>
        <TextInput
          value={contentTitle}
          onChangeText={onTitleChange}
          placeholder="Technology you can touch, test, and trust."
          placeholderTextColor="#94a3b8"
          className="mt-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
        />
      </View>
      <View className="mt-3 rounded-xl border border-line bg-card p-4">
        <Text className="text-xs font-bold uppercase tracking-wide text-muted">
          Hero body
        </Text>
        <TextInput
          value={contentBody}
          onChangeText={onBodyChange}
          placeholder="Robotics kits, project solutions, fabrication, open tools, and training…"
          placeholderTextColor="#94a3b8"
          multiline
          style={{ textAlignVertical: "top" }}
          className="mt-1 min-h-24 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
        />
      </View>
      <Pressable
        onPress={onSave}
        disabled={saving}
        className={`mt-4 items-center rounded-full bg-navy py-3 ${saving ? "opacity-60" : ""}`}
      >
        <Text className="text-sm font-black text-white">
          {saving ? "Saving…" : "Save changes"}
        </Text>
      </Pressable>
      {saved && (
        <Text className="mt-3 text-center text-sm font-semibold text-emerald-700">
          Saved.
        </Text>
      )}
      {!siteContent && (
        <Text className="mt-3 text-center text-sm text-muted">
          Content not loaded.
        </Text>
      )}
      <View className="mt-5">
        <TrainingProgramsManager
          programs={trainingPrograms}
          setPrograms={setTrainingPrograms}
          onSave={onSaveProgram}
          canDelete={canDelete}
          onDelete={onDeleteProgram}
          inputClass={inputClass}
          onEditingChange={() => {}}
        />
        <PilotCostManager
          lines={pilotCostLines}
          setLines={setPilotCostLines}
          onSave={onSavePilotLine}
          canDelete={canDelete}
          onDelete={onDeletePilotLine}
          inputClass={inputClass}
          onEditingChange={() => {}}
        />
        <CurriculumManager
          highlights={curriculumHighlights}
          setHighlights={setCurriculumHighlights}
          onSave={onSaveCurriculum}
          canDelete={canDelete}
          onDelete={onDeleteCurriculum}
          inputClass={inputClass}
          onEditingChange={() => {}}
        />
      </View>
    </ScrollView>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function formatNPR(amount: number): string {
  return `NPR ${amount.toLocaleString("en-IN")}`;
}

function JournalTab({
  journals,
  editorOpen,
  editId,
  tag,
  title,
  text,
  sort,
  active,
  onNew,
  onEdit,
  onTogglePublish,
  canDelete,
  onDelete,
  onEditIdChange,
  onTagChange,
  onTitleChange,
  onTextChange,
  onSortChange,
  onActiveChange,
  onSave,
  onCancel,
  saving,
}: {
  journals: AdminJournalPost[];
  editorOpen: boolean;
  editId: string;
  tag: string;
  title: string;
  text: string;
  sort: string;
  active: boolean;
  onNew: () => void;
  onEdit: (post: AdminJournalPost) => void;
  onTogglePublish: (post: AdminJournalPost) => void;
  canDelete: boolean;
  onDelete: (id: string) => void;
  onEditIdChange: (v: string) => void;
  onTagChange: (v: string) => void;
  onTitleChange: (v: string) => void;
  onTextChange: (v: string) => void;
  onSortChange: (v: string) => void;
  onActiveChange: (v: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [preview, setPreview] = useState<AdminJournalPost | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  React.useEffect(() => {
    // Editing a post should land you at the data fields, not leave the list in view.
    if (editorOpen) scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [editorOpen]);
  return (
    <>
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >
        <View className="mb-4 flex-row items-center justify-between">
          <View>
            <Text className="text-base font-bold text-ink">
              Journal posts ({journals.length})
            </Text>
            <Text className="mt-0.5 text-xs text-muted">
              Edits publish to the website and the app immediately.
            </Text>
          </View>
          {!editorOpen && (
            <Pressable
              onPress={onNew}
              className="rounded-full bg-navy px-4 py-2"
            >
              <Text className="text-xs font-black text-white">+ New post</Text>
            </Pressable>
          )}
        </View>

        {editorOpen && (
          <View className="mb-4 rounded-xl border border-line bg-card p-4">
            <Text className="mb-3 text-sm font-bold text-ink">
              {editId ? `Edit ${editId}` : "Add a new journal post"}
            </Text>
            <Text className="mb-1 text-xs font-bold text-muted">
              Id (slug, auto-generated from title if blank)
            </Text>
            <TextInput
              value={editId}
              onChangeText={onEditIdChange}
              className="mb-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              placeholder="e.g. esp32-beginner-project"
            />
            <Text className="mb-1 text-xs font-bold text-muted">
              Tag / category
            </Text>
            <TextInput
              value={tag}
              onChangeText={onTagChange}
              className="mb-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              placeholder="Tutorial · Robotics"
            />
            <Text className="mb-1 text-xs font-bold text-muted">Title</Text>
            <TextInput
              value={title}
              onChangeText={onTitleChange}
              className="mb-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              placeholder="Post title"
            />
            <Text className="mb-1 text-xs font-bold text-muted">
              Excerpt / summary
            </Text>
            <TextInput
              value={text}
              onChangeText={onTextChange}
              multiline
              style={{ textAlignVertical: "top" }}
              className="mb-3 min-h-24 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              placeholder="One or two sentences shown on the journal page."
            />
            <View className="mb-3 flex-row items-center gap-3">
              <Text className="text-sm font-semibold text-ink">
                Published (visible on site + app)
              </Text>
              <Switch
                value={active}
                onValueChange={onActiveChange}
                trackColor={{ true: "#1e3a8a", false: "#e2e8f0" }}
              />
            </View>
            <TextInput
              value={sort}
              onChangeText={onSortChange}
              keyboardType="numeric"
              className="mb-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              placeholder="Sort order"
            />
            <View className="flex-row gap-3">
              <Pressable
                onPress={onSave}
                disabled={saving}
                className={`rounded-full bg-gold px-5 py-2 ${saving ? "opacity-60" : ""}`}
              >
                <Text className="text-xs font-black text-ink">
                  {saving ? "Saving…" : "Save"}
                </Text>
              </Pressable>
              <Pressable
                onPress={onCancel}
                className="rounded-full border border-line px-5 py-2"
              >
                <Text className="text-xs font-black text-ink">Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}

        {journals.length === 0 ? (
          <Text className="py-8 text-center text-sm text-muted">
            No journal posts yet.
          </Text>
        ) : (
          journals.map((item) => (
            <View
              key={item.id}
              className="mb-3 rounded-xl border border-line bg-card p-4"
            >
              <View className="flex-row items-center justify-between">
                <View className="min-w-0 flex-1 pr-2">
                  <Text className="text-sm font-bold text-ink">
                    {item.title}
                  </Text>
                  <Text className="mt-0.5 text-xs text-muted" numberOfLines={2}>
                    {item.tag} · {item.text}
                  </Text>
                </View>
                <Text
                  className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-black uppercase ${item.active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}
                >
                  {item.active ? "Published" : "Hidden"}
                </Text>
              </View>
              <View className="mt-2 flex-row flex-wrap gap-2">
                <AdminAction
                  onPress={() => onEdit(item)}
                  label="Edit"
                  tone="navy"
                />
                <AdminAction
                  onPress={() => setPreview(item)}
                  label="Preview"
                  tone="plain"
                />
                <AdminAction
                  onPress={() => onTogglePublish(item)}
                  label={item.active ? "Unpublish" : "Publish"}
                  tone="plain"
                />
                {canDelete && (
                  <AdminAction
                    onPress={() => onDelete(item.id)}
                    label="Delete"
                    tone="red"
                  />
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>
      {preview && (
        <CatalogPreviewModal
          typeLabel={preview.tag || "Journal"}
          title={preview.title}
          body={preview.text}
          priceLabel=""
          image=""
          active={preview.active}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}

function FinanceTab({ stats }: { stats: DashboardStats | null }) {
  if (!stats) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  const pending = stats.pendingOrders;
  const paid = stats.paidOrders;
  const fulfilled = stats.fulfilledOrders;
  const cancelled = stats.cancelledOrders;

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      {/* Revenue cards */}
      <View className="mb-4 flex-row flex-wrap gap-3">
        <StatCard label="Total Revenue" value={formatNPR(stats.revenue)} />
        <StatCard label="Revenue Today" value={formatNPR(stats.revenueToday)} />
        <StatCard
          label="Transactions"
          value={`${stats.succeededTransactions}`}
          sub={`${stats.totalTransactions} total (${stats.totalTransactions - stats.succeededTransactions} pending/failed)`}
        />
      </View>

      {/* Order status breakdown */}
      {stats.totalOrders > 0 && (
        <View className="rounded-xl border border-line bg-card p-4">
          <Text className="text-sm font-bold text-ink">
            Order Status Breakdown
          </Text>
          <View className="mt-3 flex-row flex-wrap gap-3">
            {(
              [
                { label: "Pending", count: pending, color: "text-amber-600" },
                { label: "Paid", count: paid, color: "text-navy" },
                {
                  label: "Fulfilled",
                  count: fulfilled,
                  color: "text-emerald-600",
                },
                { label: "Cancelled", count: cancelled, color: "text-red-500" },
              ] as const
            ).map((s) => (
              <View
                key={s.label}
                className="min-w-[45%] rounded-lg border border-line p-3"
              >
                <Text className="text-xs font-black uppercase tracking-widest text-muted">
                  {s.label}
                </Text>
                <Text
                  className={`mt-1 font-display text-xl font-bold ${s.color}`}
                >
                  {s.count}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function ActivityTab({
  activities,
  page,
  totalPages,
  total,
  onLoadMore,
}: {
  activities: ActivityEntry[];
  page: number;
  totalPages: number;
  total: number;
  onLoadMore: (page: number) => void;
}) {
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      {activities.length === 0 ? (
        // U-42: compact empty state — py-8, no tall dead space inside the pager page.
        <View className="items-center py-8">
          <Feather name="clock" size={32} color="#cbd5e1" />
          <Text className="mt-3 text-sm text-muted">
            No activity recorded yet.
          </Text>
        </View>
      ) : (
        <>
          {activities.map((entry) => {
            const dotColor = entry.action.includes("deleted")
              ? "bg-red-500"
              : entry.action.includes("saved")
                ? "bg-emerald-500"
                : entry.action.includes("status")
                  ? "bg-amber-500"
                  : "bg-navy";
            return (
              <View
                key={entry.id}
                className="mb-2 flex-row items-start gap-3 rounded-xl border border-line bg-card px-4 py-3"
              >
                <View
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${dotColor}`}
                />
                <View className="min-w-0 flex-1">
                  <Text className="text-sm">
                    <Text className="font-bold text-ink">{entry.action}</Text>{" "}
                    <Text className="text-muted">
                      {entry.entityType}
                      {entry.entityId ? ` / ${entry.entityId}` : ""}
                    </Text>
                  </Text>
                  {Object.keys(entry.details).length > 0 && (
                    <Text className="mt-0.5 text-xs text-muted">
                      {JSON.stringify(entry.details)}
                    </Text>
                  )}
                </View>
                <Text className="shrink-0 text-xs text-muted">
                  {new Date(entry.createdAt).toLocaleDateString()}
                </Text>
              </View>
            );
          })}

          {/* U-43: numbered pager for fast navigation */}
          <PagePager
            page={page}
            totalPages={totalPages}
            onPage={onLoadMore}
            label="event"
            totalItems={total}
          />
        </>
      )}
    </ScrollView>
  );
}

// U-R3 (2026-10-12): the "System Logs" tab — two newest-first lists read from
// the shared research DB: the fleet crash/restart reports (device_crash_reports,
// one row per connection session) and the app log lines (app_logs, the flushed
// ring buffer of logger + appLogService). A restart fault now surfaces here no
// matter which transport linked the car, and any device error is a row, not a
// console nobody was watching.
// U-R5 (2026-11-09): reorganized into two tabs: Logs and Profile.
// — Logs: System Logs + App Logs (includes link/wifi diagnostics)
// — Profile: User profiles + project entries
// Each tab uses edit-button pattern: content is read-only by default;
// tap "Edit" to make fields editable, tap again or "Done" to lock.
const LOG_SECTIONS = [
  { id: "logs", label: "Logs" },
  { id: "profile", label: "Profile" },
] as const;

type LogSection = (typeof LOG_SECTIONS)[number]["id"];

function LogsTab({
  crashes,
  crashPage,
  crashTotal,
  crashTotalPages,
  onLoadCrashes,
  onDeleteCrash,
  appLogs,
  logPage,
  logTotal,
  logTotalPages,
  onLoadLogs,
  onDeleteLog,
  userLogs,
  userLogPage,
  userLogTotal,
  userLogTotalPages,
  onLoadUserLogs,
  onDeleteUserLog,
  profileEntries,
  profileEntryTypes,
  profileEntryPage,
  profileEntryTotal,
  profileEntryTotalPages,
  onLoadProfileEntries,
  onDeleteProfileEntry,
  canDelete,
}: {
  crashes: AdminCrashReport[];
  crashPage: number;
  crashTotal: number;
  crashTotalPages: number;
  onLoadCrashes: (page: number) => void;
  onDeleteCrash: (row: AdminCrashReport) => void;
  appLogs: AdminAppLog[];
  logPage: number;
  logTotal: number;
  logTotalPages: number;
  onLoadLogs: (page: number) => void;
  onDeleteLog: (row: AdminAppLog) => void;
  userLogs: AdminUserLog[];
  userLogPage: number;
  userLogTotal: number;
  userLogTotalPages: number;
  onLoadUserLogs: (page: number) => void;
  onDeleteUserLog: (row: AdminUserLog) => void;
  profileEntries: AdminProfileEntry[];
  profileEntryTypes: AdminProfileEntryType[];
  profileEntryPage: number;
  profileEntryTotal: number;
  profileEntryTotalPages: number;
  onLoadProfileEntries: (page: number) => void;
  onDeleteProfileEntry: (row: AdminProfileEntry) => void;
  canDelete: boolean;
}) {
  const [section, setSection] = useState<LogSection>("logs");
  return (
    <View className="flex-1">
      <View className="flex-row flex-wrap gap-2 px-4 pb-1 pt-3">
        {LOG_SECTIONS.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => setSection(item.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: section === item.id }}
            className={`rounded-full border px-3.5 py-1.5 ${
              section === item.id
                ? "border-navy bg-navy"
                : "border-line bg-card"
            }`}
          >
            <Text
              className={`text-[11px] font-black ${
                section === item.id ? "text-white" : "text-navy"
              }`}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {section === "logs" && (
        <SystemLogsTab
          crashes={crashes}
          crashPage={crashPage}
          crashTotal={crashTotal}
          crashTotalPages={crashTotalPages}
          onLoadCrashes={onLoadCrashes}
          onDeleteCrash={onDeleteCrash}
          logs={appLogs}
          logPage={logPage}
          logTotal={logTotal}
          logTotalPages={logTotalPages}
          onLoadLogs={onLoadLogs}
          onDeleteLog={onDeleteLog}
          canDelete={canDelete}
        />
      )}
    </View>
  );
}

function SystemLogsTab({
  crashes,
  crashPage,
  crashTotal,
  crashTotalPages,
  onLoadCrashes,
  onDeleteCrash,
  logs,
  logPage,
  logTotal,
  logTotalPages,
  onLoadLogs,
  onDeleteLog,
  canDelete,
}: {
  crashes: AdminCrashReport[];
  crashPage: number;
  crashTotal: number;
  crashTotalPages: number;
  onLoadCrashes: (page: number) => void;
  onDeleteCrash: (row: AdminCrashReport) => void;
  logs: AdminAppLog[];
  logPage: number;
  logTotal: number;
  logTotalPages: number;
  onLoadLogs: (page: number) => void;
  onDeleteLog: (row: AdminAppLog) => void;
  canDelete: boolean;
}) {
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <Text className="mb-1 text-base font-black text-ink">
        Car crash / restart reports
      </Text>
      <Text className="mb-3 text-xs text-muted">
        One row per connection session, synced by the app from each car&apos;s
        stored restart record.
      </Text>
      {crashes.length === 0 ? (
        <View className="items-center py-8">
          <Feather name="alert-triangle" size={32} color="#cbd5e1" />
          <Text className="mt-3 text-sm text-muted">
            No crash reports synced yet.
          </Text>
        </View>
      ) : (
        <>
          {crashes.map((row) => (
            <View
              key={row.id}
              className="mb-2 rounded-xl border border-line bg-card px-4 py-3"
            >
              <View className="flex-row items-center gap-2">
                <View
                  className={`rounded px-1.5 py-0.5 ${
                    row.hasCrash ? "bg-red-100" : "bg-slate-200"
                  }`}
                >
                  <Text
                    className={`text-[10px] font-black uppercase tracking-wide ${
                      row.hasCrash ? "text-red-700" : "text-slate-500"
                    }`}
                  >
                    {row.hasCrash ? "crash" : "clean"}
                  </Text>
                </View>
                <Text className="font-mono text-sm font-bold text-ink">
                  {row.boardId || "(no board id)"}
                </Text>
                {row.modelId ? (
                  <Text className="text-xs text-muted">{row.modelId}</Text>
                ) : null}
                <Text className="text-xs text-muted">
                  FW {row.fwVersion || "?"}
                </Text>
              </View>
              {row.hasCrash && (
                <Text className="mt-1 text-sm">
                  <Text className="font-bold text-red-700">
                    {row.resetReason ?? "UNKNOWN"}
                  </Text>
                  <Text className="text-muted">
                    {row.crashCount != null
                      ? ` · ${row.crashCount} crash${row.crashCount === 1 ? "" : "es"}`
                      : ""}
                    {row.lastCrashPhase ? ` @ ${row.lastCrashPhase}` : ""}
                    {row.lastCrashHeap != null
                      ? ` · heap ${row.lastCrashHeap} B`
                      : ""}
                  </Text>
                </Text>
              )}
              <Text className="mt-1 text-xs text-muted">
                boot #{row.bootCount ?? "?"} · {row.connectionMethod} ·{" "}
                {new Date(row.reportedAt).toLocaleString()}
              </Text>
              {canDelete && (
                <View className="mt-2 flex-row gap-2">
                  <AdminAction
                    onPress={() => onDeleteCrash(row)}
                    label="Delete"
                    tone="red"
                  />
                </View>
              )}
            </View>
          ))}
          <PagePager
            page={crashPage}
            totalPages={crashTotalPages}
            onPage={onLoadCrashes}
            label="report"
            totalItems={crashTotal}
          />
        </>
      )}

      <Text className="mb-1 mt-5 text-base font-black text-ink">App logs</Text>
      <Text className="mb-3 text-xs text-muted">
        Warn/error lines flushed from phones&apos; ring buffer, newest first.
      </Text>
      {logs.length === 0 ? (
        <View className="items-center py-8">
          <Feather name="code" size={32} color="#cbd5e1" />
          <Text className="mt-3 text-sm text-muted">
            No app logs uploaded yet.
          </Text>
        </View>
      ) : (
        <>
          {logs.map((row) => (
            <View
              key={row.id}
              className="mb-2 rounded-xl border border-line bg-card px-4 py-3"
              style={{
                borderLeftWidth: 4,
                borderLeftColor:
                  row.level === "error"
                    ? "#dc2626"
                    : row.level === "warn"
                      ? "#d97706"
                      : "#1e3a8a",
              }}
            >
              <View className="flex-row items-center gap-2">
                <Text className="font-mono text-xs uppercase text-muted">
                  {row.level}
                </Text>
                <Text className="font-mono text-xs text-muted">
                  [{row.scope}]
                </Text>
                <Text className="ml-auto text-xs text-muted">
                  app v{row.appVersion || "?"}
                </Text>
              </View>
              <Text className="mt-0.5 break-words text-sm text-ink">
                {row.message}
              </Text>
              {row.detail && Object.keys(row.detail).length > 0 && (
                <Text className="mt-0.5 break-words text-xs text-muted">
                  {JSON.stringify(row.detail)}
                </Text>
              )}
              <Text className="mt-0.5 text-xs text-muted">
                {new Date(row.createdAt).toLocaleString()}
              </Text>
              {canDelete && (
                <View className="mt-2 flex-row gap-2">
                  <AdminAction
                    onPress={() => onDeleteLog(row)}
                    label="Delete"
                    tone="red"
                  />
                </View>
              )}
            </View>
          ))}
          <PagePager
            page={logPage}
            totalPages={logTotalPages}
            onPage={onLoadLogs}
            label="log"
            totalItems={logTotal}
          />
        </>
      )}
    </ScrollView>
  );
}

// U-R4 (2026-11-09): "User Logs" — the per-user audit log written by the app
// (user_activity_log). Same data the website's AdminUserLogs panel renders,
// read here with the signed-in admin session; staff can read, admins delete.
function UserLogsTab({
  logs,
  page,
  total,
  totalPages,
  onPage,
  canDelete,
  onDelete,
}: {
  logs: AdminUserLog[];
  page: number;
  total: number;
  totalPages: number;
  onPage: (page: number) => void;
  canDelete: boolean;
  onDelete: (row: AdminUserLog) => void;
}) {
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <Text className="mb-1 text-base font-black text-ink">
        User activity log
      </Text>
      <Text className="mb-3 text-xs text-muted">
        Per-user audit entries written by the app, newest first.
      </Text>
      {logs.length === 0 ? (
        <View className="items-center py-8">
          <Feather name="activity" size={32} color="#cbd5e1" />
          <Text className="mt-3 text-sm text-muted">
            No user activity logged yet.
          </Text>
        </View>
      ) : (
        <>
          {logs.map((row) => (
            <View
              key={row.id}
              className="mb-2 rounded-xl border border-line bg-card px-4 py-3"
            >
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="font-mono text-xs text-muted">
                  {row.action || "(no action)"}
                </Text>
                {row.entityType ? (
                  <Text className="text-xs text-muted">{row.entityType}</Text>
                ) : null}
                <Text className="ml-auto text-xs text-muted">
                  {new Date(row.createdAt).toLocaleString()}
                </Text>
              </View>
              {row.userId ? (
                <Text className="mt-0.5 font-mono text-[10px] text-muted">
                  user {row.userId.slice(0, 8)}…
                </Text>
              ) : null}
              {Object.keys(row.details).length > 0 && (
                <Text className="mt-1 break-words text-xs text-muted">
                  {JSON.stringify(row.details)}
                </Text>
              )}
              {canDelete && (
                <View className="mt-2 flex-row gap-2">
                  <AdminAction
                    onPress={() => onDelete(row)}
                    label="Delete"
                    tone="red"
                  />
                </View>
              )}
            </View>
          ))}
          <PagePager
            page={page}
            totalPages={totalPages}
            onPage={onPage}
            label="entry"
            totalItems={total}
          />
        </>
      )}
    </ScrollView>
  );
}

// U-R4 (2026-11-09): "Profile Entries" — per-user car/project profiles
// (user_profile_entries joined to profile_entry_types). Mirrors the website's
// AdminProfileEntries panel.
function ProfileEntriesTab({
  entries,
  types,
  page,
  total,
  totalPages,
  onPage,
  canDelete,
  onDelete,
}: {
  entries: AdminProfileEntry[];
  types: AdminProfileEntryType[];
  page: number;
  total: number;
  totalPages: number;
  onPage: (page: number) => void;
  canDelete: boolean;
  onDelete: (row: AdminProfileEntry) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [newTitle, setNewTitle] = useState<string>("");
  const [newTypeName, setNewTypeName] = useState<string>("");
  const [newBody, setNewBody] = useState<Record<string, unknown>>({});

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <Text className="mb-1 text-base font-black text-ink">
        Profile entries
      </Text>
      <Text className="mb-3 text-xs text-muted">
        Car and project profiles saved under each user, newest first.
      </Text>
      {types.length > 0 && (
        <View className="mb-3 flex-row flex-wrap gap-2">
          {types.map((type) => (
            <View
              key={type.id}
              className="rounded-full border border-line px-2.5 py-1"
            >
              <Text className="text-[10px] font-bold uppercase text-muted">
                {type.name}
              </Text>
            </View>
          ))}
        </View>
      )}
      {entries.length === 0 ? (
        <View className="items-center py-8">
          <Feather name="users" size={32} color="#cbd5e1" />
          <Text className="mt-3 text-sm text-muted">
            No profile entries saved yet.
          </Text>
        </View>
      ) : (
        <>
          {entries.map((row) => (
            <View
              key={row.id}
              className="mb-2 rounded-xl border border-line bg-card px-4 py-3"
            >
              <View className="flex-row items-center gap-2">
                <Text className="text-sm font-bold text-ink">
                  {row.title || "(untitled)"}
                </Text>
                {row.typeName ? (
                  <View className="rounded bg-slate-100 px-1.5 py-0.5">
                    <Text className="text-[10px] font-black uppercase tracking-wide text-slate-600">
                      {row.typeName}
                    </Text>
                  </View>
                ) : null}
                <Text className="ml-auto text-xs text-muted">
                  {new Date(row.createdAt).toLocaleString()}
                </Text>
              </View>
              {row.userId ? (
                <Text className="mt-0.5 font-mono text-[10px] text-muted">
                  user {row.userId.slice(0, 8)}…
                </Text>
              ) : null}
              {Object.keys(row.body).length > 0 && (
                <Text className="mt-1 break-words text-xs text-muted">
                  {JSON.stringify(row.body)}
                </Text>
              )}
              <Pressable
                onPress={() => setIsEditing(true)}
                className="mt-1 text-xs text-navy underline"
                accessibilityLabel="Edit profile entry"
              >
                <Text className="text-[10px] font-bold uppercase tracking-[0.1em] text-navy">
                  Edit
                </Text>
              </Pressable>
            </View>
          ))}
          <PagePager
            page={page}
            totalPages={totalPages}
            onPage={onPage}
            label="entry"
            totalItems={total}
          />
        </>
      )}
    </ScrollView>
  );
}

function MessagesTab({
  messages,
  total,
  page,
  totalPages,
  onPage,
  status,
  onStatusFilter,
  onMarkReplied,
}: {
  messages: AdminMessage[];
  total: number;
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
  status: string;
  onStatusFilter: (s: string) => void;
  onMarkReplied: (id: string) => void;
}) {
  const [preview, setPreview] = useState<AdminMessage | null>(null);
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <View className="mb-3">
        <Text className="font-display text-xl font-bold text-ink">
          Messages ({total})
        </Text>
        <View className="mt-2 flex-row flex-wrap gap-2">
          {(["", "new", "replied"] as const).map((s) => (
            <Pressable
              key={s || "all"}
              onPress={() => onStatusFilter(s)}
              className={`rounded-full px-3 py-1.5 ${status === s ? "bg-navy" : "border border-line bg-card"}`}
            >
              <Text
                className={`text-xs font-bold capitalize ${status === s ? "text-white" : "text-muted"}`}
              >
                {s || "All"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {messages.length === 0 ? (
        <Text className="py-8 text-center text-sm text-muted">
          No messages.
        </Text>
      ) : (
        <>
          {messages.map((m) => (
            <View
              key={m.id}
              className={`mb-3 rounded-xl border bg-card p-4 ${m.status === "new" ? "border-l-4 border-l-navy border border-line" : "border-line"}`}
            >
              <View className="flex-row items-center justify-between gap-2">
                <View className="min-w-0 flex-1">
                  <Text
                    numberOfLines={1}
                    className="text-sm font-bold text-ink"
                  >
                    {m.name}{" "}
                    <Text className="font-normal text-muted">· {m.email}</Text>
                  </Text>
                </View>
                <View className="shrink-0 flex-row flex-wrap gap-2">
                  <AdminAction
                    onPress={() => setPreview(m)}
                    label="Preview"
                    tone="plain"
                  />
                  {m.status === "new" ? (
                    <Pressable
                      onPress={() => onMarkReplied(m.id)}
                      className="rounded-full border border-line px-3 py-1"
                    >
                      <Text className="text-xs font-bold text-navy">
                        Mark replied
                      </Text>
                    </Pressable>
                  ) : (
                    <Text className="text-xs font-bold uppercase text-emerald-600">
                      Replied
                    </Text>
                  )}
                </View>
              </View>
              <Text className="mt-1 text-xs text-muted">
                {new Date(m.createdAt).toLocaleString()}
              </Text>
              <Text className="mt-2 text-xs leading-5 text-muted">
                {m.message}
              </Text>
            </View>
          ))}
          <AdminPager page={page} totalPages={totalPages} onPage={onPage} />
        </>
      )}
      {preview && (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={() => setPreview(null)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: "rgba(15, 23, 42, 0.7)",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
            onPress={() => setPreview(null)}
            accessibilityLabel="Close preview"
          >
            <View className="w-full max-w-sm rounded-2xl border border-line bg-card p-5">
              <Text className="text-xs font-black uppercase tracking-widest text-navy">
                Customer message
              </Text>
              <Text className="mt-2 font-display text-xl font-bold text-ink">
                {preview.name}
              </Text>
              <Text className="mt-0.5 text-sm text-muted">{preview.email}</Text>
              <Text className="mt-3 text-xs text-muted">
                {new Date(preview.createdAt).toLocaleString()}
              </Text>
              <View className="mt-3 border-t border-line pt-3">
                <Text className="text-sm leading-6 text-ink">
                  {preview.message}
                </Text>
              </View>
              <View className="mt-4 flex-row items-center justify-between">
                <Text
                  className={`text-xs font-bold uppercase ${preview.status === "new" ? "text-amber-600" : "text-emerald-600"}`}
                >
                  {preview.status === "new" ? "New" : "Replied"}
                </Text>
                <Pressable
                  onPress={() => setPreview(null)}
                  className="rounded-full border border-line px-4 py-2"
                >
                  <Text className="text-xs font-black text-ink">Close</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Modal>
      )}
    </ScrollView>
  );
}

// ─── Settings (company info + programs) ─────────────────────────────

function SettingsTab({
  company,
  setCompany,
  canDelete,
  onCompanySaved,
  onEditingChange,
}: {
  company: AdminCompanyInfo | null;
  setCompany: (c: AdminCompanyInfo | null) => void;
  canDelete: boolean;
  onCompanySaved: (next: AdminCompanyInfo) => void;
  onEditingChange: (v: boolean) => void;
}) {
  const inputClass =
    "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink";
  const activeEditorsRef = useRef<Record<string, boolean>>({});
  const [anyEditing, setAnyEditing] = useState(false);
  const report = useCallback(
    (key: string) => (isEditing: boolean) => {
      activeEditorsRef.current[key] = isEditing;
      setAnyEditing(Object.values(activeEditorsRef.current).some(Boolean));
    },
    [],
  );
  useEffect(() => {
    onEditingChange(anyEditing);
  }, [anyEditing, onEditingChange]);
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <Text className="font-display text-2xl font-bold tracking-tight text-ink">
        Settings
      </Text>
      <Text className="mt-1 text-xs text-muted">
        Company details — all DB-first (shared with the website).
      </Text>
      <CompanyInfoEditor
        company={company}
        setCompany={setCompany}
        onSaved={onCompanySaved}
        inputClass={inputClass}
        onEditingChange={report("company")}
      />
    </ScrollView>
  );
}

function SectionCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mt-5 rounded-xl border border-line bg-card p-4">
      <Text className="font-display text-lg font-bold text-ink">{title}</Text>
      {hint ? <Text className="mt-0.5 text-xs text-muted">{hint}</Text> : null}
      <View className="mt-3">{children}</View>
    </View>
  );
}

function CompanyInfoEditor({
  company,
  setCompany,
  onSaved,
  inputClass,
  onEditingChange,
}: {
  company: AdminCompanyInfo | null;
  setCompany: (c: AdminCompanyInfo | null) => void;
  onSaved: (next: AdminCompanyInfo) => void;
  inputClass: string;
  onEditingChange: (v: boolean) => void;
}) {
  const [saved, setSaved] = useState(false);
  function patch(part: Partial<AdminCompanyInfo>) {
    if (company) setCompany({ ...company, ...part });
  }
  // While ANY company field is focused the admin pager must not swipe.
  const focusCount = useRef(0);
  const field = {
    onFocus: () => {
      focusCount.current += 1;
      onEditingChange(true);
    },
    onBlur: () => {
      focusCount.current = Math.max(0, focusCount.current - 1);
      if (focusCount.current === 0) onEditingChange(false);
    },
  };
  return (
    <SectionCard
      title="Company information"
      hint="Shown in the app Contact/Legal screens and the website footer/contact pages."
    >
      {!company ? (
        <Text className="text-sm text-muted">Loading company info…</Text>
      ) : (
        <>
          <View className="mb-3 flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1 text-xs font-bold text-muted">Name</Text>
              <TextInput
                value={company.name}
                onChangeText={(name) => patch({ name })}
                {...field}
                className={inputClass}
              />
            </View>
            <View className="flex-1">
              <Text className="mb-1 text-xs font-bold text-muted">
                Short name
              </Text>
              <TextInput
                value={company.shortName}
                onChangeText={(shortName) => patch({ shortName })}
                {...field}
                className={inputClass}
              />
            </View>
          </View>
          <Text className="mb-1 text-xs font-bold text-muted">Address</Text>
          <TextInput
            value={company.address}
            onChangeText={(address) => patch({ address })}
            multiline
            {...field}
            className={`mb-3 ${inputClass}`}
          />
          <View className="mb-3 flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1 text-xs font-bold text-muted">City</Text>
              <TextInput
                value={company.city}
                onChangeText={(city) => patch({ city })}
                {...field}
                className={inputClass}
              />
            </View>
            <View className="flex-1">
              <Text className="mb-1 text-xs font-bold text-muted">Country</Text>
              <TextInput
                value={company.country}
                onChangeText={(country) => patch({ country })}
                {...field}
                className={inputClass}
              />
            </View>
          </View>
          <View className="mb-3 flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1 text-xs font-bold text-muted">Email</Text>
              <TextInput
                value={company.email}
                onChangeText={(email) => patch({ email })}
                autoCapitalize="none"
                keyboardType="email-address"
                {...field}
                className={inputClass}
              />
            </View>
            <View className="flex-1">
              <Text className="mb-1 text-xs font-bold text-muted">Phone</Text>
              <TextInput
                value={company.phone}
                onChangeText={(phone) => patch({ phone })}
                keyboardType="phone-pad"
                {...field}
                className={inputClass}
              />
            </View>
          </View>
          <View className="mb-3 flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1 text-xs font-bold text-muted">PAN</Text>
              <TextInput
                value={company.pan}
                onChangeText={(pan) => patch({ pan })}
                {...field}
                className={inputClass}
              />
            </View>
            <View className="flex-1">
              <Text className="mb-1 text-xs font-bold text-muted">
                VAT label
              </Text>
              <TextInput
                value={company.vatLabel}
                onChangeText={(vatLabel) => patch({ vatLabel })}
                {...field}
                className={inputClass}
              />
            </View>
          </View>
          <Text className="mb-1 text-xs font-bold text-muted">Description</Text>
          <TextInput
            value={company.description}
            onChangeText={(description) => patch({ description })}
            multiline
            style={{ textAlignVertical: "top" }}
            {...field}
            className={`mb-3 min-h-20 ${inputClass}`}
          />
          {/* C5 (2026-09-23): socials + WhatsApp — shared with the website.
              Empty = that surface is hidden. WhatsApp is stored digits-only
              (country code + number, no '+'). */}
          <Text className="mb-1 text-xs font-bold text-muted">
            WhatsApp number
          </Text>
          <TextInput
            value={company.whatsappNumber}
            onChangeText={(whatsappNumber) => patch({ whatsappNumber })}
            keyboardType="phone-pad"
            placeholder="97798XXXXXXXX"
            {...field}
            className={`mb-3 ${inputClass}`}
          />
          <Text className="mb-1 text-xs font-bold text-muted">
            Facebook URL
          </Text>
          <TextInput
            value={company.facebookUrl}
            onChangeText={(facebookUrl) => patch({ facebookUrl })}
            autoCapitalize="none"
            placeholder="https://facebook.com/…"
            {...field}
            className={`mb-3 ${inputClass}`}
          />
          <Text className="mb-1 text-xs font-bold text-muted">
            Instagram URL
          </Text>
          <TextInput
            value={company.instagramUrl}
            onChangeText={(instagramUrl) => patch({ instagramUrl })}
            autoCapitalize="none"
            placeholder="https://instagram.com/…"
            {...field}
            className={`mb-3 ${inputClass}`}
          />
          <Text className="mb-1 text-xs font-bold text-muted">TikTok URL</Text>
          <TextInput
            value={company.tiktokUrl}
            onChangeText={(tiktokUrl) => patch({ tiktokUrl })}
            autoCapitalize="none"
            placeholder="https://tiktok.com/@…"
            {...field}
            className={`mb-3 ${inputClass}`}
          />
          <Text className="mb-1 text-xs font-bold text-muted">
            LinkedIn URL
          </Text>
          <TextInput
            value={company.linkedinUrl}
            onChangeText={(linkedinUrl) => patch({ linkedinUrl })}
            autoCapitalize="none"
            placeholder="https://linkedin.com/company/…"
            {...field}
            className={`mb-3 ${inputClass}`}
          />
          <Text className="mb-1 text-xs font-bold text-muted">Website URL</Text>
          <TextInput
            value={company.url}
            onChangeText={(url) => patch({ url })}
            autoCapitalize="none"
            placeholder="https://example.com"
            {...field}
            className={`mb-3 ${inputClass}`}
          />
          <Text className="mb-1 text-xs font-bold text-muted">YouTube URL</Text>
          <TextInput
            value={company.youtubeUrl}
            onChangeText={(youtubeUrl) => patch({ youtubeUrl })}
            autoCapitalize="none"
            placeholder="https://youtube.com/@…"
            {...field}
            className={`mb-3 ${inputClass}`}
          />
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() => {
                onSaved(company);
                setSaved(true);
              }}
              className="rounded-full bg-navy px-5 py-2"
            >
              <Text className="text-xs font-black text-white">
                Save company
              </Text>
            </Pressable>
            {saved && (
              <Text className="text-sm font-semibold text-emerald-700">
                Saved.
              </Text>
            )}
          </View>
        </>
      )}
    </SectionCard>
  );
}

function TrainingProgramsManager({
  programs,
  setPrograms,
  onSave,
  canDelete,
  onDelete,
  inputClass,
  onEditingChange,
}: {
  programs: AdminTrainingProgram[];
  setPrograms: (p: AdminTrainingProgram[]) => void;
  onSave: (p: AdminTrainingProgram, isNew: boolean) => void;
  canDelete: boolean;
  onDelete: (id: string) => void;
  inputClass: string;
  onEditingChange: (v: boolean) => void;
}) {
  const [editing, setEditing] = useState<AdminTrainingProgram | null>(null);
  const [preview, setPreview] = useState<AdminTrainingProgram | null>(null);
  useEffect(() => {
    onEditingChange(editing != null);
  }, [editing != null]);
  function blank(): AdminTrainingProgram {
    return {
      id: "",
      title: "",
      audience: "",
      description: "",
      duration: "",
      outcome: "",
      active: true,
      sortOrder: 0,
    };
  }
  function patch(part: Partial<AdminTrainingProgram>) {
    if (editing) setEditing({ ...editing, ...part });
  }
  const isNew = editing ? !programs.some((p) => p.id === editing.id) : false;
  const slug = (v: string) =>
    v
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  function toggleActive(p: AdminTrainingProgram) {
    const next = { ...p, active: !p.active };
    setPrograms(programs.map((x) => (x.id === p.id ? next : x)));
    // Save the toggled state via the onSave handler (read from current state).
    void onSave(next, false);
  }
  return (
    <SectionCard
      title={`Training programs (${programs.length})`}
      hint="Shown on the Home screen and the website /services page."
    >
      <Pressable
        onPress={() => setEditing(blank())}
        className="mb-3 self-start rounded-full bg-navy px-4 py-2"
      >
        <Text className="text-xs font-black text-white">+ New program</Text>
      </Pressable>
      {editing && (
        <View className="mb-3 rounded-lg border border-line bg-surface p-3">
          <Text className="mb-2 text-sm font-bold text-ink">
            {isNew ? "Add a training program" : `Edit ${editing.id}`}
          </Text>
          <Text className="mb-1 text-xs font-bold text-muted">Title</Text>
          <TextInput
            value={editing.title}
            onChangeText={(title) => patch({ title })}
            className={`mb-2 ${inputClass}`}
          />
          <Text className="mb-1 text-xs font-bold text-muted">Audience</Text>
          <TextInput
            value={editing.audience}
            onChangeText={(audience) => patch({ audience })}
            className={`mb-2 ${inputClass}`}
            placeholder="Students / Teachers / Makers"
          />
          <Text className="mb-1 text-xs font-bold text-muted">Duration</Text>
          <TextInput
            value={editing.duration}
            onChangeText={(duration) => patch({ duration })}
            className={`mb-2 ${inputClass}`}
            placeholder="2 hours / 4 sessions"
          />
          <Text className="mb-1 text-xs font-bold text-muted">Description</Text>
          <TextInput
            value={editing.description}
            onChangeText={(description) => patch({ description })}
            multiline
            className={`mb-2 ${inputClass}`}
          />
          <Text className="mb-1 text-xs font-bold text-muted">Outcome</Text>
          <TextInput
            value={editing.outcome}
            onChangeText={(outcome) => patch({ outcome })}
            multiline
            className={`mb-2 ${inputClass}`}
          />
          <Text className="mb-1 text-xs font-bold text-muted">Sort order</Text>
          <TextInput
            value={String(editing.sortOrder)}
            onChangeText={(sortOrder) =>
              patch({
                sortOrder: Math.max(0, Math.round(Number(sortOrder) || 0)),
              })
            }
            keyboardType="numeric"
            className={`mb-2 ${inputClass}`}
          />
          <View className="mb-3 flex-row items-center gap-3">
            <Text className="text-sm font-semibold text-ink">Active</Text>
            <Switch
              value={editing.active}
              onValueChange={(active) => patch({ active })}
              trackColor={{ true: "#1e3a8a", false: "#e2e8f0" }}
            />
          </View>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => {
                const next = {
                  ...editing,
                  id: editing.id.trim() || slug(editing.title),
                };
                onSave(next, isNew);
                setEditing(null);
              }}
              className="rounded-full bg-gold px-5 py-2"
            >
              <Text className="text-xs font-black text-ink">Save</Text>
            </Pressable>
            <Pressable
              onPress={() => setEditing(null)}
              className="rounded-full border border-line px-5 py-2"
            >
              <Text className="text-xs font-black text-ink">Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
      {programs.length === 0 ? (
        <Text className="text-sm text-muted">No training programs yet.</Text>
      ) : (
        programs.map((program) => (
          <View
            key={program.id}
            className="mb-2 flex-row items-center justify-between gap-2 rounded-lg border border-line p-3"
          >
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-bold text-ink" numberOfLines={1}>
                {program.title}
              </Text>
              <Text className="text-xs text-muted" numberOfLines={1}>
                {program.audience}
                {program.duration ? ` · ${program.duration}` : ""}
              </Text>
              {!program.active && (
                <Text className="mt-0.5 text-[10px] font-black uppercase text-red-500">
                  Hidden
                </Text>
              )}
            </View>
            <View className="flex-row flex-wrap gap-2">
              <AdminAction
                onPress={() => setEditing({ ...program })}
                label="Edit"
                tone="navy"
              />
              <AdminAction
                onPress={() => setPreview(program)}
                label="Preview"
                tone="plain"
              />
              <AdminAction
                onPress={() => toggleActive(program)}
                label={program.active ? "Hide" : "Show"}
                tone="plain"
              />
              {canDelete && (
                <AdminAction
                  onPress={() => onDelete(program.id)}
                  label="Delete"
                  tone="red"
                />
              )}
            </View>
          </View>
        ))
      )}
      {preview && (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={() => setPreview(null)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: "rgba(15, 23, 42, 0.7)",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
            onPress={() => setPreview(null)}
            accessibilityLabel="Close preview"
          >
            <View className="w-full max-w-sm rounded-2xl border border-line bg-card p-5">
              <Text className="text-xs font-black uppercase tracking-widest text-navy">
                Training program
              </Text>
              <Text className="mt-2 font-display text-lg font-bold text-ink">
                {preview.title}
              </Text>
              <Text className="mt-1 text-xs text-muted">
                {preview.audience} · {preview.duration}
              </Text>
              {preview.description ? (
                <Text className="mt-3 text-sm leading-6 text-muted">
                  {preview.description}
                </Text>
              ) : null}
              {preview.outcome ? (
                <Text className="mt-2 text-sm font-semibold text-ink">
                  Outcome: {preview.outcome}
                </Text>
              ) : null}
              <View className="mt-4 flex-row items-center justify-between">
                <Text
                  className={`text-xs font-bold uppercase ${preview.active ? "text-emerald-600" : "text-red-500"}`}
                >
                  {preview.active ? "Published" : "Hidden"}
                </Text>
                <Pressable
                  onPress={() => setPreview(null)}
                  className="rounded-full border border-line px-4 py-2"
                >
                  <Text className="text-xs font-black text-ink">Close</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Modal>
      )}
    </SectionCard>
  );
}

function PilotCostManager({
  lines,
  setLines,
  onSave,
  canDelete,
  onDelete,
  inputClass,
  onEditingChange,
}: {
  lines: AdminPilotCostLine[];
  setLines: (p: AdminPilotCostLine[]) => void;
  onSave: (p: AdminPilotCostLine, isNew: boolean) => void;
  canDelete: boolean;
  onDelete: (id: string) => void;
  inputClass: string;
  onEditingChange: (v: boolean) => void;
}) {
  const [editing, setEditing] = useState<AdminPilotCostLine | null>(null);
  const [preview, setPreview] = useState<AdminPilotCostLine | null>(null);
  useEffect(() => {
    onEditingChange(editing != null);
  }, [editing != null]);
  function blank(): AdminPilotCostLine {
    return { id: "", item: "", cost: "", note: "", active: true, sortOrder: 0 };
  }
  function patch(part: Partial<AdminPilotCostLine>) {
    if (editing) setEditing({ ...editing, ...part });
  }
  const isNew = editing ? !lines.some((l) => l.id === editing.id) : false;
  function toggleActive(p: AdminPilotCostLine) {
    const next = { ...p, active: !p.active };
    setLines(lines.map((x) => (x.id === p.id ? next : x)));
    void onSave(next, false);
  }
  return (
    <SectionCard
      title={`Pilot cost lines (${lines.length})`}
      hint="Shown on the Home screen (pilot program running costs)."
    >
      <Pressable
        onPress={() => setEditing(blank())}
        className="mb-3 self-start rounded-full bg-navy px-4 py-2"
      >
        <Text className="text-xs font-black text-white">+ New cost line</Text>
      </Pressable>
      {editing && (
        <View className="mb-3 rounded-lg border border-line bg-surface p-3">
          <Text className="mb-2 text-sm font-bold text-ink">
            {isNew ? "Add a cost line" : `Edit ${editing.id}`}
          </Text>
          <Text className="mb-1 text-xs font-bold text-muted">Item</Text>
          <TextInput
            value={editing.item}
            onChangeText={(item) => patch({ item })}
            className={`mb-2 ${inputClass}`}
          />
          <Text className="mb-1 text-xs font-bold text-muted">Cost</Text>
          <TextInput
            value={editing.cost}
            onChangeText={(cost) => patch({ cost })}
            className={`mb-2 ${inputClass}`}
            placeholder="NPR 25,000 / month"
          />
          <Text className="mb-1 text-xs font-bold text-muted">Note</Text>
          <TextInput
            value={editing.note}
            onChangeText={(note) => patch({ note })}
            multiline
            className={`mb-2 ${inputClass}`}
          />
          <Text className="mb-1 text-xs font-bold text-muted">Sort order</Text>
          <TextInput
            value={String(editing.sortOrder)}
            onChangeText={(sortOrder) =>
              patch({
                sortOrder: Math.max(0, Math.round(Number(sortOrder) || 0)),
              })
            }
            keyboardType="numeric"
            className={`mb-2 ${inputClass}`}
          />
          <View className="mb-3 flex-row items-center gap-3">
            <Text className="text-sm font-semibold text-ink">Active</Text>
            <Switch
              value={editing.active}
              onValueChange={(active) => patch({ active })}
              trackColor={{ true: "#1e3a8a", false: "#e2e8f0" }}
            />
          </View>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => {
                const next = {
                  ...editing,
                  id: editing.id.trim() || `cost-${Date.now()}`,
                };
                onSave(next, isNew);
                setEditing(null);
              }}
              className="rounded-full bg-gold px-5 py-2"
            >
              <Text className="text-xs font-black text-ink">Save</Text>
            </Pressable>
            <Pressable
              onPress={() => setEditing(null)}
              className="rounded-full border border-line px-5 py-2"
            >
              <Text className="text-xs font-black text-ink">Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
      {lines.length === 0 ? (
        <Text className="text-sm text-muted">No pilot cost lines yet.</Text>
      ) : (
        lines.map((line) => (
          <View
            key={line.id}
            className="mb-2 flex-row items-center justify-between gap-2 rounded-lg border border-line p-3"
          >
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-bold text-ink" numberOfLines={1}>
                {line.item}
              </Text>
              <Text className="text-xs text-muted" numberOfLines={1}>
                {line.cost}
                {line.note ? ` · ${line.note}` : ""}
              </Text>
              {!line.active && (
                <Text className="mt-0.5 text-[10px] font-black uppercase text-red-500">
                  Hidden
                </Text>
              )}
            </View>
            <View className="flex-row flex-wrap gap-2">
              <AdminAction
                onPress={() => setEditing({ ...line })}
                label="Edit"
                tone="navy"
              />
              <AdminAction
                onPress={() => setPreview(line)}
                label="Preview"
                tone="plain"
              />
              <AdminAction
                onPress={() => toggleActive(line)}
                label={line.active ? "Hide" : "Show"}
                tone="plain"
              />
              {canDelete && (
                <AdminAction
                  onPress={() => onDelete(line.id)}
                  label="Delete"
                  tone="red"
                />
              )}
            </View>
          </View>
        ))
      )}
      {preview && (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={() => setPreview(null)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: "rgba(15, 23, 42, 0.7)",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
            onPress={() => setPreview(null)}
            accessibilityLabel="Close preview"
          >
            <View className="w-full max-w-sm rounded-2xl border border-line bg-card p-5">
              <Text className="text-xs font-black uppercase tracking-widest text-navy">
                Pilot cost line
              </Text>
              <Text className="mt-2 font-display text-lg font-bold text-ink">
                {preview.item}
              </Text>
              <Text className="mt-1 text-sm font-bold text-navy">
                {preview.cost}
              </Text>
              {preview.note ? (
                <Text className="mt-2 text-sm leading-6 text-muted">
                  {preview.note}
                </Text>
              ) : null}
              <View className="mt-4 flex-row items-center justify-between">
                <Text
                  className={`text-xs font-bold uppercase ${preview.active ? "text-emerald-600" : "text-red-500"}`}
                >
                  {preview.active ? "Published" : "Hidden"}
                </Text>
                <Pressable
                  onPress={() => setPreview(null)}
                  className="rounded-full border border-line px-4 py-2"
                >
                  <Text className="text-xs font-black text-ink">Close</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Modal>
      )}
    </SectionCard>
  );
}

function CurriculumManager({
  highlights,
  setHighlights,
  onSave,
  canDelete,
  onDelete,
  inputClass,
  onEditingChange,
}: {
  highlights: AdminCurriculumHighlight[];
  setHighlights: (c: AdminCurriculumHighlight[]) => void;
  onSave: (c: AdminCurriculumHighlight, isNew: boolean) => void;
  canDelete: boolean;
  onDelete: (id: string) => void;
  inputClass: string;
  onEditingChange: (v: boolean) => void;
}) {
  const [editing, setEditing] = useState<AdminCurriculumHighlight | null>(null);
  const [preview, setPreview] = useState<AdminCurriculumHighlight | null>(null);
  useEffect(() => {
    onEditingChange(editing != null);
  }, [editing != null]);
  function blank(): AdminCurriculumHighlight {
    return { id: "", ageBand: "", items: [], active: true, sortOrder: 0 };
  }
  function patch(part: Partial<AdminCurriculumHighlight>) {
    if (editing) setEditing({ ...editing, ...part });
  }
  const isNew = editing ? !highlights.some((h) => h.id === editing.id) : false;
  function toggleActive(p: AdminCurriculumHighlight) {
    const next = { ...p, active: !p.active };
    setHighlights(highlights.map((x) => (x.id === p.id ? next : x)));
    void onSave(next, false);
  }
  return (
    <SectionCard
      title={`Curriculum highlights (${highlights.length})`}
      hint="Age-band curriculum items shown on the Home screen."
    >
      <Pressable
        onPress={() => setEditing(blank())}
        className="mb-3 self-start rounded-full bg-navy px-4 py-2"
      >
        <Text className="text-xs font-black text-white">+ New highlight</Text>
      </Pressable>
      {editing && (
        <View className="mb-3 rounded-lg border border-line bg-surface p-3">
          <Text className="mb-2 text-sm font-bold text-ink">
            {isNew ? "Add a curriculum highlight" : `Edit ${editing.id}`}
          </Text>
          <Text className="mb-1 text-xs font-bold text-muted">Age band</Text>
          <TextInput
            value={editing.ageBand}
            onChangeText={(ageBand) => patch({ ageBand })}
            className={`mb-2 ${inputClass}`}
            placeholder="Ages 8-11"
          />
          <Text className="mb-1 text-xs font-bold text-muted">
            Skills / items (one per line)
          </Text>
          <TextInput
            value={editing.items.join("\n")}
            onChangeText={(v) => patch({ items: toStringArrayLines(v) })}
            multiline
            style={{ textAlignVertical: "top" }}
            className={`mb-2 min-h-20 ${inputClass}`}
          />
          <Text className="mb-1 text-xs font-bold text-muted">Sort order</Text>
          <TextInput
            value={String(editing.sortOrder)}
            onChangeText={(sortOrder) =>
              patch({
                sortOrder: Math.max(0, Math.round(Number(sortOrder) || 0)),
              })
            }
            keyboardType="numeric"
            className={`mb-2 ${inputClass}`}
          />
          <View className="mb-3 flex-row items-center gap-3">
            <Text className="text-sm font-semibold text-ink">Active</Text>
            <Switch
              value={editing.active}
              onValueChange={(active) => patch({ active })}
              trackColor={{ true: "#1e3a8a", false: "#e2e8f0" }}
            />
          </View>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => {
                const next = {
                  ...editing,
                  id: editing.id.trim() || `curriculum-${Date.now()}`,
                };
                onSave(next, isNew);
                setEditing(null);
              }}
              className="rounded-full bg-gold px-5 py-2"
            >
              <Text className="text-xs font-black text-ink">Save</Text>
            </Pressable>
            <Pressable
              onPress={() => setEditing(null)}
              className="rounded-full border border-line px-5 py-2"
            >
              <Text className="text-xs font-black text-ink">Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
      {highlights.length === 0 ? (
        <Text className="text-sm text-muted">
          No curriculum highlights yet.
        </Text>
      ) : (
        highlights.map((highlight) => (
          <View
            key={highlight.id}
            className="mb-2 flex-row items-center justify-between gap-2 rounded-lg border border-line p-3"
          >
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-bold text-ink" numberOfLines={1}>
                {highlight.ageBand}
              </Text>
              <Text className="text-xs text-muted" numberOfLines={1}>
                {highlight.items.length} skill
                {highlight.items.length === 1 ? "" : "s"}
              </Text>
              {!highlight.active && (
                <Text className="mt-0.5 text-[10px] font-black uppercase text-red-500">
                  Hidden
                </Text>
              )}
            </View>
            <View className="flex-row flex-wrap gap-2">
              <AdminAction
                onPress={() => setEditing({ ...highlight })}
                label="Edit"
                tone="navy"
              />
              <AdminAction
                onPress={() => setPreview(highlight)}
                label="Preview"
                tone="plain"
              />
              <AdminAction
                onPress={() => toggleActive(highlight)}
                label={highlight.active ? "Hide" : "Show"}
                tone="plain"
              />
              {canDelete && (
                <AdminAction
                  onPress={() => onDelete(highlight.id)}
                  label="Delete"
                  tone="red"
                />
              )}
            </View>
          </View>
        ))
      )}
      {preview && (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={() => setPreview(null)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: "rgba(15, 23, 42, 0.7)",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
            onPress={() => setPreview(null)}
            accessibilityLabel="Close preview"
          >
            <View className="w-full max-w-sm rounded-2xl border border-line bg-card p-5">
              <Text className="text-xs font-black uppercase tracking-widest text-navy">
                Curriculum highlight
              </Text>
              <Text className="mt-2 font-display text-lg font-bold text-ink">
                {preview.ageBand}
              </Text>
              {preview.items.length > 0 ? (
                <View className="mt-3 space-y-1">
                  {preview.items.map((item, i) => (
                    <Text key={i} className="text-sm leading-6 text-muted">
                      • {item}
                    </Text>
                  ))}
                </View>
              ) : null}
              <View className="mt-4 flex-row items-center justify-between">
                <Text
                  className={`text-xs font-bold uppercase ${preview.active ? "text-emerald-600" : "text-red-500"}`}
                >
                  {preview.active ? "Published" : "Hidden"}
                </Text>
                <Pressable
                  onPress={() => setPreview(null)}
                  className="rounded-full border border-line px-4 py-2"
                >
                  <Text className="text-xs font-black text-ink">Close</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Modal>
      )}
    </SectionCard>
  );
}

// ─── Shared admin list helpers ───────────────────────────────────────

// U-43 (2026-09-26): AdminPager now delegates to the shared PagePager so
// every admin list gets NUMBERED page buttons (fast navigation) instead of
// prev/next-only stepping. Same props, same placement — zero call-site churn.
function AdminPager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  return (
    <View className="mt-2">
      <PagePager page={page} totalPages={totalPages} onPage={onPage} />
    </View>
  );
}

function AdminAction({
  onPress,
  label,
  tone,
}: {
  onPress: () => void;
  label: string;
  tone: "navy" | "plain" | "red";
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full px-3 py-1 ${tone === "navy" ? "bg-navy" : tone === "red" ? "border border-red-200" : "border border-line"}`}
    >
      <Text
        className={`text-xs font-bold ${tone === "navy" ? "text-white" : tone === "red" ? "text-red-600" : "text-ink"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ProductPreviewModal({
  product,
  onClose,
}: {
  product: AdminProduct;
  onClose: () => void;
}) {
  return (
    <CatalogPreviewModal
      typeLabel={product.badge || product.productType}
      title={product.name}
      body={product.note || product.description}
      priceLabel={
        product.priceLabel || `NPR ${product.price.toLocaleString("en-IN")}`
      }
      image={product.image}
      active={product.active}
      onClose={onClose}
    />
  );
}

function CatalogPreviewModal({
  typeLabel,
  title,
  body,
  priceLabel,
  image,
  active,
  onClose,
}: {
  typeLabel: string;
  title: string;
  body: string;
  priceLabel: string;
  image: string;
  active: boolean;
  onClose: () => void;
}) {
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(15, 23, 42, 0.7)",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
        onPress={onClose}
        accessibilityLabel="Close preview"
      >
        <Pressable
          onPress={() => {}}
          className="w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-card"
        >
          {image ? (
            <View className="h-40 w-full bg-ink">
              <Image
                source={{ uri: image }}
                className="h-full w-full"
                resizeMode="cover"
              />
            </View>
          ) : null}
          <View className="p-5">
            <View className="flex-row items-center justify-between">
              <Text
                className="shrink-1 text-xs font-black uppercase tracking-widest text-navy"
                numberOfLines={1}
              >
                {typeLabel}
              </Text>
              <Text
                className={`ml-2 shrink-0 text-[10px] font-black uppercase ${active ? "text-emerald-600" : "text-red-500"}`}
              >
                {active ? "Published" : "Hidden"}
              </Text>
            </View>
            <Text
              numberOfLines={2}
              className="mt-2 font-display text-xl font-bold leading-snug text-ink"
            >
              {title}
            </Text>
            {body ? (
              <Text
                numberOfLines={3}
                className="mt-2 text-sm leading-6 text-muted"
              >
                {body}
              </Text>
            ) : null}
            <View className="mt-4 flex-row items-center justify-between gap-3">
              {priceLabel ? (
                <Text
                  numberOfLines={1}
                  className="min-w-0 flex-1 font-display text-lg font-bold text-ink"
                >
                  {priceLabel}
                </Text>
              ) : (
                <View />
              )}
              <Pressable
                onPress={onClose}
                className="rounded-full border border-line px-4 py-2"
              >
                <Text className="text-xs font-black text-ink">Close</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
