// =====================================================================
// AdminScreen - native admin dashboard mirroring the website AdminPanel.
// Tabs (7): Dashboard · Orders · Electronic Products · 3D Products · Projects
// · Users · Settings. (Logs lives inside Users, mirroring the web. Content was
// merged into Settings on 2026-11-18 — see docs/ADMIN_COHERENCE.md.)
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
import { ADMIN_TAB_HINTS } from "../config/adminTabs";
import type {
  DashboardSubTab,
  OrderPanel,
  OrdersSubTab,
  UsersSubTab,
} from "../config/app_admin_subtabs";
import {
  DASHBOARD_SUBTABS,
  ORDER_PANELS,
  ORDERS_SUBTABS,
  USERS_SUBTABS,
} from "../config/app_admin_subtabs";
import PrintAdminPanel, {
  PrintSectionTabs,
  type PrintAdminSection,
} from "./PrintAdminPanel";
import { AdminSubTabs } from "../components/admin/AdminSubTabs";
import { AdminEditorSheet } from "../components/admin/AdminEditorSheet";
// 2026-11-18: the three new project blocks (code details, 3D material details,
// coding procedure) live in products.import_meta.projectDetails — see
// config/projectDetails.ts for the shape and why no migration was needed.
import {
  readProjectDetails,
  writeProjectDetails,
  type ProjectDetails,
} from "../config/projectDetails";
// 2026-11-14 (owner: "i dont like the split screen of the admin dashboards
// tabs contents"): the tab pager is gone. Tabs are no longer pages in a
// swipeable filmstrip — one tab renders at a time, full width, in normal
// layout flow, exactly like the website's mobile view. Inactive tabs stay
// mounted (their state and in-flight loads survive) but are display:"none",
// so they contribute no width, no height and no a11y nodes.
import { useApp } from "../context/AppContext";
import { CategoryDropdown } from "../components/CategoryDropdown";
import { PagePager } from "../components/PagePager";
import { ServiceCard } from "../components/ServiceCard";
import { isProjectPackage } from "../services/projectService";
import { applyComponentsScope } from "../services/productService";
import { galleryImages } from "../types";
import { logger } from "../services/logger";
import { IMAGE_BUDGET_HINT, clampGallery } from "../lib/imageLimits";
import { BUNDLED_HERO_BODY, BUNDLED_HERO_TITLE } from "../config/site";
import {
  defaultProjectPricing,
  estimateProject,
  type ProjectPricing,
} from "../lib/project-pricing";
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
  type AdminProjectProfile,
  listAdminCarProfiles,
  listUserCarProfiles,
  upsertAdminCarProfile,
  deleteAdminCarProfile,
  listAdminMessages,
  markMessageReplied,
  deleteAdminMessage,
  listAdminSubscribers,
  deleteAdminSubscriber,
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
  getAdminProjectPricing,
  listAdminProjectPricing,
  saveAdminProjectPricing,
  setAdminProjectPricingApproval,
  type AdminOrder,
  type AdminProduct,
  type AdminService,
  type AdminUser,
  type AdminMessage,
  type AdminSubscriber,
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

type Tab =
  | "Dashboard"
  | "Orders"
  | "Electronic Products"
  | "3D Products"
  | "Projects"
  | "Users"
  | "Settings";

function AdminSectionPanels({
  active,
  panels,
}: {
  active: string;
  panels: readonly { key: string; content: React.ReactNode }[];
}) {
  return (
    <View className="min-h-0 flex-1 overflow-hidden bg-mist">
      {panels.map(({ key, content }) => (
        <View
          key={key}
          className="flex-1 bg-mist"
          style={{
            ...(active === key ? undefined : { display: "none" as const }),
            overflow: "hidden",
          }}
          accessibilityElementsHidden={active !== key}
          importantForAccessibility={
            active === key ? "auto" : "no-hide-descendants"
          }
        >
          {content}
        </View>
      ))}
    </View>
  );
}

/**
 * Full-height wrapper for a tab panel.
 *
 * MUST stay at module scope. It used to be declared inside renderTabContent,
 * which made it a new component type on every render, so React unmounted and
 * remounted every panel on each keystroke: text inputs lost their caret and
 * collapsed sections reopened, deleting one image re-rendered the whole editor,
 * and sub-tabs fell back to their first tab. A stable type fixes all three.
 */
function Sub({
  children,
  style,
  className,
}: {
  children: React.ReactNode;
  style?: any;
  className?: string;
}) {
  return (
    <View className={"flex-1 " + (className || "")} style={style}>
      {children}
    </View>
  );
}

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
  "Users",
  "Settings",
];

// U-UI1 (2026-11-09): measured widths, not an assumed 96 px per tab. The old
// scroll math multiplied a fixed width while the labels themselves differ in
// length (Electronic Products vs Logs), so the active tab drifted off-centre.
const TAB_MIN_WIDTH = 96;

// Staff-only console: the website redirects every non-staff visitor away from
// /admin, so the app must not render it for a customer either (deep link, or a
// screen left on the stack after a role change).
// Section wrapper for the admin editor sheets. Module scope on purpose:
// declaring it inside a screen made it a new component type on every render,
// which remounted every open section (and collapsed it) on each keystroke.
function EditorSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View className="mb-3 overflow-hidden rounded-xl border border-line bg-surface">
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={`${open ? "Collapse" : "Expand"} ${title}`}
        accessibilityState={{ expanded: open }}
        className="min-h-11 flex-row items-center justify-between px-4 py-3"
      >
        <View className="min-w-0 flex-1 pr-3">
          <Text className="text-sm font-bold text-ink">{title}</Text>
          {subtitle ? (
            <Text numberOfLines={1} className="mt-0.5 text-[11px] text-muted">
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Feather
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color="#475569"
        />
      </Pressable>
      {open ? (
        <View className="border-t border-line bg-card px-4 pb-4 pt-3">
          {children}
        </View>
      ) : null}
    </View>
  );
}

export function AdminScreen() {
  const { isStaff } = useApp();
  if (!isStaff) {
    return (
      <View className="flex-1 items-center justify-center bg-surface px-8">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-navy">
          <Feather name="shield" size={26} color="#ffffff" />
        </View>
        <Text className="mt-4 font-display text-xl font-bold text-ink">
          Staff only
        </Text>
        <Text className="mt-1 text-center text-sm text-muted">
          The admin dashboard is for GENUM staff accounts. Sign in with a staff,
          admin, or owner account to continue.
        </Text>
      </View>
    );
  }
  return <AdminConsole />;
}

function AdminConsole() {
  const { isAdmin, isOwner, user: currentUser } = useApp();
  // Staff can operate every admin panel except deletions; isAdmin means
  // admin+owner (deletion rights). Only the sole owner may delete users
  // (see the Users tab).
  const canDelete = isAdmin;
  const [tab, setTab] = useState<Tab>("Dashboard");
  const [dashboardSubTab, setDashboardSubTab] =
    useState<DashboardSubTab>("Overview");
  // 2026-11-14: the 3D Products tab gained the website's print-studio sections
  // (Categories → Reports). "Catalog" keeps the existing product list.
  const [printSection, setPrintSection] = useState<
    PrintAdminSection | "Catalog"
  >("Catalog");
  const tabScrollRef = useRef<ScrollView>(null);
  const currentPageRef = useRef<number>(0);
  const [visited, setVisited] = useState<Record<string, boolean>>({
    Dashboard: true,
  });
  const [loading, setLoading] = useState(false);
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  // U-UI1: stamped after each successful tab load, shown in the console bar.
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const tabOffsets = useRef<number[]>([]);

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

  // Newsletter opt-ins (same table the website's Messages panel lists)
  const [subscribers, setSubscribers] = useState<AdminSubscriber[]>([]);
  const [subscriberPage, setSubscriberPage] = useState(1);
  const [subscriberTotal, setSubscriberTotal] = useState(0);
  const [subscriberTotalPages, setSubscriberTotalPages] = useState(1);

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
  const [ordersPanel, setOrdersPanel] = useState<OrderPanel>("Orders");
  const [ordersSubTab, setOrdersSubTab] = useState<OrdersSubTab>("All");
  // 2026-11-18 (owner): the Content tab is gone. Its panels live under
  // Settings, which is where an admin looks for anything that is not a
  // catalog item: company record, home page copy, storefront services, journal.
  const [settingsSubTab, setSettingsSubTab] =
    useState<SettingsSubTab>("Company");
  const [usersSubTab, setUsersSubTab] = useState<UsersSubTab>("Accounts");
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
    // Content lives under Settings now, so its editors count as Settings too.
    (tab === "Settings" &&
      (editingService != null || journalOpen || settingsEditing));

  const editingProductOpen = editingProduct != null;
  const editingServiceOpen = editingService != null;
  const editingProjectOpen = editingProject != null;

  useEffect(() => {
    if (!editorOnCurrentTab) return;
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
      if (tab === "Settings" && (editingService != null || journalOpen)) {
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
    // The previous effect's cleanup removes the old listener before this one
    // runs, so there is nothing to store and no state write to make here.
    return () => sub.remove();
  }, [
    tab,
    editingProductOpen,
    editingServiceOpen,
    editingProjectOpen,
    editingProduct,
    editingProject,
    editingService,
    editorOnCurrentTab,
    settingsEditing,
    journalOpen,
  ]);

  useEffect(() => {
    // The tab is the only meaningful trigger; loadTab closes over the whole
    // admin data layer and would re-fire on every one of its identities.
    void loadTab();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tab-keyed load
  }, [tab]);

  async function runAdminLoad(
    label: string,
    action: () => Promise<unknown>,
  ): Promise<boolean> {
    try {
      await action();
      setLoadErrors((current) => {
        if (!(label in current)) return current;
        const next = { ...current };
        delete next[label];
        return next;
      });
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error || "Unknown error");
      logger.error("admin", `${label} load error:`, error);
      setLoadErrors((current) => ({ ...current, [label]: message }));
      return false;
    }
  }

  async function loadTab() {
    setLoading(true);
    setLoadErrors({});
    let loaded = true;
    try {
      if (tab === "Dashboard") {
        const results = await Promise.all([
          runAdminLoad("Dashboard stats", async () =>
            setStats(await fetchDashboardStats()),
          ),
          runAdminLoad("Dashboard analytics", async () =>
            setAnalytics(await fetchAdminAnalytics(30)),
          ),
          loadActivity(1),
        ]);
        loaded = results.every(Boolean);
      } else if (tab === "Orders") {
        const results = await Promise.all([
          loadOrders(1),
          stats
            ? Promise.resolve(true)
            : runAdminLoad("Dashboard stats", async () =>
                setStats(await fetchDashboardStats()),
              ),
        ]);
        loaded = results.every(Boolean);
      } else if (tab === "Electronic Products" || tab === "3D Products") {
        loaded = await runAdminLoad("Products", async () =>
          setProducts(await listAdminProducts()),
        );
      } else if (tab === "Projects") {
        loaded = await runAdminLoad("Projects", async () =>
          setProducts(await listAdminProducts()),
        );
      } else if (tab === "Settings") {
        const results = await Promise.all([
          runAdminLoad("Company settings", async () =>
            setCompanyInfo(await getCompanyInfo()),
          ),
          runAdminLoad("Services", async () =>
            setServices(await listAdminServices()),
          ),
          runAdminLoad("Journal", async () =>
            setJournals(await listAdminJournalPosts()),
          ),
          runAdminLoad("Home page content", async () => {
            const result = await fetchSiteContent();
            if (result?.content) {
              const content = result.content;
              setSiteContent(content);
              setContentTitle(content.home_title || "");
              setContentBody(content.home_body || "");
            } else {
              // Fall back to bundled content when the live endpoint is
              // unreachable (no network, edge function undeployed, etc.).
              setSiteContent({
                id: 0,
                home_title: BUNDLED_HERO_TITLE,
                home_body: BUNDLED_HERO_BODY,
              });
              setContentTitle(BUNDLED_HERO_TITLE);
              setContentBody(BUNDLED_HERO_BODY);
            }
          }),
          runAdminLoad("Training programs", async () =>
            setTrainingPrograms(await listAdminTrainingPrograms()),
          ),
          runAdminLoad("Pilot costs", async () =>
            setPilotCostLines(await listAdminPilotCostLines()),
          ),
          runAdminLoad("Curriculum highlights", async () =>
            setCurriculumHighlights(await listAdminCurriculumHighlights()),
          ),
        ]);
        loaded = results.every(Boolean);
      } else if (tab === "Users") {
        const results = await Promise.all([
          loadUsers(1),
          loadMessages(1),
          loadSubscribers(1),
          loadCrashReports(1),
          loadAppLogs(1),
          loadUserLogs(1),
          loadProfileEntries(1),
          runAdminLoad("Profile entry types", async () =>
            setProfileEntryTypes(await listProfileEntryTypes()),
          ),
        ]);
        loaded = results.every(Boolean);
      }
      setRefreshedAt(loaded ? new Date() : null);
    } catch (e) {
      logger.error("admin", "Admin load error:", e);
      setLoadErrors({
        [tab]: e instanceof Error ? e.message : String(e || "Unknown error"),
      });
      setRefreshedAt(null);
    } finally {
      setLoading(false);
      setVisited((v) => ({ ...v, [tab]: true }));
    }
  }

  async function loadOrders(
    page: number,
    subTab: OrdersSubTab = ordersSubTab,
  ): Promise<boolean> {
    const status = subTab === "All" ? undefined : subTab.toLowerCase();
    return runAdminLoad("Orders", async () => {
      const result = await listAdminOrders(
        page,
        20,
        status,
        orderQuery.trim() || undefined,
      );
      setOrders(result.orders);
      setOrdersTotal(result.total);
      setOrdersPage(result.page);
      setOrdersTotalPages(result.totalPages);
    });
  }

  async function loadMessages(
    page: number,
    status = messageStatus,
  ): Promise<boolean> {
    return runAdminLoad("Messages", async () => {
      const result = await listAdminMessages(page, 20, status || undefined);
      setMessages(result.messages);
      setMessagesPage(result.page);
      setMessagesTotal(result.total);
      setMessagesTotalPages(result.totalPages);
    });
  }

  async function loadSubscribers(page: number): Promise<boolean> {
    return runAdminLoad("Newsletter subscribers", async () => {
      const result = await listAdminSubscribers(page, 20);
      setSubscribers(result.subscribers);
      setSubscriberPage(result.page);
      setSubscriberTotal(result.total);
      setSubscriberTotalPages(result.totalPages);
    });
  }

  async function loadUsers(page: number): Promise<boolean> {
    return runAdminLoad("Users", async () => {
      const result = await listAdminUsers(
        page,
        10,
        userQuery.trim() || undefined,
      );
      setUsers(result.users);
      setUsersPage(result.page);
      setUsersTotal(result.total);
      setUsersTotalPages(result.totalPages);
    });
  }

  async function loadActivity(page: number): Promise<boolean> {
    return runAdminLoad("Activity", async () => {
      const result = await listAdminActivity(page, 20);
      setActivities(result.entries);
      setActivityPage(result.page);
      setActivityTotal(result.total);
      setActivityTotalPages(result.totalPages);
    });
  }

  async function loadCrashReports(page: number): Promise<boolean> {
    return runAdminLoad("Crash reports", async () => {
      const result = await listDeviceCrashReports(page, 20);
      setCrashReports(result.entries);
      setCrashReportPage(result.page);
      setCrashReportTotal(result.total);
      setCrashReportTotalPages(result.totalPages);
    });
  }

  async function loadAppLogs(page: number): Promise<boolean> {
    return runAdminLoad("App logs", async () => {
      const result = await listAppLogs(page, 20);
      setAppLogs(result.entries);
      setAppLogPage(result.page);
      setAppLogTotal(result.total);
      setAppLogTotalPages(result.totalPages);
    });
  }

  async function loadUserLogs(page: number): Promise<boolean> {
    return runAdminLoad("User logs", async () => {
      const result = await listUserActivityLogs(page, 20);
      setUserLogs(result.entries);
      setUserLogPage(result.page);
      setUserLogTotal(result.total);
      setUserLogTotalPages(result.totalPages);
    });
  }

  async function loadProfileEntries(page: number): Promise<boolean> {
    return runAdminLoad("Profile entries", async () => {
      const result = await listUserProfileEntries(page, 20);
      setProfileEntries(result.entries);
      setProfileEntryPage(result.page);
      setProfileEntryTotal(result.total);
      setProfileEntryTotalPages(result.totalPages);
    });
  }

  async function handleUpdateOrderStatus(orderId: string, status: string) {
    // A rejected write used to disappear as an unhandled rejection, leaving the
    // row looking unchanged with no explanation. Surface it like every other
    // admin write does.
    try {
      await updateOrderStatus(orderId, status);
      void loadOrders(ordersPage);
    } catch (e) {
      logger.error("admin", "Order status update error:", e);
      Alert.alert(
        "Could not update the order",
        e instanceof Error ? e.message : "Please try again.",
      );
    }
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
        ...(seedingProjects ? { projectCategory: null } : {}),
        name: preview?.title || "",
        description: preview?.description || "",
        specs: preview?.specs ?? [],
        image: preview?.images?.[0] || "",
        // U-23 (2026-09-24): seed the FULL gallery so a saved import persists
        // every extracted photo (not just the cover) — "last link sticks".
        gallery: clampGallery(preview?.images ?? []),
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

  async function applyUserRole(
    user: AdminUser,
    role: "customer" | "staff" | "admin",
  ) {
    if (role === user.role) return;
    if (role === "customer" && user.id === currentUser?.id) {
      Alert.alert("Not allowed", "You cannot revoke your own role.");
      return;
    }
    try {
      await toggleAdminRole(user.id, role);
      void loadUsers(usersPage);
    } catch (e) {
      logger.error("admin", "Role change error:", e);
      Alert.alert(
        "Could not change role",
        e instanceof Error ? e.message : "Please try again.",
      );
    }
  }

  // customer < staff < admin; the owner account is fixed. Mirrors the
  // website Users tab (profiles.role via the admin-set-role function).
  function handleToggleUserRole(user: AdminUser) {
    if (!canDelete || user.role === "owner") return;
    const choices: { role: "customer" | "staff" | "admin"; label: string }[] = [
      { role: "customer", label: "Customer" },
      { role: "staff", label: "Staff" },
      { role: "admin", label: "Admin" },
    ];
    Alert.alert(
      "Change role",
      `${user.email} is currently ${user.role}. Choose the new role.`,
      [
        ...choices
          .filter((c) => c.role !== user.role)
          .map((c) => ({
            text: c.label,
            style:
              c.role === "customer"
                ? ("destructive" as const)
                : ("default" as const),
            onPress: () => void applyUserRole(user, c.role),
          })),
        { text: "Cancel", style: "cancel" as const },
      ],
    );
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
    try {
      await markMessageReplied(id);
      void loadMessages(messagesPage);
    } catch (e) {
      logger.error("admin", "Message update error:", e);
      Alert.alert(
        "Could not update the message",
        e instanceof Error ? e.message : "Please try again.",
      );
    }
  }

  function handleDeleteMessage(message: AdminMessage) {
    Alert.alert(
      "Delete message",
      `Delete the message from ${message.name || message.email}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAdminMessage(message.id);
              // Step back a page when the deleted row was the last on it.
              const page =
                messages.length === 1 && messagesPage > 1
                  ? messagesPage - 1
                  : messagesPage;
              void loadMessages(page);
            } catch (e) {
              logger.error("admin", "Message delete error:", e);
              Alert.alert(
                "Could not delete the message",
                e instanceof Error ? e.message : "Please try again.",
              );
            }
          },
        },
      ],
    );
  }

  function handleDeleteSubscriber(subscriber: AdminSubscriber) {
    Alert.alert(
      "Remove subscriber",
      `Remove ${subscriber.email} from the newsletter? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAdminSubscriber(subscriber.id);
              const page =
                subscribers.length === 1 && subscriberPage > 1
                  ? subscriberPage - 1
                  : subscriberPage;
              void loadSubscribers(page);
            } catch (e) {
              logger.error("admin", "Subscriber delete error:", e);
              Alert.alert(
                "Could not remove the subscriber",
                e instanceof Error ? e.message : "Please try again.",
              );
            }
          },
        },
      ],
    );
  }

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
  }, []);

  function renderTabContent(t: Tab) {
    // Each content panel owns its vertical scroll area. Print studio sections
    // are wrapped in the module-level <Sub> (see its comment: declaring the
    // wrapper here remounted every panel on every state change).
    switch (t) {
      case "Dashboard":
        return (
          <Sub>
            <AdminSubTabs
              label="Dashboard sections"
              options={DASHBOARD_SUBTABS}
              value={dashboardSubTab}
              onChange={setDashboardSubTab}
            />
            <AdminSectionPanels
              active={dashboardSubTab}
              panels={[
                {
                  key: "Overview",
                  content: (
                    <DashboardTab
                      stats={stats}
                      analytics={analytics}
                      onOpenOrders={() => goToTab("Orders")}
                    />
                  ),
                },
                {
                  key: "Activity",
                  content: (
                    <ActivityTab
                      activities={activities}
                      page={activityPage}
                      totalPages={activityTotalPages}
                      total={activityTotal}
                      onLoadMore={(p) => loadActivity(p)}
                    />
                  ),
                },
              ]}
            />
          </Sub>
        );
      case "Orders":
        return (
          <Sub>
            <AdminSubTabs
              label="Order sections"
              options={ORDER_PANELS}
              value={ordersPanel}
              onChange={setOrdersPanel}
            />
            {ordersPanel === "Orders" ? (
              <AdminSubTabs
                label="Order status filters"
                options={ORDERS_SUBTABS}
                value={ordersSubTab}
                onChange={(next) => {
                  setOrdersSubTab(next);
                  void loadOrders(1, next);
                }}
              />
            ) : null}
            <AdminSectionPanels
              active={ordersPanel}
              panels={[
                {
                  key: "Orders",
                  content: (
                    <OrdersTab
                      orders={orders}
                      total={ordersTotal}
                      page={ordersPage}
                      totalPages={ordersTotalPages}
                      onPage={(p) => void loadOrders(p)}
                      onStatusChange={handleUpdateOrderStatus}
                      query={orderQuery}
                      onQueryChange={setOrderQuery}
                      onApply={() => void loadOrders(1)}
                    />
                  ),
                },
                {
                  key: "Finance",
                  content: <FinanceTab stats={stats} />,
                },
              ]}
            />
          </Sub>
        );
      case "Electronic Products":
      case "3D Products": {
        const kind = tab === "3D Products" ? "models" : "electronic";
        if (tab === "3D Products" && printSection !== "Catalog") {
          return (
            <Sub>
              <PrintSectionTabs
                value={printSection}
                onChange={setPrintSection}
              />
              <ScrollView
                className="min-h-0 flex-1"
                contentContainerStyle={{
                  paddingHorizontal: 16,
                  paddingTop: 16,
                  paddingBottom: 40,
                }}
                keyboardShouldPersistTaps="handled"
              >
                <PrintAdminPanel
                  section={printSection}
                  canApprove={isAdmin}
                  canDelete={canDelete}
                  approverEmail={currentUser?.email ?? ""}
                />
              </ScrollView>
            </Sub>
          );
        }
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
          <Sub style={{ overflow: "hidden" }}>
            {tab === "3D Products" ? (
              <PrintSectionTabs
                value={printSection}
                onChange={setPrintSection}
              />
            ) : null}
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
          <Sub style={{ overflow: "hidden" }}>
            <ProjectTab
              title="Projects"
              products={products.filter(isProjectPackage)}
              catalogProducts={products}
              editing={editingProject}
              onChange={setEditingProject}
              onEdit={setEditingProject}
              onNew={() => setEditingProject(blankProjectProduct())}
              onSaveProduct={saveProduct}
              canDelete={canDelete}
              onDelete={handleDeleteProduct}
              onToggleActive={(p) => void handleToggleProductActive(p)}
            />
          </Sub>
        );
      case "Settings":
        return (
          <Sub>
            <AdminSubTabs
              label="Settings sections"
              options={SETTINGS_SUBTABS}
              value={settingsSubTab}
              // "Services" here is the storefront list; the print studio has
              // its own. "Content" told staff nothing — it is the home page.
              labels={{ Services: "Storefront services", Content: "Home page" }}
              onChange={setSettingsSubTab}
            />
            <AdminSectionPanels
              active={settingsSubTab}
              panels={[
                {
                  key: "Company",
                  content: (
                    <SettingsTab
                      company={companyInfo}
                      loaded={Boolean(visited.Settings)}
                      setCompany={setCompanyInfo}
                      onCompanySaved={async (next) => {
                        await saveCompanyInfo(next);
                        setCompanyInfo(next);
                      }}
                      onEditingChange={setSettingsEditing}
                    />
                  ),
                },
                {
                  key: "Services",
                  content: (
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
                  ),
                },
                {
                  key: "Journal",
                  content: (
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
                  ),
                },
                {
                  key: "Content",
                  content: (
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
                      onSaveProgram={async (program, _isNew) => {
                        await upsertAdminTrainingProgram(program);
                      }}
                      onDeleteProgram={async (id) => {
                        await deleteAdminTrainingProgram(id);
                      }}
                      pilotCostLines={pilotCostLines}
                      setPilotCostLines={setPilotCostLines}
                      onSavePilotLine={async (line, _isNew) => {
                        await upsertAdminPilotCostLine(line);
                      }}
                      onDeletePilotLine={async (id) => {
                        await deleteAdminPilotCostLine(id);
                      }}
                      curriculumHighlights={curriculumHighlights}
                      setCurriculumHighlights={setCurriculumHighlights}
                      onSaveCurriculum={async (highlight, _isNew) => {
                        await upsertAdminCurriculumHighlight(highlight);
                      }}
                      onDeleteCurriculum={async (id) => {
                        await deleteAdminCurriculumHighlight(id);
                      }}
                      canDelete={canDelete}
                    />
                  ),
                },
              ]}
            />
          </Sub>
        );
      case "Users":
        return (
          <Sub>
            <AdminSubTabs
              label="User administration sections"
              options={USERS_SUBTABS}
              value={usersSubTab}
              onChange={setUsersSubTab}
            />
            <AdminSectionPanels
              active={usersSubTab}
              panels={[
                {
                  key: "Accounts",
                  content: (
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
                    />
                  ),
                },
                {
                  key: "Project profiles",
                  content: <ProjectProfilesTab />,
                },
                {
                  key: "Messages",
                  content: (
                    <MessagesTab
                      messages={messages}
                      total={messagesTotal}
                      page={messagesPage}
                      totalPages={messagesTotalPages}
                      onPage={(p) => void loadMessages(p)}
                      status={messageStatus}
                      onStatusFilter={(s) => {
                        setMessageStatus(s);
                        void loadMessages(1, s);
                      }}
                      onMarkReplied={handleMarkReplied}
                      canDelete={canDelete}
                      onDelete={handleDeleteMessage}
                      subscribers={subscribers}
                      subscriberTotal={subscriberTotal}
                      subscriberPage={subscriberPage}
                      subscriberTotalPages={subscriberTotalPages}
                      onSubscriberPage={(p) => void loadSubscribers(p)}
                      onReloadSubscribers={() => void loadSubscribers(1)}
                      onDeleteSubscriber={handleDeleteSubscriber}
                    />
                  ),
                },
                {
                  key: "Diagnostics",
                  content: (
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
                  ),
                },
              ]}
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
              className={`text-[10px] font-black uppercase tracking-widest ${canDelete ? "text-white" : "text-navy"}`}
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
            hitSlop={4}
            className="h-9 w-9 items-center justify-center rounded-full border border-line"
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
                className={`shrink-0 justify-center border-b-2 px-4 ${tab === t ? "border-navy" : "border-transparent"}`}
                style={{ minWidth: TAB_MIN_WIDTH, minHeight: 44 }}
              >
                <Text
                  numberOfLines={1}
                  className={`text-[11px] font-black uppercase tracking-[0.14em] ${tab === t ? "text-navy" : "text-muted"}`}
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
      <View className="shrink-0 border-b border-line bg-mist px-5 py-2">
        <Text className="text-xs leading-5 text-muted">
          {ADMIN_TAB_HINTS[tab]}
        </Text>
      </View>
      {Object.keys(loadErrors).length > 0 ? (
        <View className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2">
          <Text className="text-xs font-bold text-red-700">
            Some {tab.toLowerCase()} data could not be loaded. Use refresh to
            retry.
          </Text>
          {Object.entries(loadErrors).map(([label, message]) => (
            <Text key={label} className="mt-1 text-[11px] text-red-700">
              {label}: {message}
            </Text>
          ))}
        </View>
      ) : null}

      {/* One tab at a time, full width — the website's mobile view.

          2026-11-14 (owner): this used to be a PagerView filmstrip, which had
          the same three problems as the website's translateX track: both
          panels visible mid-swipe ("split screen"), a page that could be sized
          narrower than the screen, and — on tablets/web — two tabs genuinely
          side by side. A single pane cannot do any of that.

          Tabs mount lazily on first visit so the console does not fire all
          eight loads at once, then stay mounted (display:"none" when
          inactive) so per-tab state and scroll position survive switching. */}
      <View className="min-h-0 flex-1 bg-mist overflow-hidden">
        {TABS.map((t) => (
          <View
            key={t}
            className="flex-1 bg-mist"
            style={{
              ...(tab === t ? undefined : { display: "none" }),
              overflow: "hidden",
            }}
            accessibilityElementsHidden={tab !== t}
            importantForAccessibility={
              tab === t ? "auto" : "no-hide-descendants"
            }
          >
            {visited[t] ? renderTabContent(t) : null}
          </View>
        ))}
      </View>

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
    projectCategory: "",
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

// 2026-11-13 (batch 4): Dashboard used to publish Revenue / Revenue today /
// Transactions / Conversion alongside FinanceTab in the same admin, so the two
// could disagree while their fetches were in flight. Money has one home now
// (Orders → Finance) and the Dashboard points there.
function DashboardTab({
  stats,
  analytics,
  onOpenOrders,
}: {
  stats: DashboardStats | null;
  analytics: AdminAnalytics | null;
  onOpenOrders: () => void;
}) {
  if (!stats) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingVertical: 16,
        paddingBottom: 40,
      }}
    >
      <Text className="font-display text-xl font-bold tracking-tight text-ink">
        Dashboard
      </Text>
      <View className="mt-3 flex-row flex-wrap gap-3">
        <StatCard
          label="Orders"
          value={String(stats.totalOrders)}
          sub={`${stats.pendingOrders} pending`}
        />
        <StatCard
          label="Users"
          value={String(stats.totalUsers)}
          sub={`${stats.newUsersToday} new today`}
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
          label="Page Views (30d)"
          value={analytics ? String(analytics.totalViews) : "—"}
          sub={`Today: ${analytics?.todayViews ?? "—"}`}
        />
      </View>

      <View className="mt-3 rounded-xl border border-line bg-card p-4">
        <Text className="text-[11px] font-black uppercase tracking-[0.14em] text-muted">
          Money
        </Text>
        <Text className="mt-1 text-sm leading-6 text-muted">
          Revenue, transactions and the order status split live in Orders, then
          Finance.
        </Text>
        <Pressable
          onPress={onOpenOrders}
          className="mt-3 self-start rounded-full border border-navy px-4 py-2 active:opacity-70"
        >
          <Text className="text-xs font-black text-navy">Open Orders</Text>
        </Pressable>
      </View>

      {analytics && analytics.topPaths.length > 0 && (
        <View className="mt-3 rounded-xl border border-line bg-card p-4">
          <Text className="font-display text-base font-bold text-ink">
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
          <Text className="font-display text-base font-bold text-ink">
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
  onApply: () => void;
}) {
  const STATUSES = ["pending", "paid", "fulfilled", "cancelled"] as const;
  // Customer-facing order card, so staff can see the receipt the buyer sees.
  const [preview, setPreview] = useState<AdminOrder | null>(null);
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingVertical: 16,
        paddingBottom: 40,
      }}
    >
      {/* Heading + filters */}
      <View className="mb-3">
        <Text className="font-display text-xl font-bold tracking-tight text-ink">
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
                <View className="shrink-0 items-end gap-1">
                  <Text className="text-xs font-bold uppercase text-navy">
                    {o.status}
                  </Text>
                  <Pressable
                    onPress={() => setPreview(o)}
                    className="rounded-lg border border-line px-3 py-1"
                  >
                    <Text className="text-xs font-bold text-ink">Preview</Text>
                  </Pressable>
                </View>
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
      {preview ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setPreview(null)}
        >
          <View className="flex-1 justify-center bg-ink/40 px-4">
            <View className="max-h-full w-full max-w-sm self-center overflow-hidden rounded-2xl border border-line bg-card">
              <ScrollView contentContainerStyle={{ padding: 20 }}>
                <Text className="text-[10px] font-black uppercase tracking-widest text-muted">
                  Order receipt
                </Text>
                <Text className="mt-1 font-display text-xl font-bold tracking-tight text-ink">
                  #{preview.id.slice(0, 8).toUpperCase()}
                </Text>
                <Text className="mt-0.5 text-xs text-muted">
                  {new Date(preview.createdAt).toLocaleString()}
                  {preview.provider ? ` · ${preview.provider}` : ""}
                </Text>
                <Text className="mt-3 rounded-lg bg-mist px-3 py-1.5 text-xs font-bold uppercase text-navy">
                  {preview.status}
                </Text>
                <View className="mt-3 border-t border-line pt-2">
                  {preview.items.map((item, index) => (
                    <View
                      key={`preview-${preview.id}-${index}`}
                      className="flex-row items-start justify-between gap-2 border-b border-line py-2"
                    >
                      <View className="min-w-0 flex-1">
                        <Text
                          className="text-sm font-bold text-ink"
                          numberOfLines={2}
                        >
                          {item.name}
                        </Text>
                        <Text className="mt-0.5 text-xs text-muted">
                          {item.quantity} × NPR{" "}
                          {item.price.toLocaleString("en-IN")}
                        </Text>
                      </View>
                      <Text className="shrink-0 text-sm font-bold text-ink">
                        NPR{" "}
                        {(item.price * item.quantity).toLocaleString("en-IN")}
                      </Text>
                    </View>
                  ))}
                </View>
                <View className="mt-3 flex-row items-center justify-between">
                  <Text className="text-sm font-bold text-ink">Total</Text>
                  <Text className="font-display text-base font-bold text-ink">
                    NPR {preview.totalNpr.toLocaleString("en-IN")}
                  </Text>
                </View>
                <Text className="mt-4 text-[10px] font-black uppercase tracking-widest text-muted">
                  Buyer"s copy
                </Text>
                <Text className="mt-1 text-sm font-bold text-ink">
                  {preview.customerName}
                </Text>
                <Text className="text-xs text-muted">{preview.email}</Text>
                {preview.address ? (
                  <Text className="mt-1 text-xs leading-5 text-muted">
                    {preview.address}
                  </Text>
                ) : null}
                <Pressable
                  onPress={() => setPreview(null)}
                  className="mt-4 rounded-lg border border-line px-4 py-2"
                >
                  <Text className="text-center text-xs font-bold text-ink">
                    Close preview
                  </Text>
                </Pressable>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
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
  // 2026-11-18 (owner: "Add sub-tabs to Electronic Products"): the one long
  // catalog page is now three sections. The catalog list itself is unchanged;
  // Categories answers "what is in this catalog and what is hidden", and
  // Import hosts the link importer that used to be a toolbar button on every
  // screen. Only the electronic catalog gets them — the 3D studio already has
  // its own PrintSectionTabs.
  const [subTab, setSubTab] = useState<ProductSubTab>("Catalog");
  const PAGE_SIZE = 8;
  const categories = [
    "All",
    ...Array.from(new Set(products.map((p) => p.category).filter(Boolean))),
  ];
  const categoryGroups = Array.from(
    products.reduce((groups, product) => {
      const key = product.category || "Uncategorised";
      const group = groups.get(key) ?? {
        name: key,
        total: 0,
        live: 0,
        stock: 0,
        lowest: Number.POSITIVE_INFINITY,
        highest: 0,
      };
      group.total += 1;
      if (product.active) group.live += 1;
      group.stock += Math.max(0, product.stock);
      group.lowest = Math.min(group.lowest, product.price);
      group.highest = Math.max(group.highest, product.price);
      groups.set(key, group);
      return groups;
    }, new Map<string, { name: string; total: number; live: number; stock: number; lowest: number; highest: number }>()),
  ).sort((a, b) => a[0].localeCompare(b[0]));
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
  // Back to page 1 whenever the filter changes — during render, so the list
  // never paints the old page against the new results.
  const filterSig = `${query}|\u0000${category}`;
  const [lastFilterSig, setLastFilterSig] = React.useState(filterSig);
  if (lastFilterSig !== filterSig) {
    setLastFilterSig(filterSig);
    setPage(1);
  }

  if (editing) {
    return (
      <AdminEditorSheet
        full
        visible
        title="Product"
        onClose={() => {
          onEdit(null);
          onImportCancel();
        }}
      >
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
      </AdminEditorSheet>
    );
  }

  return (
    <View className="flex-1">
      {kind === "electronic" ? (
        <AdminSubTabs
          label="Electronic products sections"
          options={PRODUCT_SUBTABS}
          value={subTab}
          onChange={setSubTab}
        />
      ) : null}
      {kind === "electronic" && subTab === "Categories" ? (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingVertical: 16,
            paddingBottom: 40,
          }}
        >
          <Text className="mb-1 font-display text-xl font-bold text-ink">
            Categories ({categoryGroups.length})
          </Text>
          <Text className="mb-3 text-xs text-muted">
            How the /products catalog is filed. Tap a category to open its
            products in the catalog list.
          </Text>
          {categoryGroups.length === 0 ? (
            <Text className="py-8 text-center text-sm text-muted">
              No products yet.
            </Text>
          ) : (
            categoryGroups.map(([name, group]) => (
              <Pressable
                key={name}
                onPress={() => {
                  setCategory(name);
                  setPage(1);
                  setSubTab("Catalog");
                }}
                accessibilityRole="button"
                accessibilityLabel={`Open ${name} in the catalog`}
                className="mb-3 rounded-xl border border-line bg-card p-4"
              >
                <View className="flex-row items-center justify-between gap-2">
                  <Text
                    numberOfLines={1}
                    className="min-w-0 flex-1 text-sm font-bold text-ink"
                  >
                    {name}
                  </Text>
                  <Text className="shrink-0 text-xs font-black text-gold">
                    {group.total} {group.total === 1 ? "item" : "items"}
                  </Text>
                </View>
                <Text className="mt-1 text-xs text-muted">
                  {group.live} visible · {group.total - group.live} hidden ·{" "}
                  {group.stock} in stock ·{" "}
                  {group.lowest === group.highest
                    ? `NPR ${group.lowest.toLocaleString("en-IN")}`
                    : `NPR ${group.lowest.toLocaleString("en-IN")}–${group.highest.toLocaleString("en-IN")}`}
                </Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      ) : kind === "electronic" && subTab === "Import" ? (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingVertical: 16,
            paddingBottom: 40,
          }}
        >
          <Text className="mb-1 font-display text-xl font-bold text-ink">
            Import into Electronic Products
          </Text>
          <Text className="mb-4 text-xs text-muted">
            Paste a supplier or marketplace link and GENUM fills the product
            sheet from that page — name, photos, specs and price. Review every
            field before saving; imports always land as a draft you can edit.
          </Text>
          <Pressable
            onPress={onImportLink}
            disabled={importBusy}
            accessibilityRole="button"
            accessibilityLabel="Import into Electronic Products by link"
            className="self-start rounded-full bg-gold px-5 py-3"
          >
            <Text className="text-xs font-black text-ink">
              {importBusy ? "Importing..." : "Import by link"}
            </Text>
          </Pressable>
          <Text className="mt-3 text-[11px] leading-4 text-muted">
            Prefer a blank sheet? Switch to Catalog and tap + New product.
          </Text>
        </ScrollView>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(p) => p.id}
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingVertical: 16,
            paddingBottom: 40,
          }}
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
                {/* 2026-11-18: on the electronic catalog the importer has its own
                  sub-tab, so the toolbar keeps only + New product here. */}
                {kind === "models" ? (
                  <Pressable
                    onPress={onImportLink}
                    disabled={importBusy}
                    className="self-start rounded-full bg-gold px-4 py-2"
                    accessibilityRole="button"
                    accessibilityLabel="Import into 3D Products by link"
                  >
                    <Text className="text-xs font-black text-ink">
                      {importBusy ? "Importing..." : "Import by link"}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={onNew}
                  className="self-start rounded-full bg-navy px-4 py-2"
                  accessibilityRole="button"
                  accessibilityLabel={`Add a new ${kind === "models" ? "3D product" : "product"}`}
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
              <AdminPager
                page={page}
                totalPages={totalPages}
                onPage={setPage}
              />
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
                      className="min-w-0 flex-1 text-sm font-bold text-ink"
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
                />{" "}
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
      )}
      {preview && (
        <ProductPreviewModal
          product={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </View>
  );
}

const PRODUCT_SUBTABS = ["Catalog", "Categories", "Import"] as const;
type ProductSubTab = (typeof PRODUCT_SUBTABS)[number];

// Editor sections. A retail product keeps its four groups; a project package
// gets the five hierarchy levels the owner asked for (category → pricing →
// code → 3D material → coding procedure).
const PRODUCT_EDITOR_SUBTABS = [
  "Basics",
  "Pricing & stock",
  "Content & specs",
  "Images",
] as const;
const PROJECT_EDITOR_SUBTABS = [
  "Category",
  "Pricing",
  "Code details",
  "3D material details",
  "Coding procedure",
] as const;
type ProjectEditorTab = (typeof PROJECT_EDITOR_SUBTABS)[number];

// 2026-11-18 (owner): Projects now works like the 3D studio — a section strip
// across the whole tab, not just inside one package's editor.
const PROJECT_SECTIONS = [
  "Catalog",
  "Categories",
  "Pricing",
  "Software & features",
  "3D materials",
  "Coding procedure",
] as const;
type ProjectSection = (typeof PROJECT_SECTIONS)[number];

// ── Project editor ──
// Share the website admin's project-category picker (6 categories, excluding
// Remote Controller) so staff filing a new project on the app picks from the
// same buckets the public /projects page filters on (wheeled / smart / drone).
import { PROJECT_CATEGORIES } from "../config/project-catalog";

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
  canDelete: boolean;
  onDelete: (id: string) => void;
  onToggleActive: (p: AdminProduct) => void;
}) {
  const isNew = editing ? !products.some((p) => p.id === editing.id) : false;
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  // 2026-11-18 (owner: "the project tab should have the subtab like the 3d
  // product tabs has to show the categories and costing and project details
  // like software and features"): the tab is now a strip of six sections, the
  // first being the catalogue it always was. The other five are roll-ups across
  // every package — costing state, software, 3D material, procedure — each row
  // opening the editor on the matching sub-tab.
  const [section, setSection] = useState<ProjectSection>("Catalog");
  const [editorStartTab, setEditorStartTab] = useState<string>("Category");
  const [pricingById, setPricingById] = useState<
    Record<string, ProjectPricing>
  >({});
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingAllReload, setPricingAllReload] = useState(0);
  // 2026-11-13: the pricing approval stamp records who approved it.
  const { user: currentUser } = useApp();
  // U-48: this tab saves through onSaveProduct directly (not the guarded
  // parent handler), so it owns its saving flag for the Save button.
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<AdminProduct | null>(null);
  const PAGE_SIZE = 6;
  // 2026-11-18 (owner: "all the project show the robo car project"): this filter
  // grouped by the PRODUCT category ("Robot Cars"), which every project shares,
  // so it could never separate them. Projects are grouped by their own
  // projectCategory (Smart City, Smart Farm, …), labelled from the catalog.
  const projectCategoryName = (p: AdminProduct) =>
    PROJECT_CATEGORIES.find((c) => c.slug === p.projectCategory)?.name ??
    p.projectCategory ??
    "Uncategorised";
  const categories = [
    "All",
    ...Array.from(
      new Set(products.map((p) => projectCategoryName(p)).filter(Boolean)),
    ),
  ];
  // The editor's Category field is the PRODUCT category, not the project family
  // — those are separate fields and must not be mixed up by this filter change.
  const productCategories = Array.from(
    new Set(products.map((p) => p.category).filter(Boolean)),
  );
  const needle = query.trim().toLowerCase();
  const filtered = products.filter(
    (p) =>
      (category === "All" || projectCategoryName(p) === category) &&
      (!needle ||
        `${p.name} ${p.sku} ${p.id} ${p.description}`
          .toLowerCase()
          .includes(needle)),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // Back to page 1 whenever the filter changes — during render, so the list
  // never paints the old page against the new results.
  const filterSig2 = `${query}|\u0000${category}`;
  const [lastFilterSig2, setLastFilterSig2] = React.useState(filterSig2);
  if (lastFilterSig2 !== filterSig2) {
    setLastFilterSig2(filterSig2);
    setPage(1);
  }

  // ── U-45 Phase 2 (2026-09-27): component linker for the OPEN project —
  // mirror of the website's AdminProjectPackages linker. Suggestions run the
  // SAME matcher as the website (src/lib/project-components.ts) locally over
  // the Electronic Products catalog; links save through the staff-gated
  // save_project_components RPC (replace-all, same contract as the web PUT).
  const [linkerLinks, setLinkerLinks] = useState<ProjectComponentLink[]>([]);
  const [linkerBusy, setLinkerBusy] = useState(false);
  const [linkerLoadError, setLinkerLoadError] = useState<string | null>(null);
  const [linkerLoadedId, setLinkerLoadedId] = useState<string | null>(null);
  const [linkerReload, setLinkerReload] = useState(0);
  const linkerProjectId =
    editing?.productType === "Project package" ? editing.id : null;

  // Load saved links + compute fresh suggestions whenever a (saved) project
  // opens in the editor. Keyed on the project ID — not the whole editing
  // object — so staff edits to other fields while the linker is open can't
  // wipe the in-progress link list.
  React.useEffect(() => {
    if (!linkerProjectId) {
      // Clearing the editor's stored link draft on a project change is an
      // event, not a derivation: the empty list is what the sheet must show
      // while the saved rows are (re)loaded below.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- project changed
      setLinkerLinks([]);
      setLinkerLoadError(null);
      setLinkerLoadedId(null);
      return;
    }
    let active = true;
    setLinkerBusy(true);
    setLinkerLoadError(null);
    setLinkerLinks([]);
    setLinkerLoadedId(null);
    void listProjectComponents(linkerProjectId)
      .then((saved) => {
        if (!active) return;
        setLinkerLinks(saved);
        // With no saved links the prefill effect (below) fills from the
        // matcher's confident suggestions once they exist.
        setLinkerLoadedId(linkerProjectId);
      })
      .catch((error: unknown) => {
        if (active) {
          setLinkerLoadError(
            error instanceof Error
              ? error.message
              : "Could not load project component links.",
          );
        }
      })
      .finally(() => {
        if (active) setLinkerBusy(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkerProjectId, linkerReload]);

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
  // Derivable, not stored: same inputs, same suggestions — and storing them
  // meant an effect wrote state on every keystroke of the materials list.
  // The joined materials string is the value that actually changes when the
  // team edits the list, so the memo can depend on it cheaply.
  const materialsSig = editing?.materialsRequired.join("\n") ?? "";
  const linkerSuggestions = React.useMemo<ProjectComponentSuggestion[]>(() => {
    if (!linkerProjectId || !editing) return [];
    return dedupeSuggestions(
      suggestComponents(editing.materialsRequired, linkerCatalog),
    );
    // `editing` is covered by materialsSig: the matcher reads nothing else off
    // the draft, so depending on the object would re-run on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- materials + catalog only
  }, [linkerProjectId, materialsSig, linkerCatalog]);

  // Auto-prefill ONCE per project when nothing is saved yet: first confident
  // matcher suggestions become the editable starting list (web parity).
  React.useEffect(() => {
    if (
      linkerLoadedId &&
      linkerLoadedId === linkerProjectId &&
      linkerLinks.length === 0 &&
      linkerSuggestions.some((s) => s.productId)
    ) {
      // One-shot prefill: runs only while the "loaded once" marker matches
      // and the saved list is empty; the marker is cleared in the same write,
      // so this cannot re-fire.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot prefill
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

  // ── 2026-11-13: project pricing (mirror of the website's Pricing panel) ──
  // Per-project-package rates live in public.project_pricing and are DRAFT
  // until an admin approves them — the public page and the app then show
  // "rate on request". Approval is admin-only (website parity); the estimate
  // below uses the same estimateProject maths as the customer calculator.
  const pricingProjectId =
    editing?.productType === "Project package" &&
    products.some((p) => p.id === editing.id)
      ? editing.id
      : null;
  const [projectPricing, setProjectPricing] = useState<ProjectPricing>(
    defaultProjectPricing,
  );
  const [pricingBusy, setPricingBusy] = useState(false);
  const [pricingLoadError, setPricingLoadError] = useState<string | null>(null);
  const [pricingReload, setPricingReload] = useState(0);

  React.useEffect(() => {
    if (!pricingProjectId) {
      // The pricing draft is per project; with no project open the blank
      // draft is the reset, and it has to land before the sheet renders.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- project changed
      setProjectPricing(defaultProjectPricing);
      setPricingLoadError(null);
      return;
    }
    let active = true;
    setPricingBusy(true);
    setPricingLoadError(null);
    setProjectPricing(defaultProjectPricing);
    void getAdminProjectPricing(pricingProjectId)
      .then((pricing) => {
        if (active) setProjectPricing(pricing);
      })
      .catch((error: unknown) => {
        if (active) {
          setPricingLoadError(
            error instanceof Error
              ? error.message
              : "Could not load project pricing.",
          );
        }
      })
      .finally(() => {
        if (active) setPricingBusy(false);
      });
    return () => {
      active = false;
    };
  }, [pricingProjectId, pricingReload]);

  async function saveProjectPricing_() {
    if (!pricingProjectId) return;
    setPricingBusy(true);
    try {
      await saveAdminProjectPricing({
        ...projectPricing,
        id: pricingProjectId,
      });
      Alert.alert("Saved", "Project pricing saved.");
    } catch (e) {
      Alert.alert(
        "Save failed",
        e instanceof Error ? e.message : "Could not save the project pricing.",
      );
    } finally {
      setPricingBusy(false);
    }
  }

  async function toggleProjectPricingApproval_() {
    if (!pricingProjectId) return;
    const approved = projectPricing.priceStatus !== "approved";
    setPricingBusy(true);
    try {
      const approvedBy = currentUser?.email ?? "admin";
      await setAdminProjectPricingApproval(
        pricingProjectId,
        approved,
        approvedBy,
      );
      setProjectPricing((prev) => ({
        ...prev,
        priceStatus: approved ? "approved" : "draft",
        priceApprovedAt: approved ? new Date().toISOString() : null,
        priceApprovedBy: approved ? approvedBy : "",
      }));
    } catch (e) {
      Alert.alert(
        "Update failed",
        e instanceof Error ? e.message : "Could not update the pricing status.",
      );
    } finally {
      setPricingBusy(false);
    }
  }

  // Admin preview ignores the approval gate on purpose: the owner should see
  // the number these rules produce BEFORE deciding to publish them.
  const pricingEstimate = estimateProject({
    pricing: { ...projectPricing, priceStatus: "approved" },
    links: linkerLinks,
    catalogPrices: new Map(catalogProducts.map((p) => [p.id, p.price])),
  });

  // The Pricing section needs every package's row at once; it is loaded when
  // the section is opened (and on demand from its retry button), so the
  // catalog stays free of an extra query.
  React.useEffect(() => {
    if (section !== "Pricing") return;
    let active = true;
    setPricingLoading(true);
    setPricingError(null);
    void listAdminProjectPricing()
      .then((rows) => {
        if (active) setPricingById(rows);
      })
      .catch(() => {
        if (active) setPricingError("Could not load the project pricing.");
      })
      .finally(() => {
        if (active) setPricingLoading(false);
      });
    return () => {
      active = false;
    };
  }, [section, pricingAllReload]);

  const openEditorAt = (product: AdminProduct, tab: ProjectEditorTab) => {
    setEditorStartTab(tab);
    onEdit(product);
  };

  if (editing) {
    return (
      <AdminEditorSheet
        full
        visible
        title="Project package"
        onClose={() => onChange(null)}
      >
        <ProductEditor
          key={`${editing.id}-${editorStartTab}`}
          product={editing}
          initialSection={editorStartTab}
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
          categoryOptions={productCategories}
          pricingCard={
            pricingProjectId ? (
              <ProjectPricingCard
                pricing={projectPricing}
                estimate={pricingEstimate}
                busy={pricingBusy}
                loadError={pricingLoadError}
                onRetry={() => setPricingReload((version) => version + 1)}
                canApprove={canDelete}
                componentCount={linkerLinks.length}
                onChange={setProjectPricing}
                onSave={() => void saveProjectPricing_()}
                onToggleApproval={() => void toggleProjectPricingApproval_()}
              />
            ) : null
          }
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
            loadError={linkerLoadError}
            onRetry={() => setLinkerReload((version) => version + 1)}
            products={catalogProducts}
            onLinksChange={setLinkerLinks}
            onSave={() => void saveComponentLinks()}
          />
        ) : null}
      </AdminEditorSheet>
    );
  }

  return (
    <View className="flex-1">
      <AdminSubTabs
        label="Project sections"
        options={PROJECT_SECTIONS}
        value={section}
        onChange={setSection}
      />
      {section !== "Catalog" ? (
        <ProjectSectionPanel
          section={section}
          products={products}
          pricingById={pricingById}
          pricingLoading={pricingLoading}
          pricingError={pricingError}
          onRetryPricing={() => setPricingAllReload((v) => v + 1)}
          onOpen={openEditorAt}
          onFilterCategory={(name) => {
            setCategory(name);
            setSection("Catalog");
          }}
        />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(p) => p.id}
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingVertical: 16,
            paddingBottom: 40,
          }}
          ListHeaderComponent={
            <View className="mb-3">
              <Text className="font-display text-xl font-bold tracking-tight text-ink">
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
              <AdminPager
                page={page}
                totalPages={totalPages}
                onPage={setPage}
              />
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
                  />{" "}
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
      )}
      {preview && (
        <ProductPreviewModal
          product={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </View>
  );
}

// ── Project section roll-ups ──────────────────────────────────────────
// 2026-11-18 (owner): the Projects tab mirrors the 3D studio's section strip.
// Catalog keeps the list; the other five sections answer, across every package
// at once: how is it filed, is its quote published, is its software/3D/procedure
// documentation filled in. Each row opens that package's editor on the matching
// sub-tab, so nothing here is a dead end.
function ProjectSectionPanel({
  section,
  products,
  pricingById,
  pricingLoading,
  pricingError,
  onRetryPricing,
  onOpen,
  onFilterCategory,
}: {
  section: Exclude<ProjectSection, "Catalog">;
  products: AdminProduct[];
  pricingById: Record<string, ProjectPricing>;
  pricingLoading: boolean;
  pricingError: string | null;
  onRetryPricing: () => void;
  onOpen: (product: AdminProduct, tab: ProjectEditorTab) => void;
  onFilterCategory: (name: string) => void;
}) {
  const familyOf = (p: AdminProduct) =>
    PROJECT_CATEGORIES.find((c) => c.slug === p.projectCategory)?.name ??
    p.projectCategory ??
    "Uncategorised";
  const money = (value: number) =>
    `NPR ${Math.round(value).toLocaleString("en-IN")}`;
  const total = products.length;

  const families = Array.from(
    products.reduce((groups, product) => {
      const key = familyOf(product);
      const group = groups.get(key) ?? {
        name: key,
        total: 0,
        live: 0,
        lowest: Number.POSITIVE_INFINITY,
        highest: 0,
      };
      group.total += 1;
      if (product.active) group.live += 1;
      group.lowest = Math.min(group.lowest, product.price);
      group.highest = Math.max(group.highest, product.price);
      groups.set(key, group);
      return groups;
    }, new Map<string, { name: string; total: number; live: number; lowest: number; highest: number }>()),
  ).sort((a, b) => b[1].total - a[1].total);

  const approved = products.filter(
    (p) => pricingById[p.id]?.priceStatus === "approved",
  ).length;
  const draft = products.filter((p) => {
    const row = pricingById[p.id];
    return row != null && row.priceStatus !== "approved";
  }).length;
  const missingPricing = total - approved - draft;

  const empty = (
    <Text className="py-8 text-center text-sm text-muted">
      No project packages yet.
    </Text>
  );

  const header = (
    <>
      <Text className="font-display text-xl font-bold tracking-tight text-ink">
        {section}
      </Text>
      <Text className="mb-3 mt-1 text-xs leading-5 text-muted">
        {section === "Categories"
          ? "How the company's projects are filed. Tap a family to open its packages in the catalog."
          : section === "Pricing"
            ? "Every package's quote state. Draft prices stay hidden from customers until an admin approves them."
            : section === "Software & features"
              ? "Toolchain, repository and the feature list each package documents for its builder."
              : section === "3D materials"
                ? "What each package is printed from: materials, printer profile and print settings."
                : "The build and flashing procedure each package ships with."}
      </Text>
    </>
  );

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingVertical: 16,
        paddingBottom: 40,
      }}
    >
      {header}

      {section === "Categories"
        ? families.length === 0
          ? empty
          : families.map(([name, group]) => (
              <Pressable
                key={name}
                onPress={() => onFilterCategory(name)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${name} packages in the catalog`}
                className="mb-3 rounded-xl border border-line bg-card p-4"
              >
                <View className="flex-row items-center justify-between gap-2">
                  <Text
                    numberOfLines={1}
                    className="min-w-0 flex-1 text-sm font-bold text-ink"
                  >
                    {name}
                  </Text>
                  <Text className="shrink-0 text-xs font-black text-gold">
                    {group.total} {group.total === 1 ? "package" : "packages"}
                  </Text>
                </View>
                <Text className="mt-1 text-xs text-muted">
                  {group.live} live · {group.total - group.live} hidden ·{" "}
                  {group.lowest === group.highest
                    ? money(group.lowest)
                    : `${money(group.lowest)}–${money(group.highest)}`}
                </Text>
              </Pressable>
            ))
        : null}

      {section === "Pricing" ? (
        <>
          <View className="mb-3 rounded-xl border border-line bg-card p-4">
            <Text className="text-xs font-black uppercase tracking-widest text-muted">
              Quote state
            </Text>
            <Text className="mt-1 text-sm text-ink">
              {approved} approved · {draft} draft · {missingPricing} without a
              pricing row
            </Text>
            <Text className="mt-1 text-[11px] leading-4 text-muted">
              A package without a row uses the editor defaults (zero base
              charge, no markup) and its prices stay hidden until approved.
            </Text>
          </View>
          {pricingLoading ? (
            <Text className="py-6 text-center text-sm text-muted">
              Loading pricing…
            </Text>
          ) : pricingError ? (
            <View className="mb-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <Text className="text-sm font-bold text-red-700">
                {pricingError}
              </Text>
              <Pressable
                onPress={onRetryPricing}
                accessibilityRole="button"
                accessibilityLabel="Retry loading project pricing"
                className="mt-2 self-start rounded-full bg-navy px-4 py-2"
              >
                <Text className="text-xs font-black text-white">Retry</Text>
              </Pressable>
            </View>
          ) : total === 0 ? (
            empty
          ) : (
            products.map((product) => {
              const row = pricingById[product.id];
              const isApproved = row?.priceStatus === "approved";
              return (
                <View
                  key={product.id}
                  className="mb-3 rounded-xl border border-line bg-card p-4"
                >
                  <View className="flex-row items-center justify-between gap-2">
                    <Text
                      numberOfLines={1}
                      className="min-w-0 flex-1 text-sm font-bold text-ink"
                    >
                      {product.name}
                    </Text>
                    <Text
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${isApproved ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}
                    >
                      {row ? (isApproved ? "Approved" : "Draft") : "No row"}
                    </Text>
                  </View>
                  <Text className="mt-1 text-xs text-muted">
                    {familyOf(product)}
                  </Text>
                  <Text className="mt-2 text-xs text-ink">
                    Base {money(row?.packageBaseCharge ?? 0)} · markup{" "}
                    {row?.componentMarkupPercent ?? 0}% · minimum{" "}
                    {money(row?.minimumOrder ?? 0)}
                  </Text>
                  <Text className="mt-1 text-[11px] text-muted">
                    {row?.extras.length
                      ? `${row.extras.length} extras`
                      : "No extras"}{" "}
                    ·{" "}
                    {row?.bulkTiers.length
                      ? `${row.bulkTiers.length} bulk tiers`
                      : "No bulk tiers"}
                    {row?.priceApprovedAt
                      ? ` · approved ${row.priceApprovedAt.slice(0, 10)}`
                      : ""}
                  </Text>
                  <View className="mt-2 flex-row flex-wrap gap-2">
                    <AdminAction
                      onPress={() => onOpen(product, "Pricing")}
                      label="Edit pricing"
                      tone="navy"
                    />
                  </View>
                </View>
              );
            })
          )}
        </>
      ) : null}

      {section === "Software & features"
        ? total === 0
          ? empty
          : products.map((product) => {
              const details = readProjectDetails(product.importMeta);
              const checks = [
                Boolean(details.code.language.trim()),
                Boolean(details.code.repositoryUrl.trim()),
                Boolean(details.code.libraries.trim()),
                Boolean(product.objectives.length),
                Boolean(product.controlMethods.length),
                Boolean(product.specs.length),
              ];
              const filled = checks.filter(Boolean).length;
              return (
                <View
                  key={product.id}
                  className="mb-3 rounded-xl border border-line bg-card p-4"
                >
                  <View className="flex-row items-center justify-between gap-2">
                    <Text
                      numberOfLines={1}
                      className="min-w-0 flex-1 text-sm font-bold text-ink"
                    >
                      {product.name}
                    </Text>
                    <Text className="shrink-0 text-xs font-black text-navy">
                      {filled}/6
                    </Text>
                  </View>
                  <Text className="mt-1 text-xs text-muted">
                    {familyOf(product)}
                  </Text>
                  <Text className="mt-2 text-xs leading-5 text-ink">
                    {details.code.language || "No toolchain set"}
                    {details.code.repositoryUrl
                      ? " · repo linked"
                      : " · no repo"}
                    {details.code.libraries.trim()
                      ? ` · ${details.code.libraries.split("\n").filter(Boolean).length} libraries`
                      : ""}
                  </Text>
                  <Text className="mt-1 text-[11px] text-muted">
                    {product.objectives.length} objectives ·{" "}
                    {product.controlMethods.length} control methods ·{" "}
                    {product.specs.length} features listed
                  </Text>
                  <View className="mt-2 flex-row flex-wrap gap-2">
                    <AdminAction
                      onPress={() => onOpen(product, "Code details")}
                      label="Edit code & features"
                      tone="navy"
                    />
                  </View>
                </View>
              );
            })
        : null}

      {section === "3D materials"
        ? total === 0
          ? empty
          : products.map((product) => {
              const details = readProjectDetails(product.importMeta);
              return (
                <View
                  key={product.id}
                  className="mb-3 rounded-xl border border-line bg-card p-4"
                >
                  <Text
                    numberOfLines={1}
                    className="text-sm font-bold text-ink"
                  >
                    {product.name}
                  </Text>
                  <Text className="mt-1 text-xs text-muted">
                    {familyOf(product)}
                  </Text>
                  <Text className="mt-2 text-xs leading-5 text-ink">
                    {details.material.printer || "No printer set"} ·{" "}
                    {details.material.filament || "No filament set"}
                  </Text>
                  <Text className="mt-1 text-[11px] text-muted">
                    {details.material.layerHeight || "—"} layer ·{" "}
                    {details.material.infill || "—"} infill ·{" "}
                    {details.material.printTime || "no print time"} ·{" "}
                    {product.materialsRequired.length} materials listed
                  </Text>
                  <View className="mt-2 flex-row flex-wrap gap-2">
                    <AdminAction
                      onPress={() => onOpen(product, "3D material details")}
                      label="Edit 3D materials"
                      tone="navy"
                    />
                  </View>
                </View>
              );
            })
        : null}

      {section === "Coding procedure"
        ? total === 0
          ? empty
          : products.map((product) => {
              const details = readProjectDetails(product.importMeta);
              return (
                <View
                  key={product.id}
                  className="mb-3 rounded-xl border border-line bg-card p-4"
                >
                  <Text
                    numberOfLines={1}
                    className="text-sm font-bold text-ink"
                  >
                    {product.name}
                  </Text>
                  <Text className="mt-1 text-xs text-muted">
                    {familyOf(product)}
                  </Text>
                  <Text className="mt-2 text-xs leading-5 text-ink">
                    {product.buildSteps.length} build steps ·{" "}
                    {details.procedure.steps.length} coding steps
                  </Text>
                  <Text className="mt-1 text-[11px] text-muted">
                    {product.estimatedDuration || "No duration set"}
                    {details.procedure.notes
                      ? " · notes added"
                      : " · no procedure notes"}
                  </Text>
                  <View className="mt-2 flex-row flex-wrap gap-2">
                    <AdminAction
                      onPress={() => onOpen(product, "Coding procedure")}
                      label="Edit procedure"
                      tone="navy"
                    />
                  </View>
                </View>
              );
            })
        : null}
    </ScrollView>
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
  loadError,
  onRetry,
  products,
  onLinksChange,
  onSave,
}: {
  links: ProjectComponentLink[];
  suggestions: ProjectComponentSuggestion[];
  busy: boolean;
  loadError: string | null;
  onRetry: () => void;
  products: AdminProduct[];
  onLinksChange: (next: ProjectComponentLink[]) => void;
  onSave: () => void;
}) {
  if (loadError) {
    return (
      <View className="mx-4 mb-6 mt-3 rounded-xl border border-red-300 bg-card p-4">
        <Text className="text-sm font-bold text-red-600">
          Could not load project component links: {loadError}
        </Text>
        <Pressable
          onPress={onRetry}
          className="mt-3 self-start rounded-full border border-line px-4 py-2"
          accessibilityRole="button"
          accessibilityLabel="Retry loading component links"
        >
          <Text className="text-xs font-bold text-ink">Retry</Text>
        </Pressable>
      </View>
    );
  }

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

// ─── 2026-11-13: project pricing card ──────────────────────
// Mirrors the website's Admin → Projects → Pricing panel: package base
// charge, component markup, optional extras, bulk tiers, minimum order,
// approve/withdraw and a live estimate built from the project's linked
// components. Draft by default — nothing is shown to customers until an
// admin approves.
function ProjectPricingCard({
  pricing,
  estimate,
  busy,
  loadError,
  onRetry,
  canApprove,
  componentCount,
  onChange,
  onSave,
  onToggleApproval,
}: {
  pricing: ProjectPricing;
  estimate: ReturnType<typeof estimateProject>;
  busy: boolean;
  loadError: string | null;
  onRetry: () => void;
  canApprove: boolean;
  componentCount: number;
  onChange: (next: ProjectPricing) => void;
  onSave: () => void;
  onToggleApproval: () => void;
}) {
  const inputClass =
    "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink";
  const patch = (part: Partial<ProjectPricing>) =>
    onChange({ ...pricing, ...part });
  const approved = pricing.priceStatus === "approved";

  if (loadError) {
    return (
      <View className="mt-4 rounded-xl border border-red-300 bg-card p-3">
        <Text className="text-sm font-bold text-red-600">
          Could not load project pricing: {loadError}
        </Text>
        <Pressable
          onPress={onRetry}
          className="mt-3 self-start rounded-full border border-line px-4 py-2"
          accessibilityRole="button"
          accessibilityLabel="Retry loading project pricing"
        >
          <Text className="text-xs font-bold text-ink">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="mt-4 rounded-xl border-2 border-gold bg-card p-3">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="flex-1 font-display text-base font-bold text-ink">
          Pricing
        </Text>
        <Pressable
          onPress={onSave}
          disabled={busy}
          className="rounded-full bg-navy px-4 py-2 disabled:opacity-60"
          accessibilityRole="button"
          accessibilityLabel="Save project pricing"
        >
          <Text className="text-xs font-black text-white">
            {busy ? "Saving…" : "Save pricing"}
          </Text>
        </Pressable>
      </View>
      <Text className="mt-1 text-xs leading-5 text-muted">
        Base charge + the catalog components linked below (with markup) +
        extras, bulk tiers and a minimum order. Customers see "rate on request"
        until you approve.
      </Text>

      <View className="mt-3 flex-row items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
        <Text className="min-w-0 flex-1 text-xs leading-4 text-muted">
          {approved
            ? `Published${pricing.priceApprovedBy ? ` by ${pricing.priceApprovedBy}` : ""}${pricing.priceApprovedAt ? ` on ${new Date(pricing.priceApprovedAt).toLocaleDateString()}` : ""}`
            : "Draft — customers see rate on request"}
        </Text>
        {canApprove ? (
          <Pressable
            onPress={onToggleApproval}
            disabled={busy}
            className={`rounded-full px-3 py-2 disabled:opacity-60 ${approved ? "border border-line bg-card" : "bg-gold"}`}
            accessibilityRole="button"
            accessibilityLabel={
              approved ? "Withdraw rates" : "Approve and publish rates"
            }
          >
            <Text className="text-xs font-black text-ink">
              {approved ? "Withdraw" : "Approve"}
            </Text>
          </Pressable>
        ) : (
          <Text className="text-[10px] font-black uppercase tracking-widest text-muted">
            Admin only
          </Text>
        )}
      </View>

      <View className="mt-3 flex-row gap-2">
        <View className="flex-1">
          <Text className="mb-1 text-sm font-bold text-ink">
            Base charge (NPR)
          </Text>
          <TextInput
            value={String(pricing.packageBaseCharge)}
            onChangeText={(raw) =>
              patch({
                packageBaseCharge: Math.max(0, Math.round(Number(raw) || 0)),
              })
            }
            keyboardType="number-pad"
            className={inputClass}
            accessibilityLabel="Package base charge"
          />
        </View>
        <View className="flex-1">
          <Text className="mb-1 text-sm font-bold text-ink">Markup (%)</Text>
          <TextInput
            value={String(pricing.componentMarkupPercent)}
            onChangeText={(raw) =>
              patch({
                componentMarkupPercent: Math.max(
                  0,
                  Math.min(500, Math.round(Number(raw) || 0)),
                ),
              })
            }
            keyboardType="number-pad"
            className={inputClass}
            accessibilityLabel="Component markup percent"
          />
        </View>
        <View className="flex-1">
          <Text className="mb-1 text-sm font-bold text-ink">Minimum (NPR)</Text>
          <TextInput
            value={String(pricing.minimumOrder)}
            onChangeText={(raw) =>
              patch({ minimumOrder: Math.max(0, Math.round(Number(raw) || 0)) })
            }
            keyboardType="number-pad"
            className={inputClass}
            accessibilityLabel="Minimum order"
          />
        </View>
      </View>

      <Text className="mb-1 mt-3 text-sm font-bold text-ink">
        Internal note (not shown to customers)
      </Text>
      <TextInput
        value={pricing.note}
        onChangeText={(note) => patch({ note: note.slice(0, 300) })}
        className={inputClass}
        placeholder="Why these rates…"
        accessibilityLabel="Pricing note"
      />

      {/* extras */}
      <View className="mt-4 border-t border-line pt-3">
        <Text className="text-xs font-bold text-ink">
          Optional extras (flat NPR add-ons)
        </Text>
        {pricing.extras.map((extra, index) => (
          <View
            key={`${extra.id}-${index}`}
            className="mt-2 flex-row items-center gap-2"
          >
            <TextInput
              value={extra.name}
              onChangeText={(name) =>
                patch({
                  extras: pricing.extras.map((x, i) =>
                    i === index ? { ...x, name: name.slice(0, 60) } : x,
                  ),
                })
              }
              className={`min-w-0 flex-1 ${inputClass}`}
              placeholder="e.g. On-site training"
              accessibilityLabel={`Extra ${index + 1} name`}
            />
            <TextInput
              value={String(extra.amount)}
              onChangeText={(raw) =>
                patch({
                  extras: pricing.extras.map((x, i) =>
                    i === index
                      ? {
                          ...x,
                          amount: Math.max(0, Math.round(Number(raw) || 0)),
                        }
                      : x,
                  ),
                })
              }
              keyboardType="number-pad"
              className="w-24 rounded-lg border border-line bg-surface px-3 py-2 text-right text-sm text-ink"
              accessibilityLabel={`Extra ${index + 1} amount`}
            />
            <Pressable
              onPress={() =>
                patch({ extras: pricing.extras.filter((_, i) => i !== index) })
              }
              accessibilityRole="button"
              accessibilityLabel={`Remove extra ${index + 1}`}
            >
              <Text className="text-xs font-bold text-red-500">Remove</Text>
            </Pressable>
          </View>
        ))}
        <Pressable
          onPress={() =>
            patch({
              extras: [
                ...pricing.extras,
                {
                  id: `extra-${pricing.extras.length + 1}`,
                  name: "",
                  amount: 0,
                },
              ],
            })
          }
          className="mt-2 self-start rounded-full border border-line px-3 py-1.5"
          accessibilityRole="button"
          accessibilityLabel="Add extra"
        >
          <Text className="text-xs font-black text-ink">+ Add extra</Text>
        </Pressable>
      </View>

      {/* bulk tiers */}
      <View className="mt-4 border-t border-line pt-3">
        <Text className="text-xs font-bold text-ink">
          Bulk tiers (total component qty → % off)
        </Text>
        {pricing.bulkTiers.map((tier, index) => (
          <View
            key={`tier-${index}`}
            className="mt-2 flex-row items-center gap-2"
          >
            <Text className="text-sm font-bold text-ink">Min qty</Text>
            <TextInput
              value={String(tier.minQty)}
              onChangeText={(raw) =>
                patch({
                  bulkTiers: pricing.bulkTiers.map((t, i) =>
                    i === index
                      ? {
                          ...t,
                          minQty: Math.max(1, Math.round(Number(raw) || 1)),
                        }
                      : t,
                  ),
                })
              }
              keyboardType="number-pad"
              className="w-16 rounded-lg border border-line bg-surface px-2 py-2 text-right text-sm text-ink"
              accessibilityLabel={`Tier ${index + 1} minimum quantity`}
            />
            <Text className="text-sm font-bold text-ink">Discount %</Text>
            <TextInput
              value={String(tier.discountPercent)}
              onChangeText={(raw) =>
                patch({
                  bulkTiers: pricing.bulkTiers.map((t, i) =>
                    i === index
                      ? {
                          ...t,
                          discountPercent: Math.min(
                            90,
                            Math.max(0, Math.round(Number(raw) || 0)),
                          ),
                        }
                      : t,
                  ),
                })
              }
              keyboardType="number-pad"
              className="w-16 rounded-lg border border-line bg-surface px-2 py-2 text-right text-sm text-ink"
              accessibilityLabel={`Tier ${index + 1} discount percent`}
            />
            <Pressable
              onPress={() =>
                patch({
                  bulkTiers: pricing.bulkTiers.filter((_, i) => i !== index),
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Remove tier ${index + 1}`}
            >
              <Text className="text-xs font-bold text-red-500">Remove</Text>
            </Pressable>
          </View>
        ))}
        <Pressable
          onPress={() =>
            patch({
              bulkTiers: [
                ...pricing.bulkTiers,
                { minQty: 10, discountPercent: 5 },
              ],
            })
          }
          className="mt-2 self-start rounded-full border border-line px-3 py-1.5"
          accessibilityRole="button"
          accessibilityLabel="Add bulk tier"
        >
          <Text className="text-xs font-black text-ink">+ Add tier</Text>
        </Pressable>
      </View>

      {/* live estimate (computed as if published) */}
      <View className="mt-4 rounded-lg border border-line bg-surface p-3">
        <Text className="text-[10px] font-black uppercase tracking-widest text-navy">
          Estimate preview
        </Text>
        <Text className="mt-1 font-display text-xl font-bold text-ink">
          {formatNPR(estimate.total)}
        </Text>
        <Text className="mt-1 text-xs leading-4 text-muted">
          {componentCount} linked component{componentCount === 1 ? "" : "s"} ·
          base {formatNPR(estimate.packageBaseCharge)} · components{" "}
          {formatNPR(estimate.componentsTotal)}
          {estimate.extrasTotal > 0
            ? ` · extras ${formatNPR(estimate.extrasTotal)}`
            : ""}
          {estimate.discountPercent > 0
            ? ` · −${formatNPR(estimate.discountAmount)} (${estimate.discountPercent}%)`
            : ""}
          {estimate.minimumApplied
            ? ` · minimum ${formatNPR(estimate.minimumOrder)}`
            : ""}
        </Text>
        {!approved ? (
          <Text className="mt-1 text-[10px] font-bold text-gold">
            Draft preview — approve above to publish this price.
          </Text>
        ) : null}
      </View>
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
  pricingCard,
  initialSection,
}: {
  product: AdminProduct;
  onChange: (next: AdminProduct) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew: boolean;
  categoryOptions: string[];
  fromLink?: boolean;
  saving?: boolean;
  /** 2026-11-13: project pricing panel (rendered inside the project block). */
  pricingCard?: React.ReactNode;
  /**
   * 2026-11-18: which section the sheet opens on. Projects opens from the
   * Catalog list (Category), from the Pricing/Software/3D/Procedure roll-ups
   * (that section), or from Products (undefined → the product default).
   */
  initialSection?: string;
}) {
  // 2026-11-14: full-size preview of an imported photo. Imported images are
  // 64–80px thumbnails; staff could not tell a correct model from a wrong one.
  const [imagePreview, setImagePreview] = useState<{
    uri: string;
    label: string;
  } | null>(null);

  function patch(patchPart: Partial<AdminProduct>) {
    onChange({ ...product, ...patchPart });
  }

  const inputClass =
    "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink";
  const isProject =
    product.productType === "Project package" ||
    product.category === "Robot Cars" ||
    product.category === "Pre-packaged Kits";

  // 2026-11-18 (owner): the project sheet was one 900-line scroll of twenty
  // fields. It is now the hierarchy the owner asked for — Category, Pricing,
  // Code details, 3D material details, Coding procedure — one panel at a time.
  // Retail products keep their four groups (Basics / Pricing & stock / Content
  // & specs / Images) with the same treatment so both editors behave alike.
  const editorTabs: readonly string[] = isProject
    ? PROJECT_EDITOR_SUBTABS
    : PRODUCT_EDITOR_SUBTABS;
  const [editorSubTab, setEditorSubTab] = useState<string>(
    initialSection ?? (isProject ? "Category" : "Basics"),
  );
  const projectDetails = readProjectDetails(product.importMeta);
  const patchDetails = (next: ProjectDetails) =>
    patch({ importMeta: writeProjectDetails(product.importMeta, next) });

  // The project-only field groups, one per hierarchy level. Keeping them as
  // fragments (rather than five copies of EditoSection) is what lets the tab
  // strip above render exactly one level at a time.
  const projectCategoryFields = (
    <>
      <Text className="mb-1 text-sm font-bold text-ink">Project category</Text>
      <View className="mb-3">
        <CategoryDropdown
          value={product.projectCategory || ""}
          options={PROJECT_CATEGORIES.filter(
            (c) => c.slug !== "remote-controller",
          ).map((c) => c.name)}
          onChange={(projectCategory) =>
            patch({ projectCategory: projectCategory || null })
          }
          placeholder="Select a project category"
          title="Project category"
          allowCustom={false}
        />
      </View>
      <Text className="mb-1 text-sm font-bold text-ink">Project overview</Text>
      <TextInput
        value={product.projectOverview}
        onChangeText={(projectOverview) => patch({ projectOverview })}
        multiline
        style={{ textAlignVertical: "top" }}
        className={`mb-3 min-h-20 ${inputClass}`}
        placeholder="Fully-built demo car with instructions…"
      />
      <Text className="mb-1 text-sm font-bold text-ink">
        Objectives (one per line)
      </Text>
      <TextInput
        value={product.objectives.join("\n")}
        onChangeText={(v) => patch({ objectives: toStringArrayLines(v) })}
        multiline
        className={`mb-3 ${inputClass}`}
        placeholder="Control motors and servo via ESP32…"
      />
      <Text className="mb-1 text-sm font-bold text-ink">
        Learning outcomes (one per line)
      </Text>
      <TextInput
        value={product.learningOutcomes.join("\n")}
        onChangeText={(v) => patch({ learningOutcomes: toStringArrayLines(v) })}
        multiline
        className={`mb-3 ${inputClass}`}
        placeholder="Understand PWM signal control…"
      />
      <Text className="mb-1 text-sm font-bold text-ink">
        Prerequisites (one per line)
      </Text>
      <TextInput
        value={product.prerequisites.join("\n")}
        onChangeText={(v) => patch({ prerequisites: toStringArrayLines(v) })}
        multiline
        className={`mb-3 ${inputClass}`}
        placeholder="Basic wiring knowledge…"
      />
      <Text className="mb-1 text-sm font-bold text-ink">
        Deliverables (one per line)
      </Text>
      <TextInput
        value={product.deliverables.join("\n")}
        onChangeText={(v) => patch({ deliverables: toStringArrayLines(v) })}
        multiline
        className={`mb-3 ${inputClass}`}
        placeholder="Fully assembled robot car…"
      />
      <Text className="mb-1 text-sm font-bold text-ink">Audience</Text>
      <TextInput
        value={product.audience}
        onChangeText={(audience) => patch({ audience })}
        className={`mb-3 ${inputClass}`}
        placeholder="Students, Makers, Hobbyists"
      />
      <Text className="mb-1 text-sm font-bold text-ink">Difficulty</Text>
      <View className="mb-3">
        <CategoryDropdown
          value={product.difficulty || "Beginner"}
          options={["Beginner", "Intermediate", "Advanced", "Professional"]}
          onChange={(difficulty) => patch({ difficulty })}
          placeholder="Difficulty"
          title="Difficulty"
        />
      </View>
    </>
  );

  const projectPricingFields = (
    <>
      <Text className="mb-1 text-sm font-bold text-ink">Warranty</Text>
      <TextInput
        value={product.warranty}
        onChangeText={(warranty) => patch({ warranty })}
        className={`mb-3 ${inputClass}`}
        placeholder="30 days for manufacturing defects"
      />
      <Text className="mb-1 text-sm font-bold text-ink">Maintenance notes</Text>
      <TextInput
        value={product.maintenanceNotes}
        onChangeText={(maintenanceNotes) => patch({ maintenanceNotes })}
        multiline
        className={`mb-3 ${inputClass}`}
        placeholder="Safety / maintenance notes"
      />
      {pricingCard}
    </>
  );

  const projectCodeFields = (
    <>
      <Text className="mb-1 text-sm font-bold text-ink">
        Language / toolchain
      </Text>
      <TextInput
        value={projectDetails.code.language}
        onChangeText={(language) =>
          patchDetails({
            ...projectDetails,
            code: { ...projectDetails.code, language },
          })
        }
        className={`mb-3 ${inputClass}`}
        placeholder="Arduino C++ (ESP32 core)"
      />
      <Text className="mb-1 text-sm font-bold text-ink">
        Repository / firmware link
      </Text>
      <TextInput
        value={projectDetails.code.repositoryUrl}
        onChangeText={(repositoryUrl) =>
          patchDetails({
            ...projectDetails,
            code: { ...projectDetails.code, repositoryUrl },
          })
        }
        className={`mb-3 ${inputClass}`}
        placeholder="https://github.com/genumsolutions/…"
        autoCapitalize="none"
      />
      <Text className="mb-1 text-sm font-bold text-ink">
        Libraries / dependencies (one per line)
      </Text>
      <TextInput
        value={projectDetails.code.libraries}
        onChangeText={(libraries) =>
          patchDetails({
            ...projectDetails,
            code: { ...projectDetails.code, libraries },
          })
        }
        multiline
        className={`mb-3 ${inputClass}`}
        placeholder={"ESP32Servo\nWiFi.h"}
        autoCapitalize="none"
      />
      <Text className="mb-1 text-sm font-bold text-ink">Source folder</Text>
      <TextInput
        value={product.sourceFolder}
        onChangeText={(sourceFolder) => patch({ sourceFolder })}
        className={`mb-3 ${inputClass}`}
        placeholder="Genum_SMART_DUSTBIN_V1.0.0"
        autoCapitalize="none"
      />
      <Text className="mb-1 text-sm font-bold text-ink">Documentation URL</Text>
      <TextInput
        value={product.documentationUrl}
        onChangeText={(documentationUrl) => patch({ documentationUrl })}
        className={`mb-3 ${inputClass}`}
        placeholder="https://…"
        autoCapitalize="none"
      />
      <Text className="mb-1 text-sm font-bold text-ink">Video URL</Text>
      <TextInput
        value={product.videoUrl}
        onChangeText={(videoUrl) => patch({ videoUrl })}
        className={`mb-3 ${inputClass}`}
        placeholder="https://…"
        autoCapitalize="none"
      />
      <Text className="mb-1 text-sm font-bold text-ink">
        Code notes (pin map, flashing caveats…)
      </Text>
      <TextInput
        value={projectDetails.code.notes}
        onChangeText={(notes) =>
          patchDetails({
            ...projectDetails,
            code: { ...projectDetails.code, notes },
          })
        }
        multiline
        style={{ textAlignVertical: "top" }}
        className={`mb-3 min-h-20 ${inputClass}`}
        placeholder="Motor driver on GPIO 25/26…"
      />
      <Text className="mb-1 text-sm font-bold text-ink">
        Control methods (one per line)
      </Text>
      <TextInput
        value={product.controlMethods.join("\n")}
        onChangeText={(v) => patch({ controlMethods: toStringArrayLines(v) })}
        multiline
        className={`mb-3 ${inputClass}`}
        placeholder="Bluetooth remote (GENUM app)…"
      />
    </>
  );

  const projectMaterialFields = (
    <>
      <Text className="mb-1 text-sm font-bold text-ink">
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
      <Text className="mb-1 text-sm font-bold text-ink">Printer</Text>
      <TextInput
        value={projectDetails.material.printer}
        onChangeText={(printer) =>
          patchDetails({
            ...projectDetails,
            material: { ...projectDetails.material, printer },
          })
        }
        className={`mb-3 ${inputClass}`}
        placeholder="Bambu Lab P1S"
      />
      <Text className="mb-1 text-sm font-bold text-ink">Filament</Text>
      <TextInput
        value={projectDetails.material.filament}
        onChangeText={(filament) =>
          patchDetails({
            ...projectDetails,
            material: { ...projectDetails.material, filament },
          })
        }
        className={`mb-3 ${inputClass}`}
        placeholder="PLA 1.75 mm"
      />
      <View className="mb-3 flex-row gap-3">
        <View className="flex-1">
          <Text className="mb-1 text-sm font-bold text-ink">Layer height</Text>
          <TextInput
            value={projectDetails.material.layerHeight}
            onChangeText={(layerHeight) =>
              patchDetails({
                ...projectDetails,
                material: { ...projectDetails.material, layerHeight },
              })
            }
            className={inputClass}
            placeholder="0.2 mm"
          />
        </View>
        <View className="flex-1">
          <Text className="mb-1 text-sm font-bold text-ink">Infill</Text>
          <TextInput
            value={projectDetails.material.infill}
            onChangeText={(infill) =>
              patchDetails({
                ...projectDetails,
                material: { ...projectDetails.material, infill },
              })
            }
            className={inputClass}
            placeholder="20%"
          />
        </View>
      </View>
      <Text className="mb-1 text-sm font-bold text-ink">Print time</Text>
      <TextInput
        value={projectDetails.material.printTime}
        onChangeText={(printTime) =>
          patchDetails({
            ...projectDetails,
            material: { ...projectDetails.material, printTime },
          })
        }
        className={`mb-3 ${inputClass}`}
        placeholder="6 h 20 m"
      />
      <Text className="mb-1 text-sm font-bold text-ink">
        Material notes (supports, colour, post-processing…)
      </Text>
      <TextInput
        value={projectDetails.material.notes}
        onChangeText={(notes) =>
          patchDetails({
            ...projectDetails,
            material: { ...projectDetails.material, notes },
          })
        }
        multiline
        style={{ textAlignVertical: "top" }}
        className={`mb-3 min-h-20 ${inputClass}`}
        placeholder="Print the chassis upright, no supports…"
      />
    </>
  );

  const projectProcedureFields = (
    <>
      <Text className="mb-1 text-sm font-bold text-ink">
        Build steps (one per line)
      </Text>
      <TextInput
        value={product.buildSteps.join("\n")}
        onChangeText={(v) => patch({ buildSteps: toStringArrayLines(v) })}
        multiline
        className={`mb-3 ${inputClass}`}
        placeholder="Mount the motors on the chassis…"
      />
      <Text className="mb-1 text-sm font-bold text-ink">
        Coding procedure (one step per line)
      </Text>
      <TextInput
        value={projectDetails.procedure.steps.join("\n")}
        onChangeText={(v) =>
          patchDetails({
            ...projectDetails,
            procedure: {
              ...projectDetails.procedure,
              steps: toStringArrayLines(v),
            },
          })
        }
        multiline
        className={`mb-3 ${inputClass}`}
        placeholder={
          "Open the sketch in Arduino IDE…\nPick the ESP32 board…\nUpload…"
        }
      />
      <Text className="mb-1 text-sm font-bold text-ink">Procedure notes</Text>
      <TextInput
        value={projectDetails.procedure.notes}
        onChangeText={(notes) =>
          patchDetails({
            ...projectDetails,
            procedure: { ...projectDetails.procedure, notes },
          })
        }
        multiline
        style={{ textAlignVertical: "top" }}
        className={`mb-3 min-h-20 ${inputClass}`}
        placeholder="Hold BOOT while flashing…"
      />
      <Text className="mb-1 text-sm font-bold text-ink">
        Estimated duration
      </Text>
      <TextInput
        value={product.estimatedDuration}
        onChangeText={(estimatedDuration) => patch({ estimatedDuration })}
        className={`mb-3 ${inputClass}`}
        placeholder="2-3 hours"
      />
    </>
  );

  // 2026-11-14 (owner: "Group the product editor's twenty fields into
  // collapsible sections"): the form had ~20 fields in one column, which was
  // hard to scan on a phone. Collapsible groups keep every field and binding
  // identical while letting staff open just the part they are editing.

  return (
    <View className="flex-1">
      <AdminSubTabs
        label={
          isProject ? "Project editor sections" : "Product editor sections"
        }
        options={editorTabs}
        value={editorSubTab}
        onChange={setEditorSubTab}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingVertical: 16,
          paddingBottom: 40,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="rounded-xl border border-line bg-card p-4">
          <Text className="mb-1 font-display text-base font-bold text-ink">
            {isNew ? "Add a new product" : `Edit ${product.id}`}
          </Text>
          <Text className="mb-4 text-xs text-muted">
            Type: {product.productType || "Retail kit"}. One section at a time —
            Save keeps everything you have typed on every section.
          </Text>

          {/* 2026-11-18: the owner asked for the product photos to be visible
              the moment "Add a new product" opens. The full editor now sits on
              the Images tab, so Basics keeps a live cover + count and a jump
              button instead of hiding the pictures altogether. */}
          {!isProject && editorSubTab === "Basics" ? (
            <View className="mb-4 flex-row items-center gap-3 rounded-lg border border-line bg-surface p-3">
              {galleryImages(product)[0] ? (
                <Image
                  source={{ uri: galleryImages(product)[0] }}
                  className="h-14 w-14 rounded-lg bg-mist"
                  resizeMode="cover"
                  accessibilityLabel="Product cover photo"
                />
              ) : (
                <View className="h-14 w-14 items-center justify-center rounded-lg border border-dashed border-line bg-card">
                  <Feather name="image" size={18} color="#94a3b8" />
                </View>
              )}
              <View className="min-w-0 flex-1">
                <Text className="text-xs font-bold text-ink">
                  {galleryImages(product).length > 0
                    ? `${galleryImages(product).length} photo${galleryImages(product).length === 1 ? "" : "s"}`
                    : "No photos yet"}
                </Text>
                <Text className="text-[11px] leading-4 text-muted">
                  Cover and gallery live on the Images tab.
                </Text>
              </View>
              <Pressable
                onPress={() => setEditorSubTab("Images")}
                accessibilityRole="button"
                accessibilityLabel="Open the product images"
                className="shrink-0 rounded-full border border-line px-3 py-1.5"
              >
                <Text className="text-[11px] font-black text-ink">Images</Text>
              </Pressable>
            </View>
          ) : null}

          {editorSubTab === "Basics" || editorSubTab === "Category" ? (
            <EditorSection
              title="Basics"
              subtitle="Id, name, category and type"
              defaultOpen
            >
              <Text className="mb-1 text-sm font-bold text-ink">
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
              <Text className="mb-1 text-sm font-bold text-ink">Name</Text>
              <TextInput
                value={product.name}
                onChangeText={(name) => patch({ name })}
                className={`mb-3 ${inputClass}`}
                placeholder="Product name"
              />
              <Text className="mb-1 text-sm font-bold text-ink">Category</Text>
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
              <Text className="mb-1 text-sm font-bold text-ink">
                Product type
              </Text>
              <View className="mb-1">
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
            </EditorSection>
          ) : null}

          {editorSubTab === "Pricing & stock" || editorSubTab === "Pricing" ? (
            <EditorSection
              title="Pricing & stock"
              subtitle="Price, label, stock and SKU"
            >
              <View className="mb-3 flex-row gap-3">
                <View className="flex-1">
                  <Text className="mb-1 text-sm font-bold text-ink">
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
                  <Text className="mb-1 text-sm font-bold text-ink">Stock</Text>
                  <TextInput
                    value={String(product.stock)}
                    onChangeText={(stock) =>
                      patch({
                        stock: Math.max(0, Math.round(Number(stock) || 0)),
                      })
                    }
                    keyboardType="numeric"
                    className={inputClass}
                    placeholder="0"
                  />
                </View>
              </View>
              <Text className="mb-1 text-sm font-bold text-ink">
                Price label (e.g. NPR 1,450)
              </Text>
              <TextInput
                value={product.priceLabel}
                onChangeText={(priceLabel) => patch({ priceLabel })}
                className={`mb-3 ${inputClass}`}
                placeholder="NPR 1,450"
              />
              <Text className="mb-1 text-sm font-bold text-ink">SKU</Text>
              <TextInput
                value={product.sku}
                onChangeText={(sku) => patch({ sku })}
                className={inputClass}
                placeholder="GEN-…"
                autoCapitalize="characters"
              />
            </EditorSection>
          ) : null}

          {editorSubTab === "Content & specs" ||
          editorSubTab === "Code details" ? (
            <EditorSection
              title="Content & specs"
              subtitle="Summary, description and spec lines"
            >
              <Text className="mb-1 text-sm font-bold text-ink">
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
              <Text className="mb-1 text-sm font-bold text-ink">
                Description
              </Text>
              <TextInput
                value={product.description}
                onChangeText={(description) => patch({ description })}
                multiline
                style={{ textAlignVertical: "top" }}
                className={`mb-3 min-h-20 ${inputClass}`}
                placeholder="Full description"
              />
              <Text className="mb-1 text-sm font-bold text-ink">
                Specs (one per line)
              </Text>
              <TextInput
                value={product.specs.join("\n")}
                onChangeText={(specs) => patch({ specs: specs.split("\n") })}
                multiline
                style={{ textAlignVertical: "top" }}
                className={`min-h-20 ${inputClass}`}
                placeholder={"1.3-inch OLED\nI2C interface"}
              />
            </EditorSection>
          ) : null}

          {/* 2026-11-18 (owner): images were hidden behind a collapsed section,
              so "Add a new product" arrived with no pictures visible. Images
              are the first thing staff check after an import — this section
              now opens by default. */}
          {editorSubTab === "Images" ||
          (isProject && editorSubTab === "Category") ? (
            <EditorSection
              title="Images"
              subtitle="Cover photo and gallery"
              defaultOpen
            >
              <Text className="mb-1 text-sm font-bold text-ink">Image URL</Text>
              {product.image ? (
                <View className="mb-2 flex-row items-start gap-3">
                  <View className="relative h-20 w-20">
                    <Pressable
                      onPress={() =>
                        setImagePreview({
                          uri: product.image,
                          label: product.name
                            ? `${product.name} cover`
                            : "Product cover",
                        })
                      }
                      accessibilityRole="button"
                      accessibilityLabel="View product image full size"
                      className="h-20 w-20 overflow-hidden rounded-lg border border-line bg-mist"
                    >
                      <Image
                        source={{ uri: product.image }}
                        className="h-20 w-20"
                        resizeMode="cover"
                        accessibilityLabel="Extracted product image"
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => patch({ image: "" })}
                      accessibilityRole="button"
                      accessibilityLabel="Remove product image"
                      hitSlop={10}
                      className="absolute -right-2 -top-2 h-8 w-8 items-center justify-center rounded-full border border-line bg-card"
                    >
                      <Feather name="x" size={14} color="#0f172a" />
                    </Pressable>
                  </View>
                  <Text className="min-w-0 flex-1 text-[11px] leading-4 text-muted">
                    Tap the photo to check the imported picture at full size.
                    The × removes it from the product.
                  </Text>
                </View>
              ) : null}
              <TextInput
                value={product.image}
                onChangeText={(image) => patch({ image })}
                className={`mb-3 ${inputClass}`}
                placeholder="https://…"
                autoCapitalize="none"
              />
              <Text className="mb-1 text-sm font-bold text-ink">
                Gallery (one URL per line)
              </Text>
              {Array.isArray(product.gallery) && product.gallery.length > 0 && (
                <View className="mb-2 flex-row flex-wrap gap-2">
                  {clampGallery(product.gallery).map((uri, i) => (
                    <View key={`${uri}-${i}`} className="h-16 w-16">
                      <Pressable
                        onPress={() =>
                          setImagePreview({
                            uri,
                            label: `${product.name || "Product"} gallery ${i + 1}`,
                          })
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`View gallery image ${i + 1} full size`}
                        className="h-16 w-16 overflow-hidden rounded-lg border border-line bg-mist"
                      >
                        <Image
                          source={{ uri }}
                          className="h-16 w-16"
                          resizeMode="cover"
                          accessibilityLabel={`Gallery ${i + 1}`}
                        />
                      </Pressable>
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
                        hitSlop={10}
                        className="absolute -right-2 -top-2 h-8 w-8 items-center justify-center rounded-full border border-line bg-card"
                      >
                        <Feather name="x" size={14} color="#0f172a" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
              <TextInput
                value={
                  Array.isArray(product.gallery)
                    ? product.gallery.join("\n")
                    : ""
                }
                onChangeText={(gallery) =>
                  patch({
                    // One clamp, shared with the website's budget: dedupe, drop
                    // blanks and stop at maxImagesPerItem. Typing a 9th line
                    // simply does not land.
                    gallery: clampGallery(gallery.split("\n")),
                  })
                }
                multiline
                style={{ textAlignVertical: "top" }}
                className={`min-h-20 ${inputClass}`}
                placeholder={"https://…\nhttps://…"}
                autoCapitalize="none"
              />
              <Text className="mt-1 text-[11px] leading-4 text-muted">
                {IMAGE_BUDGET_HINT}
              </Text>
            </EditorSection>
          ) : null}

          {isProject && editorSubTab === "Category" ? (
            <EditorSection
              title="Category"
              subtitle="What this project is, who it is for, and its photos"
              defaultOpen
            >
              {projectCategoryFields}
            </EditorSection>
          ) : null}

          {isProject && editorSubTab === "Pricing" ? (
            <EditorSection
              title="Pricing"
              subtitle="Price, support and the package quote"
              defaultOpen
            >
              {projectPricingFields}
            </EditorSection>
          ) : null}

          {isProject && editorSubTab === "Code details" ? (
            <EditorSection
              title="Code details"
              subtitle="Toolchain, repository, dependencies and sourcing"
              defaultOpen
            >
              {projectCodeFields}
            </EditorSection>
          ) : null}

          {isProject && editorSubTab === "3D material details" ? (
            <EditorSection
              title="3D material details"
              subtitle="Materials, printer profile and print settings"
              defaultOpen
            >
              {projectMaterialFields}
            </EditorSection>
          ) : null}

          {isProject && editorSubTab === "Coding procedure" ? (
            <EditorSection
              title="Coding procedure"
              subtitle="Assembly steps, flashing procedure and duration"
              defaultOpen
            >
              {projectProcedureFields}
            </EditorSection>
          ) : null}

          <View className="mb-4 mt-1 flex-row items-center gap-3">
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
      {imagePreview && (
        <ImagePreviewModal
          uri={imagePreview.uri}
          label={imagePreview.label}
          onClose={() => setImagePreview(null)}
        />
      )}
    </View>
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
  // Back to page 1 whenever the filter changes — during render, so the list
  // never paints the old page against the new results.
  const filterSig = `${query}|\u0000${category}`;
  const [lastFilterSig, setLastFilterSig] = React.useState(filterSig);
  if (lastFilterSig !== filterSig) {
    setLastFilterSig(filterSig);
    setPage(1);
  }

  if (editing) {
    return (
      <AdminEditorSheet
        full
        visible
        title="Service"
        onClose={() => onEdit(null)}
      >
        <ServiceEditor
          service={editing}
          onChange={onChange}
          onSave={onSave}
          onCancel={() => onEdit(null)}
          isNew={!services.some((s) => s.id === editing.id)}
          categoryOptions={categories.filter((c) => c !== "All")}
          saving={saveSaving}
        />
      </AdminEditorSheet>
    );
  }

  return (
    <View className="flex-1">
      <FlatList
        data={shown}
        keyExtractor={(s) => s.id}
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingVertical: 16,
          paddingBottom: 40,
        }}
        ListHeaderComponent={
          <View className="mb-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-display text-xl font-bold tracking-tight text-ink">
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
              />{" "}
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
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingVertical: 16,
        paddingBottom: 40,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="rounded-xl border border-line bg-card p-4">
        <Text className="mb-3 font-display text-base font-bold text-ink">
          {isNew ? "Add a new service" : `Edit ${service.id}`}
        </Text>
        <Text className="mb-1 text-sm font-bold text-ink">Id (slug)</Text>
        <TextInput
          value={service.id}
          onChangeText={(id) =>
            patch({ id: id.trim().toLowerCase().replace(/\s+/g, "-") })
          }
          className={`mb-3 ${inputClass}`}
          placeholder="e.g. website-design"
          autoCapitalize="none"
        />
        <Text className="mb-1 text-sm font-bold text-ink">Name</Text>
        <TextInput
          value={service.name}
          onChangeText={(name) => patch({ name })}
          className={`mb-3 ${inputClass}`}
          placeholder="Service name"
        />
        <Text className="mb-1 text-sm font-bold text-ink">Category</Text>
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
        <Text className="mb-1 text-sm font-bold text-ink">Price label</Text>
        <TextInput
          value={service.priceLabel}
          onChangeText={(priceLabel) => patch({ priceLabel })}
          className={`mb-3 ${inputClass}`}
          placeholder="from NPR 35,000"
        />
        <Text className="mb-1 text-sm font-bold text-ink">Tag / badge</Text>
        <TextInput
          value={service.tag}
          onChangeText={(tag) => patch({ tag })}
          className={`mb-3 ${inputClass}`}
          placeholder="Website, Fabrication, …"
        />
        <Text className="mb-1 text-sm font-bold text-ink">Sort order</Text>
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
        <Text className="mb-1 text-sm font-bold text-ink">Description</Text>
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
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      setRows(await listUserRobotSettings(userId));
    } catch (error) {
      logger.error("admin", "Robot settings load error:", error);
      setRows(null);
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not load robot settings.",
      );
    }
  }, [userId]);
  useEffect(() => {
    // The loader raises its own busy flag before the request; rows land in
    // promise callbacks.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async load
    void load();
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
      <View className="py-2">
        <Text className="text-xs text-muted">
          {loadError || "Loading robot settings…"}
        </Text>
        {loadError ? (
          <Pressable onPress={() => void load()} className="mt-1 self-start">
            <Text className="text-xs font-bold text-navy">Retry</Text>
          </Pressable>
        ) : null}
      </View>
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
  const [detailsKey, setDetailsKey] = useState<string | null>(null);
  const [profileKey, setProfileKey] = useState("");
  const [carName, setCarName] = useState("");
  // Settings are edited as JSON, exactly like the website's Users panel: the
  // real objects can be nested or contain arrays, and a key=value textarea
  // would silently flatten them on save.
  const [values, setValues] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      setRows(await listUserCarProfiles(userId));
    } catch (error) {
      logger.error("admin", "Project profile load error:", error);
      setRows(null);
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not load project profiles.",
      );
    }
  }, [userId]);
  useEffect(() => {
    // The loader raises its own busy flag before the request; rows land in
    // promise callbacks.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async load
    void load();
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
      <View className="py-2">
        <Text className="text-xs text-muted">
          {loadError || "Loading project profiles…"}
        </Text>
        {loadError ? (
          <Pressable onPress={() => void load()} className="mt-1 self-start">
            <Text className="text-xs font-bold text-navy">Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );

  return (
    <View className="mt-3 rounded-lg border border-line bg-surface p-3">
      <Text className="text-xs font-black uppercase tracking-widest text-navy">
        Project profiles ({rows.length})
      </Text>
      <Text className="mt-0.5 text-[11px] leading-4 text-muted">
        Project profiles saved for this user. Names and settings are shown in
        plain language; connection details stay hidden.
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
                {row.carName || "Untitled project"}
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
            <Text className="mt-0.5 text-[11px] text-muted">
              {Object.keys(row.settings || {}).length} saved settings
            </Text>
            <Pressable
              onPress={() =>
                setDetailsKey(
                  detailsKey === row.profileKey ? null : row.profileKey,
                )
              }
              className="mt-1 self-start rounded-full border border-line px-2 py-0.5"
            >
              <Text className="text-[10px] font-bold text-navy">
                {detailsKey === row.profileKey ? "Hide details" : "Details"}
              </Text>
            </Pressable>
            {detailsKey === row.profileKey && (
              <Text className="mt-1 font-mono text-[10px] text-muted">
                Connection ID: {row.profileKey}
                {row.uniqueId ? ` · Device ID: ${row.uniqueId}` : ""}
              </Text>
            )}
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
// ── Project profiles window ───────────────────────────────────────────
// 2026-11-18 (owner): Users needed proper windowing — a place to read the
// project profiles builders have saved without opening one account at a time.
// Read-only by design: repairs still happen on the per-user row in Accounts,
// which keeps one write path per record.
function ProjectProfilesTab() {
  const [profiles, setProfiles] = useState<AdminProjectProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void listAdminCarProfiles()
      .then((rows) => {
        if (active) setProfiles(rows);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(
          e instanceof Error ? e.message : "Could not load project profiles.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const needle = query.trim().toLowerCase();
  const filtered = profiles.filter(
    (profile) =>
      !needle ||
      `${profile.carName} ${profile.ownerName} ${profile.ownerEmail} ${profile.profileKey} ${profile.uniqueId}`
        .toLowerCase()
        .includes(needle),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filterSig = query;
  const [lastSig, setLastSig] = React.useState(filterSig);
  if (lastSig !== filterSig) {
    setLastSig(filterSig);
    setPage(1);
  }

  const owners = new Set(profiles.map((profile) => profile.userId)).size;

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingVertical: 16,
        paddingBottom: 40,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Text className="font-display text-xl font-bold tracking-tight text-ink">
        Project profiles
      </Text>
      <Text className="mt-1 text-xs leading-5 text-muted">
        Saved car / project profiles across every account. Read-only — open an
        account in Accounts to repair one.
      </Text>
      <Text className="mt-2 text-xs font-bold text-navy">
        {profiles.length} profiles · {owners} builders
      </Text>
      <View className="mt-3 flex-row items-center gap-2">
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search builder, car or profile key…"
          className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink"
        />
        <Pressable
          onPress={() => setReload((v) => v + 1)}
          accessibilityRole="button"
          accessibilityLabel="Refresh project profiles"
          className="shrink-0 rounded-full border border-line px-4 py-2"
        >
          <Text className="text-xs font-black text-ink">Refresh</Text>
        </Pressable>
      </View>

      {loading ? (
        <Text className="py-8 text-center text-sm text-muted">
          Loading project profiles…
        </Text>
      ) : error ? (
        <View className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <Text className="text-sm font-bold text-red-700">{error}</Text>
          <Pressable
            onPress={() => setReload((v) => v + 1)}
            accessibilityRole="button"
            accessibilityLabel="Retry loading project profiles"
            className="mt-2 self-start rounded-full bg-navy px-4 py-2"
          >
            <Text className="text-xs font-black text-white">Retry</Text>
          </Pressable>
        </View>
      ) : shown.length === 0 ? (
        <Text className="py-8 text-center text-sm text-muted">
          {profiles.length === 0
            ? "No project profiles saved yet."
            : "No profiles match that search."}
        </Text>
      ) : (
        shown.map((profile) => (
          <View
            key={profile.id}
            className="mb-3 rounded-xl border border-line bg-card p-4"
          >
            <View className="flex-row items-center justify-between gap-2">
              <Text
                numberOfLines={1}
                className="min-w-0 flex-1 text-sm font-bold text-ink"
              >
                {profile.carName || profile.profileKey}
              </Text>
              <Text className="shrink-0 text-[10px] font-black uppercase tracking-wide text-gold">
                {profile.uniqueId || profile.profileKey}
              </Text>
            </View>
            <Text numberOfLines={1} className="mt-1 text-xs text-muted">
              {profile.ownerName || "Unnamed builder"} · {profile.ownerEmail}
            </Text>
            <Text className="mt-1 text-[11px] text-muted">
              {Object.keys(profile.settings).length} saved settings
              {profile.updatedAt
                ? ` · updated ${profile.updatedAt.slice(0, 10)}`
                : ""}
            </Text>
          </View>
        ))
      )}
      {totalPages > 1 ? (
        <AdminPager page={page} totalPages={totalPages} onPage={setPage} />
      ) : null}
    </ScrollView>
  );
}

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
}) {
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>(
    {},
  );

  // Render user directory section header
  const renderUserDirHeader = () => (
    <View className="mb-3">
      <Text className="font-display text-xl font-bold tracking-tight text-ink">
        User directory
      </Text>
      <Text className="mt-1 text-xs text-muted">
        {total} account{total === 1 ? "" : "s"} · search runs on the server
      </Text>
      <View className="mt-2 flex-row gap-2">
        <TextInput
          value={query}
          onChangeText={onQueryChange}
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

  return (
    <View className="flex-1">
      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingVertical: 16,
          paddingBottom: 40,
        }}
        ListHeaderComponent={renderUserDirHeader}
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
          // 2026-11-15 (owner: "100s of users should fit"): one dense row per
          // account instead of a tall card. Identity on line 1, every secondary
          // field folded into a single truncating meta line, actions on line 3.
          <View className="mb-2 rounded-lg border border-line bg-card px-3 py-2">
            <View className="flex-row items-center gap-2">
              <Text
                numberOfLines={1}
                className="min-w-0 flex-1 text-sm font-bold leading-snug text-ink"
              >
                {item.name || "—"}
              </Text>
              <Text
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${
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
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${
                  item.tier === "pro"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-mist text-muted"
                }`}
              >
                {item.tier}
              </Text>
            </View>
            {/* Emails have no spaces to wrap at, so this line truncates rather
                than running past the card edge. */}
            <Text numberOfLines={1} className="mt-0.5 text-xs text-muted">
              {[item.email, item.phone, item.address]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            {item.createdAt ? (
              <Text numberOfLines={1} className="text-xs text-muted">
                Joined {new Date(item.createdAt).toLocaleDateString()}
                {item.lastSeenAt
                  ? " · last seen " +
                    new Date(item.lastSeenAt).toLocaleDateString()
                  : ""}
              </Text>
            ) : null}
            <View className="mt-1.5 flex-row flex-wrap items-center gap-1.5">
              {canDelete && item.role !== "owner" ? (
                <Pressable
                  onPress={() => onToggleRole(item)}
                  accessibilityRole="button"
                  className="rounded-full border border-line px-2.5 py-0.5"
                >
                  <Text className="text-[11px] font-bold text-navy">
                    Change role
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => onToggleTier(item)}
                accessibilityRole="button"
                className="rounded-full border border-line px-2.5 py-0.5"
              >
                <Text className="text-[11px] font-bold text-navy">
                  {item.tier === "pro" ? "Make free" : "Make pro"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  setExpandedUsers((prev) => ({
                    ...prev,
                    [item.id]: !prev[item.id],
                  }))
                }
                accessibilityRole="button"
                className="rounded-full border border-line px-2.5 py-0.5"
              >
                <Text className="text-[11px] font-bold text-navy">
                  {expandedUsers[item.id] ? "Hide projects" : "Show projects"}
                </Text>
              </Pressable>
              {isOwner && item.role !== "owner" ? (
                <Pressable
                  onPress={() => onDeleteUser(item)}
                  accessibilityRole="button"
                  className="rounded-full border border-red-200 px-2.5 py-0.5"
                >
                  <Text className="text-[11px] font-bold text-red-600">
                    Delete account
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {expandedUsers[item.id] && (
              <View className="mt-3">
                <UserProjectProfileManager
                  userId={item.id}
                  email={item.email}
                  canDelete={canDelete}
                />
                <UserRobotSettingsManager
                  userId={item.id}
                  email={item.email}
                  canDelete={canDelete}
                />
              </View>
            )}
          </View>
        )}
      />
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
  // 2026-11-18 (owner: \"the other sub tabs and sub-sub-tabs are also not
  // proper\"): the Home page panel stacked four unrelated managers in one
  // scroll. It is now a nested section strip so each record type has its own
  // window: the hero copy staff edit most, then training, pilot costs and the
  // curriculum highlights.
  const [homeSection, setHomeSection] = useState<HomeSection>("Hero");
  return (
    <View className="flex-1">
      <AdminSubTabs
        label="Home page sections"
        options={HOME_SECTIONS}
        value={homeSection}
        onChange={setHomeSection}
      />
      <ScrollView
        className="flex-1 overflow-hidden"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingVertical: 16,
          paddingBottom: 40,
        }}
      >
        {homeSection === "Hero" ? (
          <>
            <Text className="font-display text-base font-bold text-ink">
              Home page content
            </Text>
            <Text className="mt-1 text-xs leading-5 text-muted">
              The hero title and body shown on the app home screen and the
              website homepage. Both clients read the same record.
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
            {siteContent?.id === 0 && (
              <Text className="mt-3 text-center text-xs text-amber-600">
                Showing bundled content — the live content service is
                unreachable. Save to publish.
              </Text>
            )}
          </>
        ) : null}
        {homeSection === "Training" ? (
          <TrainingProgramsManager
            programs={trainingPrograms}
            setPrograms={setTrainingPrograms}
            onSave={onSaveProgram}
            canDelete={canDelete}
            onDelete={onDeleteProgram}
            inputClass={inputClass}
            onEditingChange={() => {}}
          />
        ) : null}
        {homeSection === "Pilot costs" ? (
          <PilotCostManager
            lines={pilotCostLines}
            setLines={setPilotCostLines}
            onSave={onSavePilotLine}
            canDelete={canDelete}
            onDelete={onDeletePilotLine}
            inputClass={inputClass}
            onEditingChange={() => {}}
          />
        ) : null}
        {homeSection === "Curriculum" ? (
          <CurriculumManager
            highlights={curriculumHighlights}
            setHighlights={setCurriculumHighlights}
            onSave={onSaveCurriculum}
            canDelete={canDelete}
            onDelete={onDeleteCurriculum}
            inputClass={inputClass}
            onEditingChange={() => {}}
          />
        ) : null}
      </ScrollView>
    </View>
  );
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
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingVertical: 16,
          paddingBottom: 40,
        }}
      >
        <View className="mb-4 flex-row items-center justify-between gap-2">
          <View className="min-w-0 flex-1">
            <Text className="font-display text-xl font-bold tracking-tight text-ink">
              Journal posts ({journals.length})
            </Text>
            <Text className="mt-0.5 text-xs text-muted">
              Edits publish to the website and the app immediately.
            </Text>
          </View>
          {!editorOpen && (
            <Pressable
              onPress={onNew}
              className="shrink-0 rounded-full bg-navy px-4 py-2"
            >
              <Text className="text-xs font-black text-white">+ New post</Text>
            </Pressable>
          )}
        </View>

        {editorOpen ? (
          <AdminEditorSheet
            visible
            title={editId ? `Edit ${editId}` : "Add a new journal post"}
            hint="Publishes to the app Journal and the website /journal page."
            onClose={onCancel}
          >
            <Text className="mb-1 text-sm font-bold text-ink">
              Id (slug, auto-generated from title if blank)
            </Text>
            <TextInput
              value={editId}
              onChangeText={onEditIdChange}
              className="mb-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              placeholder="e.g. esp32-beginner-project"
            />
            <Text className="mb-1 text-sm font-bold text-ink">
              Tag / category
            </Text>
            <TextInput
              value={tag}
              onChangeText={onTagChange}
              className="mb-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              placeholder="Tutorial · Robotics"
            />
            <Text className="mb-1 text-sm font-bold text-ink">Title</Text>
            <TextInput
              value={title}
              onChangeText={onTitleChange}
              className="mb-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              placeholder="Post title"
            />
            <Text className="mb-1 text-sm font-bold text-ink">
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
          </AdminEditorSheet>
        ) : null}

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
                    {/* The separator only makes sense when there is a tag to
                        separate from; an empty tag used to wrap a lone "·"
                        onto its own line. */}
                    {item.tag ? `${item.tag} · ${item.text}` : item.text}
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
                />{" "}
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
  // 2026-11-13 (batch 4): conversion moved here with the rest of the money
  // numbers, so only this tab publishes them.
  const conversionRate =
    stats.totalOrders > 0 && stats.totalUsers > 0
      ? `${((stats.succeededTransactions / Math.max(1, stats.totalUsers)) * 100).toFixed(1)}%`
      : "—";

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingVertical: 16,
        paddingBottom: 40,
      }}
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
        <StatCard
          label="Conversion"
          value={conversionRate}
          sub="Paid orders / users"
        />
      </View>

      {stats.totalTransactions === 0 && (
        <View className="mb-4 rounded-xl border border-dashed border-line bg-card px-4 py-5">
          <Text className="text-center text-sm leading-6 text-muted">
            No payments recorded yet. Cash-on-delivery and gateway orders appear
            here as soon as the first one is placed.
          </Text>
        </View>
      )}

      {/* Order status breakdown */}
      {stats.totalOrders === 0 && (
        <View className="rounded-xl border border-dashed border-line bg-card px-4 py-5">
          <Text className="text-center text-sm leading-6 text-muted">
            No orders yet — the pending / paid / fulfilled split appears with
            the first order.
          </Text>
        </View>
      )}
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
                className="min-w-[45%] flex-1 rounded-lg border border-line p-3"
              >
                <Text className="text-[10px] font-black uppercase tracking-widest text-muted">
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
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingVertical: 16,
        paddingBottom: 40,
      }}
    >
      <Text className="mb-4 font-display text-xl font-bold tracking-tight text-ink">
        Activity
      </Text>
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
                    <Text className="mt-0.5 break-words text-xs text-muted">
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
// The Logs screen separates system diagnostics, user activity, and saved
// profiles so each list has its own full-height scroll area.
// Same three sections, labels and order as the website's AdminLogsHub
// SECTIONS, so an admin reading one console can read the other. The ids stay
// local; only the visible labels/order are the contract.
const LOG_SECTIONS = [
  { id: "activity", label: "User activity" },
  { id: "profiles", label: "User profiles" },
  { id: "diagnostics", label: "Fleet diagnostics" },
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
  // 2026-11-18: the tab is now called Diagnostics, so it opens on the fleet
  // diagnostics (crash reports + app logs) rather than on user activity.
  const [section, setSection] = useState<LogSection>("diagnostics");
  return (
    <View className="flex-1">
      <Text className="px-4 pt-3 font-display text-xl font-bold tracking-tight text-ink">
        Diagnostics
      </Text>
      <Text className="px-4 pt-1 text-xs leading-5 text-muted">
        What the fleet and its users did: crash reports, app logs, the activity
        log and the profile-entry log.
      </Text>
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
      {section === "activity" ? (
        <UserLogsTab
          logs={userLogs}
          page={userLogPage}
          total={userLogTotal}
          totalPages={userLogTotalPages}
          onPage={onLoadUserLogs}
          canDelete={canDelete}
          onDelete={onDeleteUserLog}
        />
      ) : section === "profiles" ? (
        <ProfileEntriesTab
          entries={profileEntries}
          types={profileEntryTypes}
          page={profileEntryPage}
          total={profileEntryTotal}
          totalPages={profileEntryTotalPages}
          onPage={onLoadProfileEntries}
          canDelete={canDelete}
          onDelete={onDeleteProfileEntry}
        />
      ) : (
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
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingVertical: 16,
        paddingBottom: 40,
      }}
    >
      <Text className="mb-1 font-display text-base font-bold tracking-tight text-ink">
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

      <Text className="mb-1 mt-5 font-display text-base font-bold tracking-tight text-ink">
        App logs
      </Text>
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
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingVertical: 16,
        paddingBottom: 40,
      }}
    >
      <Text className="mb-1 font-display text-base font-bold tracking-tight text-ink">
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
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingVertical: 16,
        paddingBottom: 40,
      }}
    >
      <Text className="mb-1 font-display text-base font-bold tracking-tight text-ink">
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
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="min-w-0 flex-1 text-sm font-bold text-ink">
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
              {canDelete ? (
                <View className="mt-2 flex-row flex-wrap gap-2">
                  <AdminAction
                    onPress={() => onDelete(row)}
                    label="Delete"
                    tone="red"
                  />
                </View>
              ) : null}
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
  canDelete,
  onDelete,
  subscribers,
  subscriberTotal,
  subscriberPage,
  subscriberTotalPages,
  onSubscriberPage,
  onReloadSubscribers,
  onDeleteSubscriber,
}: {
  messages: AdminMessage[];
  total: number;
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
  status: string;
  onStatusFilter: (s: string) => void;
  onMarkReplied: (id: string) => void;
  canDelete: boolean;
  onDelete: (message: AdminMessage) => void;
  subscribers: AdminSubscriber[];
  subscriberTotal: number;
  subscriberPage: number;
  subscriberTotalPages: number;
  onSubscriberPage: (p: number) => void;
  onReloadSubscribers: () => void;
  onDeleteSubscriber: (subscriber: AdminSubscriber) => void;
}) {
  const [preview, setPreview] = useState<AdminMessage | null>(null);
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingVertical: 16,
        paddingBottom: 40,
      }}
    >
      <View className="mb-3">
        <Text className="font-display text-xl font-bold tracking-tight text-ink">
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
                  {canDelete ? (
                    <AdminAction
                      onPress={() => onDelete(m)}
                      label="Delete"
                      tone="red"
                    />
                  ) : null}
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
              <Text numberOfLines={1} className="mt-0.5 text-sm text-muted">
                {preview.email}
              </Text>
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

      {/* Newsletter opt-ins — the website's second Messages panel, staff read
          and admin remove on the same table. */}
      <View className="mt-6">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="font-display text-base font-bold text-ink">
            Newsletter subscribers ({subscriberTotal})
          </Text>
          <Pressable
            onPress={onReloadSubscribers}
            accessibilityRole="button"
            accessibilityLabel="Refresh subscribers"
            className="rounded-full border border-line px-3 py-1"
          >
            <Text className="text-xs font-bold text-ink">Refresh</Text>
          </Pressable>
        </View>
        <Text className="mt-1 text-xs leading-5 text-muted">
          Opt-ins captured by the app and the website footer/checkout.
        </Text>
        {subscribers.length === 0 ? (
          <Text className="py-8 text-center text-sm text-muted">
            No subscribers yet.
          </Text>
        ) : (
          <>
            {subscribers.map((sub) => (
              <View
                key={sub.id}
                className="mt-2 flex-row flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-4"
              >
                <View className="min-w-0 flex-1">
                  <Text
                    numberOfLines={2}
                    className="text-sm font-bold text-ink"
                  >
                    {sub.email}
                  </Text>
                  <Text className="mt-0.5 text-xs text-muted">
                    {new Date(sub.createdAt).toLocaleString()}
                    {sub.source ? ` · via ${sub.source}` : ""}
                  </Text>
                </View>
                <Text className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                  {sub.status}
                </Text>
                {canDelete ? (
                  <AdminAction
                    onPress={() => onDeleteSubscriber(sub)}
                    label="Remove"
                    tone="red"
                  />
                ) : null}
              </View>
            ))}
            <AdminPager
              page={subscriberPage}
              totalPages={subscriberTotalPages}
              onPage={onSubscriberPage}
            />
          </>
        )}
      </View>
    </ScrollView>
  );
}

// ─── Settings (company info + programs) ─────────────────────────────

// Mirrors the website's AdminSettings SECTIONS exactly (labels + hints), so the
// two consoles group company fields the same way instead of the app showing one
// 17-field wall.
// 2026-11-18 (owner: "the content page should be moved to the setting"): the
// old Content tab and the Settings tab are ONE surface now. Keys are stable
// (they select the panel); the labels are what staff read.
const SETTINGS_SUBTABS = ["Company", "Content", "Services", "Journal"] as const;
type SettingsSubTab = (typeof SETTINGS_SUBTABS)[number];

// 2026-11-18: nested sections of Settings → Home page. Four record types used
// to share one scroll; each has its own window now.
const HOME_SECTIONS = [
  "Hero",
  "Training",
  "Pilot costs",
  "Curriculum",
] as const;
type HomeSection = (typeof HOME_SECTIONS)[number];

const SETTINGS_SECTIONS = [
  {
    id: "details",
    label: "Company details",
    hint: "Name, address and tax details.",
  },
  {
    id: "contact",
    label: "Contact",
    hint: "Email, phone and public description.",
  },
  {
    id: "social",
    label: "Social & messaging",
    hint: "WhatsApp and social profile links.",
  },
] as const;

type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"];
const SETTINGS_SECTION_IDS = ["details", "contact", "social"] as const;
const SETTINGS_SECTION_LABELS: Record<SettingsSection, string> = {
  details: "Details",
  contact: "Contact",
  social: "Social",
};

function SettingsTab({
  company,
  loaded,
  setCompany,
  onCompanySaved,
  onEditingChange,
}: {
  company: AdminCompanyInfo | null;
  /** The Settings tab has finished its first load attempt. */
  loaded: boolean;
  setCompany: (c: AdminCompanyInfo | null) => void;
  onCompanySaved: (next: AdminCompanyInfo) => void;
  onEditingChange: (v: boolean) => void;
}) {
  const inputClass =
    "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink";
  const [section, setSection] = useState<SettingsSection>("details");
  // 2026-11-15: the company form is read-only until Edit is pressed, like every
  // other admin editor. Previously all 17 inputs were live on arrival.
  const [editing, setEditing] = useState(false);
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
    onEditingChange(editing || anyEditing);
  }, [editing, anyEditing, onEditingChange]);

  const rowsFor = (
    which: SettingsSection,
  ): { label: string; value: string }[] => {
    if (!company) return [];
    if (which === "details")
      return [
        { label: "Name", value: company.name },
        { label: "Short name", value: company.shortName },
        { label: "Address", value: company.address },
        { label: "City", value: company.city },
        { label: "Country", value: company.country },
        { label: "PAN", value: company.pan },
        { label: "VAT label", value: company.vatLabel },
      ];
    if (which === "contact")
      return [
        { label: "Email", value: company.email },
        { label: "Phone", value: company.phone },
        { label: "Description", value: company.description },
      ];
    return [
      { label: "WhatsApp", value: company.whatsappNumber },
      { label: "Website", value: company.url ?? "" },
      { label: "Facebook", value: company.facebookUrl },
      { label: "Instagram", value: company.instagramUrl },
      { label: "TikTok", value: company.tiktokUrl },
      { label: "LinkedIn", value: company.linkedinUrl },
      { label: "YouTube", value: company.youtubeUrl },
    ];
  };
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingVertical: 16,
        paddingBottom: 40,
      }}
    >
      <Text className="font-display text-xl font-bold tracking-tight text-ink">
        Settings
      </Text>
      <Text className="mt-1 text-xs text-muted">
        Company details — all DB-first (shared with the website).
      </Text>
      <View className="mt-3 flex-row items-center justify-between gap-3">
        <Text className="text-[10px] font-black uppercase tracking-widest text-muted">
          {editing ? "Editing" : "Read-only"}
        </Text>
        <Pressable
          onPress={() => setEditing((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={
            editing ? "Cancel editing company" : "Edit company details"
          }
          className={`h-8 items-center justify-center rounded-full px-4 ${editing ? "border border-line bg-card" : "bg-navy"}`}
        >
          <Text
            className={`text-xs font-bold ${editing ? "text-navy" : "text-white"}`}
          >
            {editing ? "Cancel" : "Edit"}
          </Text>
        </Pressable>
      </View>
      {/* 2026-11-18: the three company groups are a proper nested strip now,
          the same component the tab and section levels use. */}
      <View className="mt-3">
        <AdminSubTabs
          label="Company sections"
          options={SETTINGS_SECTION_IDS}
          value={section}
          labels={SETTINGS_SECTION_LABELS}
          onChange={setSection}
        />
      </View>
      <Text className="mt-2 text-xs text-muted">
        {SETTINGS_SECTIONS.find((item) => item.id === section)?.hint}
      </Text>
      {editing ? (
        <AdminEditorSheet
          visible
          title={
            SETTINGS_SECTIONS.find((item) => item.id === section)?.label ??
            "Company information"
          }
          hint="Saves to the shared company record used by the app and website."
          onClose={() => setEditing(false)}
        >
          <CompanyInfoEditor
            company={company}
            onSaved={async (next) => {
              await onCompanySaved(next);
              setEditing(false);
            }}
            onEditingChange={report("company")}
            inputClass={inputClass}
            section={section}
          />
        </AdminEditorSheet>
      ) : (
        <SectionCard
          title={
            SETTINGS_SECTIONS.find((item) => item.id === section)?.label ??
            "Company information"
          }
          hint="Shown in the app Contact/Legal screens and the website footer/contact pages."
        >
          {!company ? (
            <Text className="text-sm leading-6 text-muted">
              {loaded
                ? "No company record yet. Tap Edit to create it; the app and website read it straight after saving."
                : "Loading company info…"}
            </Text>
          ) : (
            rowsFor(section).map((row) => (
              <View
                key={row.label}
                className="flex-row items-start gap-3 border-b border-line py-2 last:border-b-0"
              >
                <Text className="w-28 shrink-0 text-xs text-muted">
                  {row.label}
                </Text>
                <Text className="min-w-0 flex-1 break-words text-right text-sm text-ink">
                  {row.value || "—"}
                </Text>
              </View>
            ))
          )}
        </SectionCard>
      )}
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
    <View className="mt-4 rounded-xl border border-line bg-card p-4">
      <Text className="font-display text-base font-bold text-ink">{title}</Text>
      {hint ? (
        <Text className="mt-0.5 text-xs leading-5 text-muted">{hint}</Text>
      ) : null}
      <View className="mt-3">{children}</View>
    </View>
  );
}

// 2026-11-18 (owner: "the company info things are not well built and not
// editable in the deep"): this editor now works on a DRAFT, not on the shared
// record. Typing used to mutate the live record immediately, so Cancel left the
// read-only view showing unsaved values; there was also no validation and no
// failure surfaced from the write. Save validates, shows the database error if
// one comes back, and only then hands the record up.
function CompanyInfoEditor({
  company,
  onSaved,
  inputClass,
  onEditingChange,
  section,
}: {
  company: AdminCompanyInfo | null;
  /** Persists the draft; rejects (or throws) when the database write fails. */
  onSaved: (next: AdminCompanyInfo) => Promise<void> | void;
  inputClass: string;
  onEditingChange: (v: boolean) => void;
  section: SettingsSection;
}) {
  const [draft, setDraft] = useState<AdminCompanyInfo>(() => ({
    name: "",
    shortName: "",
    address: "",
    city: "",
    country: "",
    email: "",
    phone: "",
    pan: "",
    vatLabel: "",
    description: "",
    url: "",
    whatsappNumber: "",
    facebookUrl: "",
    instagramUrl: "",
    tiktokUrl: "",
    linkedinUrl: "",
    youtubeUrl: "",
    ...(company ?? {}),
  }));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(part: Partial<AdminCompanyInfo>) {
    setDraft((current) => ({ ...current, ...part }));
    setSaved(false);
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

  async function save() {
    const missing: string[] = [];
    if (!draft.name.trim()) missing.push("company name");
    if (!draft.email.trim()) missing.push("email");
    if (missing.length > 0) {
      setError(`Add the ${missing.join(" and ")} before saving.`);
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email.trim())) {
      setError("That email does not look right — it needs an @ and a domain.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSaved({
        ...draft,
        name: draft.name.trim(),
        email: draft.email.trim(),
        whatsappNumber: draft.whatsappNumber.replace(/[^\d]/g, ""),
      });
      setSaved(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save the company information.",
      );
    } finally {
      setSaving(false);
    }
  }

  const hint = (text: string) => (
    <Text className="mt-1 text-[11px] leading-4 text-muted">{text}</Text>
  );

  return (
    <SectionCard
      title="Company information"
      hint="Shown in the app Contact/Legal screens and the website footer/contact pages."
    >
      {!company ? (
        <Text className="text-sm text-muted">Loading company info…</Text>
      ) : (
        <>
          {section === "details" && (
            <>
              <View className="mb-3 flex-row gap-3">
                <View className="flex-1">
                  <Text className="mb-1 text-sm font-bold text-ink">
                    Name *
                  </Text>
                  <TextInput
                    value={draft.name}
                    onChangeText={(name) => patch({ name })}
                    placeholder="GENUM SOLUTIONS PVT. LTD."
                    {...field}
                    className={inputClass}
                  />
                </View>
                <View className="flex-1">
                  <Text className="mb-1 text-sm font-bold text-ink">
                    Short name
                  </Text>
                  <TextInput
                    value={draft.shortName}
                    onChangeText={(shortName) => patch({ shortName })}
                    placeholder="GENUM"
                    {...field}
                    className={inputClass}
                  />
                </View>
              </View>
              {hint(
                "The legal name appears on invoices, the About and Legal screens and the site footer; the short name is used where space is tight.",
              )}
              <Text className="mb-1 mt-3 text-sm font-bold text-ink">
                Address
              </Text>
              <TextInput
                value={draft.address}
                onChangeText={(address) => patch({ address })}
                multiline
                placeholder="Street, ward, landmark"
                style={{ textAlignVertical: "top" }}
                {...field}
                className={`mb-3 min-h-16 ${inputClass}`}
              />
              <View className="mb-3 flex-row gap-3">
                <View className="flex-1">
                  <Text className="mb-1 text-sm font-bold text-ink">City</Text>
                  <TextInput
                    value={draft.city}
                    onChangeText={(city) => patch({ city })}
                    {...field}
                    className={inputClass}
                  />
                </View>
                <View className="flex-1">
                  <Text className="mb-1 text-sm font-bold text-ink">
                    Country
                  </Text>
                  <TextInput
                    value={draft.country}
                    onChangeText={(country) => patch({ country })}
                    {...field}
                    className={inputClass}
                  />
                </View>
              </View>
              <View className="mb-3 flex-row gap-3">
                <View className="flex-1">
                  <Text className="mb-1 text-sm font-bold text-ink">PAN</Text>
                  <TextInput
                    value={draft.pan}
                    onChangeText={(pan) => patch({ pan })}
                    placeholder="601234567"
                    {...field}
                    className={inputClass}
                  />
                </View>
                <View className="flex-1">
                  <Text className="mb-1 text-sm font-bold text-ink">
                    VAT label
                  </Text>
                  <TextInput
                    value={draft.vatLabel}
                    onChangeText={(vatLabel) => patch({ vatLabel })}
                    placeholder="VAT / 13%"
                    {...field}
                    className={inputClass}
                  />
                </View>
              </View>
              {hint(
                "Tax details print on order summaries. Leave empty if the company is not VAT registered.",
              )}
            </>
          )}
          {section === "contact" && (
            <>
              <View className="mb-3 flex-row gap-3">
                <View className="flex-1">
                  <Text className="mb-1 text-sm font-bold text-ink">
                    Email *
                  </Text>
                  <TextInput
                    value={draft.email}
                    onChangeText={(email) => patch({ email })}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="genumsolutions@gmail.com"
                    {...field}
                    className={inputClass}
                  />
                </View>
                <View className="flex-1">
                  <Text className="mb-1 text-sm font-bold text-ink">Phone</Text>
                  <TextInput
                    value={draft.phone}
                    onChangeText={(phone) => patch({ phone })}
                    keyboardType="phone-pad"
                    placeholder="+977 98…"
                    {...field}
                    className={inputClass}
                  />
                </View>
              </View>
              {hint(
                "The public contact address for messages, quotes and order questions.",
              )}
              <Text className="mb-1 mt-3 text-sm font-bold text-ink">
                Description
              </Text>
              <TextInput
                value={draft.description}
                onChangeText={(description) => patch({ description })}
                multiline
                placeholder="What the company does, in one short paragraph."
                style={{ textAlignVertical: "top" }}
                {...field}
                className={`mb-3 min-h-20 ${inputClass}`}
              />
              {hint(
                "Used on the Contact page and in search-engine summaries. Keep it to two or three sentences.",
              )}
            </>
          )}
          {section === "social" && (
            <>
              {/* C5 (2026-09-23): socials + WhatsApp — shared with the website.
              Empty = that surface is hidden. WhatsApp is stored digits-only
              (country code + number, no '+'). */}
              <Text className="mb-1 text-sm font-bold text-ink">
                WhatsApp number
              </Text>
              <TextInput
                value={draft.whatsappNumber}
                onChangeText={(whatsappNumber) => patch({ whatsappNumber })}
                keyboardType="phone-pad"
                placeholder="97798XXXXXXXX"
                {...field}
                className={`mb-3 ${inputClass}`}
              />
              {hint(
                "Digits only, with the country code and no plus sign. Leave empty to hide the WhatsApp button.",
              )}
              <Text className="mb-1 text-sm font-bold text-ink">
                Website URL
              </Text>
              <TextInput
                value={draft.url ?? ""}
                onChangeText={(url) => patch({ url })}
                autoCapitalize="none"
                placeholder="https://genumsolutions.com.np"
                {...field}
                className={`mb-3 ${inputClass}`}
              />
              {hint("Linked from the app's About screen and the site footer.")}
              {(
                [
                  ["facebookUrl", "Facebook URL", "https://facebook.com/…"],
                  ["instagramUrl", "Instagram URL", "https://instagram.com/…"],
                  ["tiktokUrl", "TikTok URL", "https://tiktok.com/@…"],
                  [
                    "linkedinUrl",
                    "LinkedIn URL",
                    "https://linkedin.com/company/…",
                  ],
                  ["youtubeUrl", "YouTube URL", "https://youtube.com/@…"],
                ] as const
              ).map(([key, label, placeholder]) => (
                <View key={key}>
                  <Text className="mb-1 text-sm font-bold text-ink">
                    {label}
                  </Text>
                  <TextInput
                    value={draft[key] ?? ""}
                    onChangeText={(value) => patch({ [key]: value })}
                    autoCapitalize="none"
                    placeholder={placeholder}
                    {...field}
                    className={`mb-3 ${inputClass}`}
                  />
                </View>
              ))}
              {hint(
                "Any social left empty is hidden rather than linking nowhere.",
              )}
            </>
          )}
          {error ? (
            <Text className="mb-2 text-sm font-semibold text-red-600">
              {error}
            </Text>
          ) : null}
          {/* Save is shared by all three groups: one write to company_info. */}
          <View className="mt-1 flex-row items-center gap-3 border-t border-line pt-3">
            <Pressable
              onPress={() => void save()}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Save company information"
              className={`rounded-full bg-navy px-5 py-2 ${saving ? "opacity-60" : ""}`}
            >
              <Text className="text-xs font-black text-white">
                {saving ? "Saving…" : "Save company"}
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
  const editorOpen = editing != null;
  useEffect(() => {
    onEditingChange(editorOpen);
  }, [editorOpen, onEditingChange]);
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
      {editing ? (
        <AdminEditorSheet
          visible
          title={isNew ? "Add a training program" : `Edit ${editing.id}`}
          onClose={() => setEditing(null)}
        >
          <Text className="mb-1 text-sm font-bold text-ink">Title</Text>
          <TextInput
            value={editing.title}
            onChangeText={(title) => patch({ title })}
            className={`mb-2 ${inputClass}`}
          />
          <Text className="mb-1 text-sm font-bold text-ink">Audience</Text>
          <TextInput
            value={editing.audience}
            onChangeText={(audience) => patch({ audience })}
            className={`mb-2 ${inputClass}`}
            placeholder="Students / Teachers / Makers"
          />
          <Text className="mb-1 text-sm font-bold text-ink">Duration</Text>
          <TextInput
            value={editing.duration}
            onChangeText={(duration) => patch({ duration })}
            className={`mb-2 ${inputClass}`}
            placeholder="2 hours / 4 sessions"
          />
          <Text className="mb-1 text-sm font-bold text-ink">Description</Text>
          <TextInput
            value={editing.description}
            onChangeText={(description) => patch({ description })}
            multiline
            className={`mb-2 ${inputClass}`}
          />
          <Text className="mb-1 text-sm font-bold text-ink">Outcome</Text>
          <TextInput
            value={editing.outcome}
            onChangeText={(outcome) => patch({ outcome })}
            multiline
            className={`mb-2 ${inputClass}`}
          />
          <Text className="mb-1 text-sm font-bold text-ink">Sort order</Text>
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
        </AdminEditorSheet>
      ) : null}
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
              <Text className="mt-2 font-display text-base font-bold text-ink">
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
  const editorOpen = editing != null;
  useEffect(() => {
    onEditingChange(editorOpen);
  }, [editorOpen, onEditingChange]);
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
      {editing ? (
        <AdminEditorSheet
          visible
          title={isNew ? "Add a cost line" : `Edit ${editing.id}`}
          onClose={() => setEditing(null)}
        >
          <Text className="mb-1 text-sm font-bold text-ink">Item</Text>
          <TextInput
            value={editing.item}
            onChangeText={(item) => patch({ item })}
            className={`mb-2 ${inputClass}`}
          />
          <Text className="mb-1 text-sm font-bold text-ink">Cost</Text>
          <TextInput
            value={editing.cost}
            onChangeText={(cost) => patch({ cost })}
            className={`mb-2 ${inputClass}`}
            placeholder="NPR 25,000 / month"
          />
          <Text className="mb-1 text-sm font-bold text-ink">Note</Text>
          <TextInput
            value={editing.note}
            onChangeText={(note) => patch({ note })}
            multiline
            className={`mb-2 ${inputClass}`}
          />
          <Text className="mb-1 text-sm font-bold text-ink">Sort order</Text>
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
        </AdminEditorSheet>
      ) : null}
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
              <Text className="mt-2 font-display text-base font-bold text-ink">
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
  const editorOpen = editing != null;
  useEffect(() => {
    onEditingChange(editorOpen);
  }, [editorOpen, onEditingChange]);
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
      {editing ? (
        <AdminEditorSheet
          visible
          title={isNew ? "Add a curriculum highlight" : `Edit ${editing.id}`}
          onClose={() => setEditing(null)}
        >
          <Text className="mb-1 text-sm font-bold text-ink">Age band</Text>
          <TextInput
            value={editing.ageBand}
            onChangeText={(ageBand) => patch({ ageBand })}
            className={`mb-2 ${inputClass}`}
            placeholder="Ages 8-11"
          />
          <Text className="mb-1 text-sm font-bold text-ink">
            Skills / items (one per line)
          </Text>
          <TextInput
            value={editing.items.join("\n")}
            onChangeText={(v) => patch({ items: toStringArrayLines(v) })}
            multiline
            style={{ textAlignVertical: "top" }}
            className={`mb-2 min-h-20 ${inputClass}`}
          />
          <Text className="mb-1 text-sm font-bold text-ink">Sort order</Text>
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
        </AdminEditorSheet>
      ) : null}
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
              <Text className="mt-2 font-display text-base font-bold text-ink">
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
  // 2026-11-14 (owner: buttons looked "stretched and uncanny"): a row's
  // default `alignItems: stretch` made these pills grow to the height of the
  // tallest sibling, and with no height floor a one-word label rendered as a
  // squashed lozenge. Now: 36px floor, centred single-line label, its own
  // alignment (self-start) so a card never stretches it, a 6px hit slop and an
  // explicit button role for screen readers.
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      className={`min-h-9 shrink-0 self-start items-center justify-center rounded-full px-3.5 ${
        tone === "navy"
          ? "bg-navy"
          : tone === "red"
            ? "border border-red-200 bg-card"
            : "border border-line bg-card"
      }`}
    >
      <Text
        numberOfLines={1}
        className={`text-sm font-black ${tone === "navy" ? "text-white" : tone === "red" ? "text-red-600" : "text-ink"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** 2026-11-18: one image renderer for every admin preview.
 *
 * A load that fails used to paint an empty grey rounded box — the owner read it
 * as "only the compressed type box like an error". A preview must either show
 * the picture or say, in words, that it could not be loaded; never a silent
 * empty frame. */
function PreviewImage({
  uri,
  label,
  className,
  resizeMode = "cover",
}: {
  uri?: string;
  label: string;
  className?: string;
  resizeMode?: "cover" | "contain";
}) {
  const [failed, setFailed] = useState(false);
  if (!uri) {
    return (
      <View
        className={`items-center justify-center bg-mist ${className ?? ""}`}
      >
        <Text className="px-4 text-center text-xs text-muted">
          No image added yet.
        </Text>
      </View>
    );
  }
  if (failed) {
    return (
      <View
        className={`items-center justify-center bg-mist ${className ?? ""}`}
      >
        <Feather name="image" size={18} color="#64748b" />
        <Text className="mt-1 px-4 text-center text-xs text-muted">
          This image could not be loaded.
        </Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      className={className}
      resizeMode={resizeMode}
      accessibilityLabel={label}
      onError={() => setFailed(true)}
    />
  );
}

/** Full-size look at an imported picture. 2026-11-14 (owner: "add the imported
 * picture preview") — admin thumbnails are 64–80px, too small to tell one
 * model's photo from another's. Tap the image, see it whole, close. */
function ImagePreviewModal({
  uri,
  label,
  onClose,
}: {
  uri: string;
  label: string;
  onClose: () => void;
}) {
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(15, 23, 42, 0.94)",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close image preview"
      >
        <Pressable onPress={() => {}} className="w-full items-center gap-3">
          <Image
            source={{ uri }}
            style={{ width: "100%", height: 380 }}
            resizeMode="contain"
            accessibilityLabel={label}
          />
          <Text
            numberOfLines={2}
            className="text-center text-xs font-bold text-white"
          >
            {label}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close image preview"
            className="min-h-11 items-center justify-center rounded-full bg-card px-6"
          >
            <Text className="text-xs font-black text-ink">Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
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
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(15, 23, 42, 0.7)",
          alignItems: "center",
          justifyContent: "center",
          padding: 12,
        }}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close storefront preview"
      >
        <Pressable
          onPress={() => {}}
          className="w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-card"
        >
          <View className="flex-row items-center justify-between gap-2 p-4">
            <View className="min-w-0 flex-1">
              <Text className="text-xs font-black uppercase tracking-widest text-navy">
                App storefront preview
              </Text>
              <Text className="mt-1 text-[10px] text-muted">
                Exactly what a customer sees in the app
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close storefront preview"
              className="h-10 w-10 items-center justify-center rounded-full border border-line"
            >
              <Feather name="x" size={18} color="#1e293b" />
            </Pressable>
          </View>
          <View className="border-y border-line bg-surface py-2">
            <View className="flex-row items-center justify-between px-4">
              <Text
                className="min-w-0 flex-1 text-xs font-black uppercase tracking-widest text-navy"
                numberOfLines={1}
              >
                {product.category}
              </Text>
              <Text
                className={`ml-2 shrink-0 text-[10px] font-black uppercase ${product.active ? "text-emerald-600" : "text-red-500"}`}
              >
                {product.active ? "Published" : "Hidden"}
              </Text>
            </View>
            {/* 2026-11-18 (owner): the preview rendered one card at 48% of a
                343px grid — a ~165px card, which read as a compressed box and
                not as the customer's screen. It is now a full-width article:
                the real cover at a readable size, then the same name, price,
                category and copy the storefront shows. */}
            <ScrollView
              className="max-h-[62vh]"
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              <PreviewImage
                uri={product.image}
                label={product.name ? `${product.name} cover` : "Product cover"}
                className="h-56 w-full"
              />
              {Array.isArray(product.gallery) && product.gallery.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{
                    gap: 8,
                    paddingHorizontal: 16,
                    paddingTop: 10,
                  }}
                >
                  {clampGallery(product.gallery).map((uri, index) => (
                    <PreviewImage
                      key={`${uri}-${index}`}
                      uri={uri}
                      label={`${product.name || "Product"} gallery ${index + 1}`}
                      className="h-16 w-16 rounded-lg"
                    />
                  ))}
                </ScrollView>
              ) : null}
              <View className="px-4 pt-3">
                <Text className="text-[10px] font-black uppercase tracking-widest text-navy">
                  {product.category || "Uncategorised"}
                </Text>
                <Text className="mt-1 font-display text-lg font-bold leading-snug text-ink">
                  {product.name || "(untitled)"}
                </Text>
                <Text className="mt-1 text-base font-bold text-ink">
                  {product.priceLabel || "—"}
                </Text>
                {product.note || product.description ? (
                  <Text className="mt-2 text-sm leading-5 text-muted">
                    {product.note || product.description}
                  </Text>
                ) : null}
                {product.specs.length > 0 ? (
                  <View className="mt-3">
                    {product.specs.slice(0, 6).map((spec, index) => (
                      <Text
                        key={`${spec}-${index}`}
                        className="text-xs leading-5 text-muted"
                      >
                        · {spec}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            </ScrollView>
          </View>
          <Text className="p-4 pt-3 text-[10px] leading-4 text-muted">
            Customer card for {product.name}: {product.priceLabel}.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
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
            <PreviewImage
              uri={image}
              label={`${title || "Listing"} image`}
              className="h-52 w-full bg-ink"
            />
          ) : null}
          <View className="p-5">
            <View className="flex-row items-center justify-between">
              <Text
                className="shrink-0 text-xs font-black uppercase tracking-widest text-navy"
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
            <View className="mt-3">
              {/* The storefront's own ServiceCard, not a redrawing of it: a
                  preview that disagrees with /services is worse than none. */}
              <ServiceCard
                service={{
                  id: title,
                  name: title,
                  category: typeLabel,
                  priceLabel,
                  description: body,
                  tag: typeLabel,
                  sortOrder: 0,
                  active,
                }}
              />
            </View>
            <View className="mb-4 flex-row justify-end">
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
import { Feather } from "@expo/vector-icons";
