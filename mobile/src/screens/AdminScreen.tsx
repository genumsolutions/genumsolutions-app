// =====================================================================
// AdminScreen - native admin dashboard mirroring the website AdminPanel.
// Tabs: Dashboard, Orders, Products, Services, Users, Messages, Content.
// =====================================================================
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import PagerView from 'react-native-pager-view'
import type { PagerViewOnPageSelectedEvent } from 'react-native-pager-view'
import { useApp } from '../context/AppContext'
import { CategoryDropdown } from '../components/CategoryDropdown'
import { isProjectPackage } from '../services/projectService'
import { fetchSiteContent, upsertSiteContent } from '../services/orderService'
import {
  listAdminOrders,
  updateOrderStatus,
  listAdminProducts,
  upsertAdminProduct,
  deleteAdminProduct,
  listAdminServices,
  upsertAdminService,
  deleteAdminService,
  listAdminUsers,
  toggleAdminRole,
  listAdminMessages,
  markMessageReplied,
  fetchDashboardStats,
  fetchAdminAnalytics,
  listAdminActivity,
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
} from '../services/adminService'

type Tab = 'Dashboard' | 'Orders' | 'Products' | 'ProjectPackages' | 'Services' | 'Journal' | 'Users' | 'Messages' | 'Finance' | 'Activity' | 'Content' | 'Settings'

const TABS: Tab[] = ['Dashboard', 'Orders', 'Products', 'ProjectPackages', 'Services', 'Journal', 'Users', 'Messages', 'Finance', 'Activity', 'Content', 'Settings']

export function AdminScreen() {
  const { isAdmin, signOut } = useApp()
  const [tab, setTab] = useState<Tab>('Dashboard')
  const pagerRef = useRef<PagerView>(null)
  const tabScrollRef = useRef<ScrollView>(null)
  const currentPageRef = useRef<number>(0)
  const [visited, setVisited] = useState<Record<string, boolean>>({ Dashboard: true })
  const [loading, setLoading] = useState(false)

  // Keep the horizontal tab strip scrolled so the active tab stays visible.
  useEffect(() => {
    const index = TABS.indexOf(tab)
    if (index < 0) return
    tabScrollRef.current?.scrollTo({ x: index * 96 - 40, y: 0, animated: true })
  }, [tab])

  // Orders
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [ordersTotal, setOrdersTotal] = useState(0)
  const [ordersPage, setOrdersPage] = useState(1)
  const [ordersTotalPages, setOrdersTotalPages] = useState(1)
  const [orderQuery, setOrderQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Products
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [productQuery, setProductQuery] = useState('')

  // Services
  const [services, setServices] = useState<AdminService[]>([])

  // Journal posts
  const [journals, setJournals] = useState<AdminJournalPost[]>([])
  const [journalOpen, setJournalOpen] = useState(false)
  const [journalEditId, setJournalEditId] = useState('')
  const [journalTag, setJournalTag] = useState('')
  const [journalTitle, setJournalTitle] = useState('')
  const [journalText, setJournalText] = useState('')
  const [journalSort, setJournalSort] = useState('0')
  const [journalActive, setJournalActive] = useState(true)

  // Users
  const [users, setUsers] = useState<AdminUser[]>([])
  const [usersPage, setUsersPage] = useState(1)
  const [usersTotal, setUsersTotal] = useState(0)
  const [usersTotalPages, setUsersTotalPages] = useState(1)
  const [userQuery, setUserQuery] = useState('')

  // Messages
  const [messages, setMessages] = useState<AdminMessage[]>([])
  const [messagesPage, setMessagesPage] = useState(1)
  const [messagesTotalPages, setMessagesTotalPages] = useState(1)
  const [messagesTotal, setMessagesTotal] = useState(0)
  const [messageStatus, setMessageStatus] = useState('')

  // Site content
  const [siteContent, setSiteContent] = useState<{ id: number; home_title: string; home_body: string } | null>(null)
  const [contentTitle, setContentTitle] = useState('')
  const [contentBody, setContentBody] = useState('')
  const [contentSaved, setContentSaved] = useState(false)

  // Dashboard
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null)

  // Activity
  const [activities, setActivities] = useState<ActivityEntry[]>([])
  const [activityPage, setActivityPage] = useState(1)
  const [activityTotal, setActivityTotal] = useState(0)
  const [activityTotalPages, setActivityTotalPages] = useState(1)

  // Settings (company + programs)
  const [companyInfo, setCompanyInfo] = useState<AdminCompanyInfo | null>(null)
  const [trainingPrograms, setTrainingPrograms] = useState<AdminTrainingProgram[]>([])
  const [pilotCostLines, setPilotCostLines] = useState<AdminPilotCostLine[]>([])
  const [curriculumHighlights, setCurriculumHighlights] = useState<AdminCurriculumHighlight[]>([])

  // Editing
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null)
  const [editingService, setEditingService] = useState<AdminService | null>(null)

  useEffect(() => {
    void loadTab()
  }, [tab])

  async function loadTab() {
    setLoading(true)
    try {
      if (tab === 'Dashboard') {
        setStats(await fetchDashboardStats())
        // Analytics is best-effort: a page_views query failure (e.g. RLS)
        // shouldn't break the rest of the dashboard.
        try {
          setAnalytics(await fetchAdminAnalytics(30))
        } catch (e) {
          console.error('Admin analytics load error:', e)
          setAnalytics(null)
        }
      } else if (tab === 'Orders') {
        void loadOrders(1)
      } else if (tab === 'Products' || tab === 'ProjectPackages') {
        setProducts(await listAdminProducts())
      } else if (tab === 'Services') {
        setServices(await listAdminServices())
      } else if (tab === 'Journal') {
        setJournals(await listAdminJournalPosts())
      } else if (tab === 'Users') {
        void loadUsers(1)
      } else if (tab === 'Messages') {
        void loadMessages(1)
      } else if (tab === 'Finance') {
        // Finance uses the same stats as Dashboard
        if (!stats) setStats(await fetchDashboardStats())
      } else if (tab === 'Activity') {
        void loadActivity(1)
      } else if (tab === 'Content') {
        const result = await fetchSiteContent()
        const content = result?.content
        if (content) {
          setSiteContent(content)
          setContentTitle(content.home_title || '')
          setContentBody(content.home_body || '')
        }
      } else if (tab === 'Settings') {
        setCompanyInfo(await getCompanyInfo())
        setTrainingPrograms(await listAdminTrainingPrograms())
        setPilotCostLines(await listAdminPilotCostLines())
        setCurriculumHighlights(await listAdminCurriculumHighlights())
      }
    } catch (e) {
      console.error('Admin load error:', e)
    } finally {
      setLoading(false)
      setVisited((v) => ({ ...v, [tab]: true }))
    }
  }

  async function loadOrders(page: number) {
    const result = await listAdminOrders(page, 20, statusFilter || undefined, orderQuery.trim() || undefined)
    setOrders(result.orders)
    setOrdersTotal(result.total)
    setOrdersPage(result.page)
    setOrdersTotalPages(result.totalPages)
  }

  async function loadMessages(page: number) {
    const result = await listAdminMessages(page, 20, messageStatus || undefined)
    setMessages(result.messages)
    setMessagesPage(result.page)
    setMessagesTotal(result.total)
    setMessagesTotalPages(result.totalPages)
  }

  async function loadUsers(page: number) {
    const result = await listAdminUsers(page, 10, userQuery.trim() || undefined)
    setUsers(result.users)
    setUsersPage(result.page)
    setUsersTotal(result.total)
    setUsersTotalPages(result.totalPages)
  }

  async function handleUpdateOrderStatus(orderId: string, status: string) {
    await updateOrderStatus(orderId, status)
    void loadOrders(ordersPage)
  }

  /** Validate + persist a product, then refresh the current tab's rows. */
  async function saveProduct(product: AdminProduct): Promise<boolean> {
    const normalized = { ...product, id: product.id.trim().toLowerCase().replace(/\s+/g, '-') }
    if (!normalized.id || !normalized.name.trim()) {
      Alert.alert('Missing fields', 'Give the product at least an id and a name.')
      return false
    }
    await upsertAdminProduct(normalized)
    await loadTab()
    return true
  }

  async function handleSaveProduct() {
    if (!editingProduct) return
    if (await saveProduct(editingProduct)) setEditingProduct(null)
  }

  function handleDeleteProduct(id: string) {
    Alert.alert(
      'Delete Product',
      `Are you sure you want to delete product ${id.slice(0, 8)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteAdminProduct(id)
            void loadTab()
          },
        },
      ],
    )
  }

  async function handleSaveService() {
    if (!editingService) return
    const normalized = { ...editingService, id: editingService.id.trim().toLowerCase().replace(/\s+/g, '-') }
    if (!normalized.id || !normalized.name.trim()) {
      Alert.alert('Missing fields', 'A service needs at least an id and a name.')
      return
    }
    await upsertAdminService(normalized)
    setEditingService(null)
    void loadTab()
  }

  function handleDeleteService(id: string) {
    Alert.alert(
      'Delete Service',
      `Are you sure you want to delete this service?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteAdminService(id)
            void loadTab()
          },
        },
      ],
    )
  }

  function blankProduct(productType: string, category = 'Controllers & Boards'): AdminProduct {
    return {
      id: '', name: '', category, price: 0, priceLabel: 'Request quote', sku: '',
      productType, inventoryType: null, note: '', description: '', specs: [], stock: 0,
      delivery: 'Ships in 1-2 working days', image: '', badge: null, active: true, sortOrder: 1000,
      projectOverview: '', objectives: [], materialsRequired: [], learningOutcomes: [], buildSteps: [],
      controlMethods: [], prerequisites: [], deliverables: [], estimatedDuration: '', sourceFolder: '',
      documentationUrl: '', videoUrl: '', maintenanceNotes: '', audience: '', difficulty: 'Beginner', warranty: '',
    }
  }

  function blankService(): AdminService {
    return { id: '', name: '', category: 'General', priceLabel: 'Request quote', description: '', tag: '', sortOrder: 1000, active: true }
  }

  async function handleToggleProductActive(product: AdminProduct) {
    await upsertAdminProduct({ ...product, active: !product.active })
    void loadTab()
  }

  async function handleToggleServiceActive(service: AdminService) {
    await upsertAdminService({ ...service, active: !service.active })
    void loadTab()
  }

  function handleNewProduct() {
    setEditingProduct(blankProduct('Retail kit'))
    setEditingService(null)
  }

  function handleNewService() {
    setEditingService(blankService())
    setEditingProduct(null)
  }

  // --- Journal post handlers ---

  function startEditJournal(post: AdminJournalPost | null) {
    setJournalOpen(true)
    setJournalEditId(post?.id ?? '')
    setJournalTag(post?.tag ?? '')
    setJournalTitle(post?.title ?? '')
    setJournalText(post?.text ?? '')
    setJournalSort(String(post?.sortOrder ?? 0))
    setJournalActive(post ? post.active : true)
  }

  function slugify(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
  }

  async function handleSaveJournal() {
    if (!journalTitle.trim()) {
      Alert.alert('Missing title', 'A journal post needs a title.')
      return
    }
    try {
      await upsertAdminJournalPost({
        id: journalEditId.trim() ? slugify(journalEditId) : slugify(journalTitle),
        tag: journalTag.trim(),
        title: journalTitle.trim(),
        text: journalText.trim(),
        active: journalActive,
        sortOrder: Math.max(0, Number(journalSort) || 0),
      })
      setJournalOpen(false)
      void loadTab()
    } catch (e) {
      console.error('Journal save error:', e)
    }
  }

  function handleDeleteJournal(id: string) {
    Alert.alert(
      'Delete Journal Post',
      `Delete journal post "${id}"? This also removes it from the website.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteAdminJournalPost(id)
            void loadTab()
          },
        },
      ],
    )
  }

  async function handleToggleJournalPublished(post: AdminJournalPost) {
    try {
      await upsertAdminJournalPost({ ...post, active: !post.active })
      void loadTab()
    } catch (e) {
      console.error('Journal publish toggle error:', e)
    }
  }

  function handleToggleUserRole(user: AdminUser) {
    const newRole = user.role === 'admin' ? 'customer' : 'admin'
    Alert.alert(
      'Change role',
      newRole === 'admin'
        ? `Grant admin access to ${user.email}?`
        : `Revoke admin access from ${user.email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: newRole === 'admin' ? 'Make admin' : 'Revoke admin',
          style: newRole === 'admin' ? 'default' : 'destructive',
          onPress: async () => {
            try {
              await toggleAdminRole(user.id, newRole)
              void loadUsers(usersPage)
            } catch (e) {
              console.error('Role toggle error:', e)
            }
          },
        },
      ],
    )
  }

  async function loadActivity(page: number) {
    const result = await listAdminActivity(page, 20)
    setActivities(result.entries)
    setActivityPage(result.page)
    setActivityTotal(result.total)
    setActivityTotalPages(result.totalPages)
  }

  async function handleMarkReplied(id: string) {
    await markMessageReplied(id)
    void loadMessages(messagesPage)
  }

  const onPageSelected = useCallback((event: PagerViewOnPageSelectedEvent) => {
    const index = event.nativeEvent.position
    currentPageRef.current = index
    const key = TABS[index]
    if (key) {
      setTab(key)
      setEditingProduct(null)
      setEditingService(null)
      setJournalOpen(false)
    }
  }, [])

  const goToTab = useCallback((key: Tab) => {
    const index = TABS.indexOf(key)
    if (index < 0 || index === currentPageRef.current) return
    currentPageRef.current = index
    setTab(key)
    setEditingProduct(null)
    setEditingService(null)
    setJournalOpen(false)
    pagerRef.current?.setPage(index)
  }, [])

  function renderTabContent(t: Tab) {
    switch (t) {
      case 'Dashboard':
        return <DashboardTab stats={stats} analytics={analytics} />
      case 'Orders':
        return (
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
            onStatusFilter={(s) => { setStatusFilter(s); void loadOrders(1) }}
            onApply={() => void loadOrders(1)}
          />
        )
      case 'Products':
        return (
          <ProductsTab
            products={products}
            query={productQuery}
            onQueryChange={setProductQuery}
            editing={editingProduct}
            onChange={setEditingProduct}
            onEdit={(product) => {
              setEditingProduct(product)
              if (product) goToTab('Products')
            }}
            onNew={handleNewProduct}
            onSave={handleSaveProduct}
            onDelete={handleDeleteProduct}
            onToggleActive={(p) => void handleToggleProductActive(p)}
          />
        )
      case 'ProjectPackages':
        return (
          <ProjectTab
            title="Project packages"
            products={products.filter(isProjectPackage)}
            onSaveProduct={saveProduct}
            onDelete={handleDeleteProduct}
            onToggleActive={(p) => void handleToggleProductActive(p)}
          />
        )
      case 'Services':
        return (
          <ServicesTab
            services={services}
            editing={editingService}
            onChange={setEditingService}
            onEdit={setEditingService}
            onNew={handleNewService}
            onSave={handleSaveService}
            onDelete={handleDeleteService}
            onToggleActive={(s) => void handleToggleServiceActive(s)}
          />
        )
      case 'Journal':
        return (
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
            onTogglePublish={(post) => void handleToggleJournalPublished(post)}
            onDelete={handleDeleteJournal}
            onEditIdChange={setJournalEditId}
            onTagChange={setJournalTag}
            onTitleChange={setJournalTitle}
            onTextChange={setJournalText}
            onSortChange={setJournalSort}
            onActiveChange={setJournalActive}
            onSave={() => void handleSaveJournal()}
            onCancel={() => setJournalOpen(false)}
          />
        )
      case 'Users':
        return (
          <UsersTab
            users={users}
            total={usersTotal}
            page={usersPage}
            totalPages={usersTotalPages}
            query={userQuery}
            onQueryChange={setUserQuery}
            onApply={() => void loadUsers(1)}
            onPage={(p) => void loadUsers(p)}
            onToggleRole={handleToggleUserRole}
          />
        )
      case 'Messages':
        return (
          <MessagesTab
            messages={messages}
            total={messagesTotal}
            page={messagesPage}
            totalPages={messagesTotalPages}
            onPage={(p) => void loadMessages(p)}
            status={messageStatus}
            onStatusFilter={(s) => { setMessageStatus(s); void loadMessages(1) }}
            onMarkReplied={handleMarkReplied}
          />
        )
      case 'Finance':
        return <FinanceTab stats={stats} />
      case 'Activity':
        return (
          <ActivityTab
            activities={activities}
            page={activityPage}
            totalPages={activityTotalPages}
            total={activityTotal}
            onLoadMore={(p) => loadActivity(p)}
          />
        )
      case 'Content':
        return (
          <ContentTab
            siteContent={siteContent}
            contentTitle={contentTitle}
            contentBody={contentBody}
            onTitleChange={setContentTitle}
            onBodyChange={setContentBody}
            onSave={async () => {
              if (!siteContent) return
              setContentSaved(false)
              try {
                await upsertSiteContent({ id: siteContent.id, home_title: contentTitle, home_body: contentBody })
                setContentSaved(true)
              } catch (e) {
                console.error('Site content save error:', e)
              }
            }}
            saved={contentSaved}
          />
        )
      case 'Settings':
        return (
          <SettingsTab
            company={companyInfo}
            setCompany={setCompanyInfo}
            trainingPrograms={trainingPrograms}
            setTrainingPrograms={setTrainingPrograms}
            pilotCostLines={pilotCostLines}
            setPilotCostLines={setPilotCostLines}
            curriculumHighlights={curriculumHighlights}
            setCurriculumHighlights={setCurriculumHighlights}
            onCompanySaved={async (next) => { await saveCompanyInfo(next); setCompanyInfo(next) }}
            onSaveProgram={async (program, isNew) => {
              await upsertAdminTrainingProgram(program)
              setTrainingPrograms(await listAdminTrainingPrograms())
            }}
            onDeleteProgram={async (id) => {
              await deleteAdminTrainingProgram(id)
              setTrainingPrograms(await listAdminTrainingPrograms())
            }}
            onSavePilotLine={async (line, isNew) => {
              await upsertAdminPilotCostLine(line)
              setPilotCostLines(await listAdminPilotCostLines())
            }}
            onDeletePilotLine={async (id) => {
              await deleteAdminPilotCostLine(id)
              setPilotCostLines(await listAdminPilotCostLines())
            }}
            onSaveCurriculum={async (highlight, isNew) => {
              await upsertAdminCurriculumHighlight(highlight)
              setCurriculumHighlights(await listAdminCurriculumHighlights())
            }}
            onDeleteCurriculum={async (id) => {
              await deleteAdminCurriculumHighlight(id)
              setCurriculumHighlights(await listAdminCurriculumHighlights())
            }}
          />
        )
    }
  }

  return (
    <View className="flex-1 bg-mist">
      {/* Tab bar — grow-0 keeps the strip at its own height: RN ScrollViews
          default to flexGrow:1, so without it the strip stretches into a huge
          empty band under the tabs whenever the tab content is shorter than
          the screen. */}
      <ScrollView
        ref={tabScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        className="grow-0 shrink-0 border-b border-line bg-card"
      >
        <View className="flex-row">
          {TABS.map((t) => (
            <Pressable
              key={t}
              onPress={() => goToTab(t)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              accessibilityLabel={t}
              className={`px-4 py-3 border-b-2 ${tab === t ? 'border-navy' : 'border-transparent'}`}
            >
              <Text className={`text-xs font-bold ${tab === t ? 'text-navy' : 'text-muted'}`}>{t}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="small" color="#1e3a8a" className="py-1.5" />
      ) : null}

      {/* Swipeable tab content — each of the 12 tabs is a pager page synced
          with the tab strip above (swipe -> onPageSelected -> setTab; tab tap
          -> goToTab -> setPage). Pages mount lazily on first visit so the
          admin doesn't fire all 12 data loads at once, then stay mounted so
          per-tab state (search, category, page) survives swiping away. */}
      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageSelected={onPageSelected}
        offscreenPageLimit={1}
      >
        {TABS.map((t) => (
          <View key={t} className="flex-1 bg-mist">
            {visited[t] ? renderTabContent(t) : <View className="flex-1" />}
          </View>
        ))}
      </PagerView>
    </View>
  )
}

/** Split a multi-line TextInput value into a trimmed, non-empty string array. */
function toStringArrayLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

// ─── Sub-tabs ────────────────────────────────────────────────────────

/** A blank project-package row for the Project packages tab's "+ New project". */
function blankProjectProduct(): AdminProduct {
  return {
    id: '', name: '', category: 'Project Packages', price: 0, priceLabel: 'Request quote', sku: '',
    productType: 'Project package', inventoryType: null, note: '', description: '', specs: [], stock: 0,
    delivery: 'Ships in 1-2 working days', image: '', badge: null, active: true, sortOrder: 1000,
    projectOverview: '', objectives: [], materialsRequired: [], learningOutcomes: [], buildSteps: [],
    controlMethods: [], prerequisites: [], deliverables: [], estimatedDuration: '', sourceFolder: '',
    documentationUrl: '', videoUrl: '', maintenanceNotes: '', audience: '', difficulty: 'Beginner', warranty: '',
  }
}

function DashboardTab({ stats, analytics }: { stats: DashboardStats | null; analytics: AdminAnalytics | null }) {
  if (!stats) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    )
  }

  const conversionRate = stats.totalOrders > 0 && stats.totalUsers > 0
    ? `${((stats.succeededTransactions / Math.max(1, stats.totalUsers)) * 100).toFixed(1)}%`
    : '—'

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text className="font-display text-2xl font-bold tracking-tight text-ink">Dashboard</Text>
      <View className="mt-3 flex-row flex-wrap gap-3">
        <StatCard label="Revenue" value={formatNPR(stats.revenue)} sub={`Today: ${formatNPR(stats.revenueToday)}`} />
        <StatCard label="Users" value={String(stats.totalUsers)} />
        <StatCard label="Orders" value={String(stats.totalOrders)} sub={`${stats.pendingOrders} pending`} />
        <StatCard label="Cart items" value={String(stats.totalCartItems)} sub={`${stats.activeCarts} active carts`} />
        <StatCard label="Products" value={String(stats.totalProducts)} sub={stats.lowStockProducts > 0 ? `${stats.lowStockProducts} low stock` : 'OK'} />
        <StatCard label="Messages" value={String(stats.totalMessages)} sub={`${stats.unreadMessages} unread`} />
        <StatCard label="Page Views (30d)" value={analytics ? String(analytics.totalViews) : '—'} sub={`Today: ${analytics?.todayViews ?? '—'}`} />
        <StatCard label="Conversion Rate" value={conversionRate} sub="Paid orders / users" />
      </View>

      {analytics && analytics.topPaths.length > 0 && (
        <View className="mt-3 rounded-xl border border-line bg-card p-4">
          <Text className="font-display text-lg font-bold text-ink">Top Pages (30 days)</Text>
          {analytics.topPaths.slice(0, 10).map((pv) => (
            <View key={pv.path} className="flex-row items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
              <Text className="min-w-0 flex-1 font-mono text-xs text-muted" numberOfLines={1}>{pv.path}</Text>
              <Text className="shrink-0 text-xs font-bold text-ink">{pv.count} views</Text>
            </View>
          ))}
        </View>
      )}

      {analytics && analytics.viewsByDay.length > 0 && (
        <View className="mt-3 rounded-xl border border-line bg-card p-4">
          <Text className="font-display text-lg font-bold text-ink">Daily Traffic (30 days)</Text>
          <View className="mt-3 flex-row items-end" style={{ height: 120 }}>
            {(() => {
              const max = Math.max(...analytics.viewsByDay.map((x) => x.count), 1)
              return analytics.viewsByDay.map((d) => (
                <View
                  key={d.date}
                  style={{
                    flex: 1,
                    height: Math.max((d.count / max) * 110, 2),
                    backgroundColor: '#1e3a8a',
                    marginHorizontal: 1,
                  }}
                />
              ))
            })()}
          </View>
          <View className="mt-1 flex-row justify-between">
            <Text className="text-[10px] text-muted">{analytics.viewsByDay[0]?.date}</Text>
            <Text className="text-[10px] text-muted">{analytics.viewsByDay[analytics.viewsByDay.length - 1]?.date}</Text>
          </View>
        </View>
      )}
    </ScrollView>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View className="w-[47%] rounded-xl border border-line bg-card p-4">
      <Text className="text-xs font-black uppercase tracking-widest text-muted">{label}</Text>
      <Text className="mt-2 font-display text-xl font-bold text-ink">{value}</Text>
      {sub && <Text className="mt-1 text-xs text-muted">{sub}</Text>}
    </View>
  )
}

function OrdersTab({ orders, total, page, totalPages, onPage, onStatusChange, query, onQueryChange, status, onStatusFilter, onApply }: {
  orders: AdminOrder[]; total: number; page: number; totalPages: number;
  onPage: (page: number) => void; onStatusChange: (id: string, s: string) => void;
  query: string; onQueryChange: (q: string) => void;
  status: string; onStatusFilter: (s: string) => void; onApply: () => void;
}) {
  const STATUSES = ['pending', 'paid', 'fulfilled', 'cancelled'] as const
  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {/* Heading + filters */}
      <View className="mb-3">
        <Text className="font-display text-xl font-bold text-ink">Customer orders ({total})</Text>
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
          {(['', ...STATUSES] as const).map((s) => (
            <Pressable
              key={s || 'all'}
              onPress={() => onStatusFilter(s)}
              className={`rounded-full px-3 py-1.5 ${status === s ? 'bg-navy' : 'border border-line bg-card'}`}
            >
              <Text className={`text-xs font-bold capitalize ${status === s ? 'text-white' : 'text-muted'}`}>{s || 'All'}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {orders.length === 0 ? (
        <Text className="py-8 text-center text-sm text-muted">No orders found.</Text>
      ) : (
        <>
          {orders.map((o) => (
            <View key={o.id} className="mb-3 rounded-xl border border-line bg-card p-4">
              <View className="flex-row items-center justify-between">
                <View className="min-w-0 flex-1 pr-2">
                  <Text className="text-sm font-bold text-ink">#{o.id.slice(0, 8).toUpperCase()} · NPR {o.totalNpr.toLocaleString('en-IN')}</Text>
                  <Text className="text-xs text-muted">{o.customerName} · {o.email}</Text>
                  {o.address ? <Text className="text-xs text-muted" numberOfLines={1}>{o.address}</Text> : null}
                  <Text className="text-xs text-muted">{o.provider ? `${o.provider} · ` : ''}{new Date(o.createdAt).toLocaleString()}</Text>
                </View>
                <Text className="shrink-0 text-xs font-bold uppercase text-navy">{o.status}</Text>
              </View>
              {o.items.length > 0 && (
                <View className="mt-2 border-t border-line pt-2">
                  {o.items.map((item, i) => (
                    <Text key={`${o.id}-${i}`} className="text-xs leading-5 text-muted" numberOfLines={1}>
                      {item.quantity} × {item.name} (NPR {(item.price * item.quantity).toLocaleString('en-IN')})
                    </Text>
                  ))}
                </View>
              )}
              <View className="mt-2 flex-row flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <Pressable key={s} onPress={() => onStatusChange(o.id, s)} className={`rounded-full px-3 py-1 ${o.status === s ? 'bg-navy' : 'border border-line'}`}>
                    <Text className={`text-xs font-bold ${o.status === s ? 'text-white' : 'text-muted'}`}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
          <AdminPager page={page} totalPages={totalPages} onPage={onPage} />
          <Text className="mt-1 text-center text-xs text-muted">{total} total order{total === 1 ? '' : 's'}</Text>
        </>
      )}
    </ScrollView>
  )
}

function ProductsTab({ products, query, onQueryChange, editing, onChange, onEdit, onNew, onSave, onDelete, onToggleActive }: {
  products: AdminProduct[]; query: string; onQueryChange: (q: string) => void;
  editing: AdminProduct | null; onChange: (p: AdminProduct) => void; onEdit: (p: AdminProduct | null) => void;
  onNew: () => void; onSave: () => void; onDelete: (id: string) => void; onToggleActive: (p: AdminProduct) => void;
}) {
  const [preview, setPreview] = useState<AdminProduct | null>(null)
  const [page, setPage] = useState(1)
  const [category, setCategory] = useState('All')
  const PAGE_SIZE = 8
  const categories = ['All', ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))]
  const needle = query.trim().toLowerCase()
  const filtered = products.filter((p) =>
    (category === 'All' || p.category === category) &&
    (!needle || `${p.name} ${p.sku} ${p.id} ${p.category}`.toLowerCase().includes(needle))
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  React.useEffect(() => { setPage(1) }, [query, category])

  if (editing) {
    return (
      <View className="flex-1">
        <ProductEditor product={editing} onChange={onChange} onSave={onSave} onCancel={() => onEdit(null)} isNew={!products.some((p) => p.id === editing.id)} categoryOptions={categories.filter((c) => c !== 'All')} />
      </View>
    )
  }

  return (
    <View className="flex-1">
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListHeaderComponent={
          <View className="mb-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-display text-xl font-bold text-ink">Products ({products.length})</Text>
              <Pressable onPress={onNew} className="rounded-full bg-navy px-4 py-2">
                <Text className="text-xs font-black text-white">+ New product</Text>
              </Pressable>
            </View>
            <View className="mt-3 flex-row items-center gap-2">
              <View className="flex-1">
                <CategoryDropdown
                  value={category}
                  options={categories}
                  onChange={setCategory}
                  placeholder="All categories"
                  title="Filter by category"
                />
              </View>
              <TextInput value={query} onChangeText={onQueryChange} placeholder="Search name, SKU, id…" className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink" />
            </View>
          </View>
        }
        ListEmptyComponent={<Text className="py-8 text-center text-sm text-muted">No products found.</Text>}
        ListFooterComponent={totalPages > 1 ? <AdminPager page={page} totalPages={totalPages} onPage={setPage} /> : null}
        renderItem={({ item }) => (
          <View className="mb-3 rounded-xl border border-line bg-card p-4">
            <View className="flex-row items-start">
              {item.image ? (
                <Image source={{ uri: item.image }} className="mr-3 h-14 w-14 rounded-lg bg-mist" resizeMode="cover" />
              ) : null}
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="shrink-1 text-sm font-bold text-ink" numberOfLines={1}>{item.name}</Text>
                  <Text className="shrink-0 text-xs font-black text-navy">{item.priceLabel || `NPR ${item.price.toLocaleString('en-IN')}`}</Text>
                </View>
                <Text className="mt-0.5 text-xs font-bold uppercase tracking-wide text-gold" numberOfLines={1}>{item.category}</Text>
                {!item.active && <Text className="mt-0.5 text-[10px] font-black uppercase text-red-500">Hidden from customers</Text>}
              </View>
            </View>
            <View className="mt-2 flex-row flex-wrap gap-2">
              <AdminAction onPress={() => onEdit(item)} label="Edit" tone="navy" />
              <AdminAction onPress={() => setPreview(item)} label="Preview" tone="plain" />
              <AdminAction onPress={() => onToggleActive(item)} label={item.active ? 'Hide' : 'Show'} tone="plain" />
              <AdminAction onPress={() => onDelete(item.id)} label="Delete" tone="red" />
            </View>
          </View>
        )}
      />
      {preview && <ProductPreviewModal product={preview} onClose={() => setPreview(null)} />}
    </View>
  )
}

function ProjectTab({ title, products, onSaveProduct, onDelete, onToggleActive }: {
  title: string; products: AdminProduct[]; onSaveProduct: (p: AdminProduct) => Promise<boolean>; onDelete: (id: string) => void;
  onToggleActive: (p: AdminProduct) => void;
}) {
  const [editing, setEditing] = useState<AdminProduct | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [category, setCategory] = useState('All')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [preview, setPreview] = useState<AdminProduct | null>(null)
  const PAGE_SIZE = 6
  const categories = ['All', ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))]
  const needle = query.trim().toLowerCase()
  const filtered = products.filter((p) =>
    (category === 'All' || p.category === category) &&
    (!needle || `${p.name} ${p.sku} ${p.id} ${p.description}`.toLowerCase().includes(needle))
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  React.useEffect(() => { setPage(1) }, [category, query])

  if (editing) {
    // Edit stays in this tab: the editor replaces the list (no tab jump), and
    // returning to the list keeps the chosen category/search/page intact.
    return (
      <View className="flex-1">
        <ProductEditor
          product={editing}
          onChange={setEditing}
          onSave={() => { void onSaveProduct(editing).then((saved) => { if (saved) { setEditing(null); setIsNew(false) } }) }}
          onCancel={() => { setEditing(null); setIsNew(false) }}
          isNew={isNew}
          categoryOptions={categories.filter((c) => c !== 'All')}
        />
      </View>
    )
  }

  return (
    <View className="flex-1">
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListHeaderComponent={
          <View className="mb-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-display text-xl font-bold text-ink">{title} ({filtered.length})</Text>
              <Pressable
                onPress={() => { setEditing(blankProjectProduct()); setIsNew(true) }}
                className="rounded-full bg-navy px-4 py-2"
              >
                <Text className="text-xs font-black text-white">+ New project</Text>
              </Pressable>
            </View>
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
              <TextInput value={query} onChangeText={setQuery} placeholder="Search name, SKU, id…" className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink" />
            </View>
          </View>
        }
        ListEmptyComponent={<Text className="py-8 text-center text-sm text-muted">No {title.toLowerCase()} found.</Text>}
        ListFooterComponent={totalPages > 1 ? <AdminPager page={page} totalPages={totalPages} onPage={setPage} /> : null}
        renderItem={({ item }) => (
          <View className="mb-3 overflow-hidden rounded-xl border border-line bg-card">
            {item.image ? <Image source={{ uri: item.image }} className="h-36 w-full bg-mist" resizeMode="cover" /> : null}
            <View className="p-4">
              <Text className="text-xs font-black uppercase tracking-wide text-gold">{item.category}</Text>
              <Text className="mt-1 text-sm font-bold text-ink">{item.name}</Text>
              <Text className="mt-1 text-xs font-black text-navy">{item.priceLabel || 'Request quote'}</Text>
              <Text className="mt-1 text-xs leading-5 text-muted" numberOfLines={3}>{item.description || item.note}</Text>
              {!item.active && <Text className="mt-1 text-[10px] font-black uppercase text-red-500">Hidden from customers</Text>}
            <View className="mt-3 flex-row flex-wrap gap-2">
              <AdminAction onPress={() => setEditing(item)} label="Edit" tone="navy" />
                <AdminAction onPress={() => setPreview(item)} label="Preview" tone="plain" />
                <AdminAction onPress={() => onToggleActive(item)} label={item.active ? 'Hide' : 'Show'} tone="plain" />
                <AdminAction onPress={() => onDelete(item.id)} label="Delete" tone="red" />
              </View>
            </View>
          </View>
        )}
      />
      {preview && <ProductPreviewModal product={preview} onClose={() => setPreview(null)} />}
    </View>
  )
}

function ProductEditor({ product, onChange, onSave, onCancel, isNew, categoryOptions }: {
  product: AdminProduct
  onChange: (next: AdminProduct) => void
  onSave: () => void
  onCancel: () => void
  isNew: boolean
  categoryOptions: string[]
}) {
  function patch(patchPart: Partial<AdminProduct>) {
    onChange({ ...product, ...patchPart })
  }

  const inputClass = 'rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink'
  const isProject =
    product.productType === 'Project package' ||
    product.category === 'Robot Cars' ||
    product.category === 'Pre-packaged Kits'

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View className="rounded-xl border border-line bg-card p-4">
        <Text className="mb-1 font-display text-lg font-bold text-ink">{isNew ? 'Add a new product' : `Edit ${product.id}`}</Text>
        <Text className="mb-3 text-xs text-muted">Type: {product.productType || 'Retail kit'}</Text>

        <Text className="mb-1 text-xs font-bold text-muted">Id (slug, e.g. arduino-uno)</Text>
        <TextInput value={product.id} onChangeText={(id) => patch({ id: id.trim().toLowerCase().replace(/\s+/g, '-') })} className={`mb-3 ${inputClass}`} placeholder="arduino-uno" autoCapitalize="none" />
        <Text className="mb-1 text-xs font-bold text-muted">Name</Text>
        <TextInput value={product.name} onChangeText={(name) => patch({ name })} className={`mb-3 ${inputClass}`} placeholder="Product name" />
        <Text className="mb-1 text-xs font-bold text-muted">Category</Text>
        <View className="mb-3">
          <CategoryDropdown
            value={product.category || ''}
            options={categoryOptions}
            onChange={(category) => patch({ category })}
            placeholder="Select a category"
            title="Category"
            allowCustom
          />
        </View>

        <View className="mb-3 flex-row gap-3">
          <View className="flex-1">
            <Text className="mb-1 text-xs font-bold text-muted">Price (NPR)</Text>
            <TextInput value={String(product.price)} onChangeText={(price) => patch({ price: Math.max(0, Number(price) || 0) })} keyboardType="numeric" className={inputClass} placeholder="0" />
          </View>
          <View className="flex-1">
            <Text className="mb-1 text-xs font-bold text-muted">Stock</Text>
            <TextInput value={String(product.stock)} onChangeText={(stock) => patch({ stock: Math.max(0, Math.round(Number(stock) || 0)) })} keyboardType="numeric" className={inputClass} placeholder="0" />
          </View>
        </View>
        <Text className="mb-1 text-xs font-bold text-muted">Price label (e.g. NPR 1,450)</Text>
        <TextInput value={product.priceLabel} onChangeText={(priceLabel) => patch({ priceLabel })} className={`mb-3 ${inputClass}`} placeholder="NPR 1,450" />
        <Text className="mb-1 text-xs font-bold text-muted">SKU</Text>
        <TextInput value={product.sku} onChangeText={(sku) => patch({ sku })} className={`mb-3 ${inputClass}`} placeholder="GEN-…" autoCapitalize="characters" />
        <Text className="mb-1 text-xs font-bold text-muted">Short summary (note)</Text>
        <TextInput value={product.note} onChangeText={(note) => patch({ note })} multiline numberOfLines={2} className={`mb-3 ${inputClass}`} placeholder="Short summary" />
        <Text className="mb-1 text-xs font-bold text-muted">Description</Text>
        <TextInput value={product.description} onChangeText={(description) => patch({ description })} multiline style={{ textAlignVertical: 'top' }} className={`mb-3 min-h-20 ${inputClass}`} placeholder="Full description" />
        <Text className="mb-1 text-xs font-bold text-muted">Specs (one per line)</Text>
        <TextInput value={product.specs.join('\n')} onChangeText={(specs) => patch({ specs: specs.split('\n') })} multiline style={{ textAlignVertical: 'top' }} className={`mb-3 min-h-20 ${inputClass}`} placeholder={'1.3-inch OLED\nI2C interface'} />
        <Text className="mb-1 text-xs font-bold text-muted">Image URL</Text>
        <TextInput value={product.image} onChangeText={(image) => patch({ image })} className={`mb-3 ${inputClass}`} placeholder="https://…" autoCapitalize="none" />

        <Text className="mb-1 text-xs font-bold text-muted">Product type</Text>
        <View className="mb-3">
          <CategoryDropdown
            value={product.productType || 'Retail kit'}
            options={['Retail kit', 'Project package', 'Robot Cars', 'Material', 'Service package']}
            onChange={(productType) => patch({ productType })}
            placeholder="Select a product type"
            title="Product type"
            allowCustom
          />
        </View>

        {isProject ? (
          <View className="mb-3 rounded-xl border border-line bg-surface p-3">
            <Text className="mb-2 font-display text-base font-bold text-ink">Project information</Text>
            <Text className="mb-1 text-xs font-bold text-muted">Project overview</Text>
            <TextInput value={product.projectOverview} onChangeText={(projectOverview) => patch({ projectOverview })} multiline style={{ textAlignVertical: 'top' }} className={`mb-3 min-h-20 ${inputClass}`} placeholder="Fully-built demo car with instructions…" />
            <Text className="mb-1 text-xs font-bold text-muted">Objectives (one per line)</Text>
            <TextInput value={product.objectives.join('\n')} onChangeText={(v) => patch({ objectives: toStringArrayLines(v) })} multiline className={`mb-3 ${inputClass}`} placeholder="Control motors and servo via ESP32…" />
            <Text className="mb-1 text-xs font-bold text-muted">Materials required (one per line)</Text>
            <TextInput value={product.materialsRequired.join('\n')} onChangeText={(v) => patch({ materialsRequired: toStringArrayLines(v) })} multiline className={`mb-3 ${inputClass}`} placeholder="ESP32 dev board…" />
            <Text className="mb-1 text-xs font-bold text-muted">Learning outcomes (one per line)</Text>
            <TextInput value={product.learningOutcomes.join('\n')} onChangeText={(v) => patch({ learningOutcomes: toStringArrayLines(v) })} multiline className={`mb-3 ${inputClass}`} placeholder="Understand PWM signal control…" />
            <Text className="mb-1 text-xs font-bold text-muted">Build steps (one per line)</Text>
            <TextInput value={product.buildSteps.join('\n')} onChangeText={(v) => patch({ buildSteps: toStringArrayLines(v) })} multiline className={`mb-3 ${inputClass}`} placeholder="Mount the motors on the chassis…" />
            <Text className="mb-1 text-xs font-bold text-muted">Control methods (one per line)</Text>
            <TextInput value={product.controlMethods.join('\n')} onChangeText={(v) => patch({ controlMethods: toStringArrayLines(v) })} multiline className={`mb-3 ${inputClass}`} placeholder="Bluetooth remote (GENUM app)…" />
            <Text className="mb-1 text-xs font-bold text-muted">Prerequisites (one per line)</Text>
            <TextInput value={product.prerequisites.join('\n')} onChangeText={(v) => patch({ prerequisites: toStringArrayLines(v) })} multiline className={`mb-3 ${inputClass}`} placeholder="Basic wiring knowledge…" />
            <Text className="mb-1 text-xs font-bold text-muted">Deliverables (one per line)</Text>
            <TextInput value={product.deliverables.join('\n')} onChangeText={(v) => patch({ deliverables: toStringArrayLines(v) })} multiline className={`mb-3 ${inputClass}`} placeholder="Fully assembled robot car…" />
            <Text className="mb-1 text-xs font-bold text-muted">Estimated duration</Text>
            <TextInput value={product.estimatedDuration} onChangeText={(estimatedDuration) => patch({ estimatedDuration })} className={`mb-3 ${inputClass}`} placeholder="2-3 hours" />
            <Text className="mb-1 text-xs font-bold text-muted">Source folder</Text>
            <TextInput value={product.sourceFolder} onChangeText={(sourceFolder) => patch({ sourceFolder })} className={`mb-3 ${inputClass}`} placeholder="Genum_SMART_DUSTBIN_V1.0.0" autoCapitalize="none" />
            <Text className="mb-1 text-xs font-bold text-muted">Documentation URL</Text>
            <TextInput value={product.documentationUrl} onChangeText={(documentationUrl) => patch({ documentationUrl })} className={`mb-3 ${inputClass}`} placeholder="https://…" autoCapitalize="none" />
            <Text className="mb-1 text-xs font-bold text-muted">Video URL</Text>
            <TextInput value={product.videoUrl} onChangeText={(videoUrl) => patch({ videoUrl })} className={`mb-3 ${inputClass}`} placeholder="https://…" autoCapitalize="none" />
            <Text className="mb-1 text-xs font-bold text-muted">Maintenance notes</Text>
            <TextInput value={product.maintenanceNotes} onChangeText={(maintenanceNotes) => patch({ maintenanceNotes })} multiline className={`mb-3 ${inputClass}`} placeholder="Safety / maintenance notes" />
            <Text className="mb-1 text-xs font-bold text-muted">Audience</Text>
            <TextInput value={product.audience} onChangeText={(audience) => patch({ audience })} className={`mb-3 ${inputClass}`} placeholder="Students, Makers, Hobbyists" />
            <Text className="mb-1 text-xs font-bold text-muted">Difficulty</Text>
            <View className="mb-3">
              <CategoryDropdown
                value={product.difficulty || 'Beginner'}
                options={['Beginner', 'Intermediate', 'Advanced', 'Professional']}
                onChange={(difficulty) => patch({ difficulty })}
                placeholder="Difficulty"
                title="Difficulty"
              />
            </View>
            <Text className="mb-1 text-xs font-bold text-muted">Warranty</Text>
            <TextInput value={product.warranty} onChangeText={(warranty) => patch({ warranty })} className={`mb-1 ${inputClass}`} placeholder="30 days for manufacturing defects" />
          </View>
        ) : null}

        <View className="mb-3 flex-row items-center gap-3">
          <Text className="text-sm font-semibold text-ink">Visible to customers</Text>
          <Switch value={product.active} onValueChange={(active) => patch({ active })} trackColor={{ true: '#1e3a8a', false: '#e2e8f0' }} />
        </View>

        <View className="flex-row gap-3">
          <Pressable onPress={onSave} className="rounded-full bg-gold px-5 py-2">
            <Text className="text-xs font-black text-ink">{isNew ? 'Create product' : 'Save'}</Text>
          </Pressable>
          <Pressable onPress={onCancel} className="rounded-full border border-line px-5 py-2">
            <Text className="text-xs font-black text-ink">Cancel</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  )
}

function ServicesTab({ services, editing, onChange, onEdit, onNew, onSave, onDelete, onToggleActive }: {
  services: AdminService[]; editing: AdminService | null; onChange: (s: AdminService) => void;
  onEdit: (s: AdminService | null) => void; onNew: () => void; onSave: () => void;
  onDelete: (id: string) => void; onToggleActive: (s: AdminService) => void;
}) {
  const [preview, setPreview] = useState<AdminService | null>(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [category, setCategory] = useState('All')
  const PAGE_SIZE = 8
  const categories = ['All', ...Array.from(new Set(services.map((s) => s.category).filter(Boolean)))]
  const needle = query.trim().toLowerCase()
  const filtered = services.filter((s) =>
    (category === 'All' || s.category === category) &&
    (!needle || `${s.name} ${s.category} ${s.id} ${s.description}`.toLowerCase().includes(needle))
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  React.useEffect(() => { setPage(1) }, [query, category])

  if (editing) {
    return (
      <View className="flex-1">
        <ServiceEditor service={editing} onChange={onChange} onSave={onSave} onCancel={() => onEdit(null)} isNew={!services.some((s) => s.id === editing.id)} categoryOptions={categories.filter((c) => c !== 'All')} />
      </View>
    )
  }

  return (
    <View className="flex-1">
      <FlatList
        data={shown}
        keyExtractor={(s) => s.id}
        className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListHeaderComponent={
          <View className="mb-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-display text-xl font-bold text-ink">Services ({services.length})</Text>
              <Pressable onPress={onNew} className="rounded-full bg-navy px-4 py-2">
                <Text className="text-xs font-black text-white">+ New service</Text>
              </Pressable>
            </View>
            <View className="mt-3 flex-row items-center gap-2">
              <View className="flex-1">
                <CategoryDropdown
                  value={category}
                  options={categories}
                  onChange={setCategory}
                  placeholder="All categories"
                  title="Filter by category"
                />
              </View>
              <TextInput value={query} onChangeText={setQuery} placeholder="Search name, category, id…" className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink" />
            </View>
          </View>
        }
        ListEmptyComponent={<Text className="py-8 text-center text-sm text-muted">No services found.</Text>}
        ListFooterComponent={totalPages > 1 ? <AdminPager page={page} totalPages={totalPages} onPage={setPage} /> : null}
        renderItem={({ item }) => (
          <View className="mb-3 rounded-xl border border-line bg-card p-4">
            <View className="flex-row items-center justify-between gap-2">
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-bold text-ink" numberOfLines={1}>{item.name}</Text>
                <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>{item.category}{item.tag ? ` · ${item.tag}` : ''}</Text>
              </View>
              <Text className="shrink-0 text-xs font-black text-navy">{item.priceLabel}</Text>
            </View>
            <Text className="mt-1 text-xs leading-5 text-muted" numberOfLines={2}>{item.description}</Text>
            <View className="mt-2 flex-row items-center gap-2">
              <AdminAction onPress={() => onEdit(item)} label="Edit" tone="navy" />
              <AdminAction onPress={() => setPreview(item)} label="Preview" tone="plain" />
              <AdminAction onPress={() => onToggleActive(item)} label={item.active ? 'Hide' : 'Show'} tone="plain" />
              <AdminAction onPress={() => onDelete(item.id)} label="Delete" tone="red" />
              {!item.active && <Text className="text-[10px] font-black uppercase text-red-500">Inactive</Text>}
            </View>
          </View>
        )}
      />
      {preview && (
        <CatalogPreviewModal
          typeLabel={preview.tag || preview.category || 'Service'}
          title={preview.name}
          body={preview.description}
          priceLabel={preview.priceLabel}
          image=""
          active={preview.active}
          onClose={() => setPreview(null)}
        />
      )}
    </View>
  )
}

function ServiceEditor({ service, onChange, onSave, onCancel, isNew, categoryOptions }: {
  service: AdminService
  onChange: (next: AdminService) => void
  onSave: () => void
  onCancel: () => void
  isNew: boolean
  categoryOptions: string[]
}) {
  function patch(patchPart: Partial<AdminService>) {
    onChange({ ...service, ...patchPart })
  }

  const inputClass = 'rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink'

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View className="rounded-xl border border-line bg-card p-4">
        <Text className="mb-3 font-display text-lg font-bold text-ink">{isNew ? 'Add a new service' : `Edit ${service.id}`}</Text>
        <Text className="mb-1 text-xs font-bold text-muted">Id (slug)</Text>
        <TextInput value={service.id} onChangeText={(id) => patch({ id: id.trim().toLowerCase().replace(/\s+/g, '-') })} className={`mb-3 ${inputClass}`} placeholder="e.g. website-design" autoCapitalize="none" />
        <Text className="mb-1 text-xs font-bold text-muted">Name</Text>
        <TextInput value={service.name} onChangeText={(name) => patch({ name })} className={`mb-3 ${inputClass}`} placeholder="Service name" />
        <Text className="mb-1 text-xs font-bold text-muted">Category</Text>
        <View className="mb-3">
          <CategoryDropdown
            value={service.category || ''}
            options={categoryOptions}
            onChange={(category) => patch({ category })}
            placeholder="Select a category"
            title="Category"
            allowCustom
          />
        </View>
        <Text className="mb-1 text-xs font-bold text-muted">Price label</Text>
        <TextInput value={service.priceLabel} onChangeText={(priceLabel) => patch({ priceLabel })} className={`mb-3 ${inputClass}`} placeholder="from NPR 35,000" />
        <Text className="mb-1 text-xs font-bold text-muted">Tag / badge</Text>
        <TextInput value={service.tag} onChangeText={(tag) => patch({ tag })} className={`mb-3 ${inputClass}`} placeholder="Website, Fabrication, …" />
        <Text className="mb-1 text-xs font-bold text-muted">Sort order</Text>
        <TextInput value={String(service.sortOrder)} onChangeText={(sortOrder) => patch({ sortOrder: Math.max(0, Math.round(Number(sortOrder) || 0)) })} keyboardType="numeric" className={`mb-3 ${inputClass}`} placeholder="1000" />
        <Text className="mb-1 text-xs font-bold text-muted">Description</Text>
        <TextInput value={service.description} onChangeText={(description) => patch({ description })} multiline style={{ textAlignVertical: 'top' }} className={`mb-3 min-h-20 ${inputClass}`} placeholder="Full description" />
        <View className="mb-3 flex-row items-center gap-3">
          <Text className="text-sm font-semibold text-ink">Active (visible on site + app)</Text>
          <Switch value={service.active} onValueChange={(active) => patch({ active })} trackColor={{ true: '#1e3a8a', false: '#e2e8f0' }} />
        </View>
        <View className="flex-row gap-3">
          <Pressable onPress={onSave} className="rounded-full bg-gold px-5 py-2">
            <Text className="text-xs font-black text-ink">{isNew ? 'Create service' : 'Save'}</Text>
          </Pressable>
          <Pressable onPress={onCancel} className="rounded-full border border-line px-5 py-2">
            <Text className="text-xs font-black text-ink">Cancel</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  )
}

function UsersTab({ users, total, page, totalPages, query, onQueryChange, onApply, onPage, onToggleRole }: {
  users: AdminUser[]; total: number; page: number; totalPages: number; query: string;
  onQueryChange: (q: string) => void; onApply: () => void; onPage: (p: number) => void;
  onToggleRole: (u: AdminUser) => void;
}) {
  return (
    <View className="flex-1">
      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListHeaderComponent={
          <View className="mb-3">
            <Text className="font-display text-xl font-bold text-ink">Users ({total})</Text>
            <View className="mt-3 flex-row gap-2">
              <View className="flex-1">
                <TextInput
                  value={query}
                  onChangeText={onQueryChange}
                  onSubmitEditing={onApply}
                  returnKeyType="search"
                  placeholder="Search by name or email…"
                  className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink"
                />
              </View>
              <Pressable onPress={onApply} className="rounded-lg bg-navy px-4 py-2">
                <Text className="text-xs font-black text-white">Apply</Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={<Text className="py-8 text-center text-sm text-muted">No users found.</Text>}
        ListFooterComponent={totalPages > 1 ? <AdminPager page={page} totalPages={totalPages} onPage={onPage} /> : null}
        renderItem={({ item }) => (
          <View className="mb-3 rounded-xl border border-line bg-card p-4">
            <View className="flex-row items-center justify-between gap-2">
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-bold text-ink" numberOfLines={1}>{item.name || '—'} <Text className="font-normal text-muted">· {item.email}</Text></Text>
                {item.phone ? <Text className="mt-0.5 text-xs text-muted">{item.phone}</Text> : null}
                {item.address ? <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>{item.address}</Text> : null}
                {item.createdAt ? <Text className="mt-0.5 text-xs text-muted">Joined {new Date(item.createdAt).toLocaleDateString()}</Text> : null}
                <Text className={`mt-1 self-start rounded px-2 py-0.5 text-[10px] font-black uppercase ${item.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-sky text-navy'}`}>{item.role}</Text>
              </View>
              <Pressable onPress={() => onToggleRole(item)} className="shrink-0 rounded-full border border-line px-3 py-1.5">
                <Text className={`text-xs font-bold ${item.role === 'admin' ? 'text-red-600' : 'text-navy'}`}>
                  {item.role === 'admin' ? 'Revoke admin' : 'Make admin'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  )
}

function ContentTab({ siteContent, contentTitle, contentBody, onTitleChange, onBodyChange, onSave, saved }: {
  siteContent: { id: number; home_title: string; home_body: string } | null;
  contentTitle: string; contentBody: string;
  onTitleChange: (t: string) => void; onBodyChange: (b: string) => void;
  onSave: () => void; saved: boolean;
}) {
  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text className="text-base font-bold text-ink">Home page content</Text>
      <Text className="mt-1 text-xs leading-5 text-muted">
        Edit the hero title and body shown on the app home screen and the website homepage.
      </Text>

      <View className="mt-4 rounded-xl border border-line bg-card p-4">
        <Text className="text-xs font-bold uppercase tracking-wide text-muted">Hero title</Text>
        <TextInput
          value={contentTitle}
          onChangeText={onTitleChange}
          placeholder="Technology you can touch, test, and trust."
          placeholderTextColor="#94a3b8"
          className="mt-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
        />
      </View>

      <View className="mt-3 rounded-xl border border-line bg-card p-4">
        <Text className="text-xs font-bold uppercase tracking-wide text-muted">Hero body</Text>
        <TextInput
          value={contentBody}
          onChangeText={onBodyChange}
          placeholder="Robotics kits, project solutions, fabrication, open tools, and training…"
          placeholderTextColor="#94a3b8"
          multiline
          style={{ textAlignVertical: 'top' }}
          className="mt-1 min-h-24 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
        />
      </View>

      <Pressable onPress={onSave} className="mt-4 items-center rounded-full bg-navy py-3">
        <Text className="text-sm font-black text-white">Save changes</Text>
      </Pressable>

      {saved && (
        <Text className="mt-3 text-center text-sm font-semibold text-emerald-700">Saved.</Text>
      )}
      {!siteContent && (
        <Text className="mt-3 text-center text-sm text-muted">Content not loaded.</Text>
      )}
    </ScrollView>
  )
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function formatNPR(amount: number): string {
  return `NPR ${amount.toLocaleString('en-IN')}`
}

function JournalTab({ journals, editorOpen, editId, tag, title, text, sort, active, onNew, onEdit, onTogglePublish, onDelete, onEditIdChange, onTagChange, onTitleChange, onTextChange, onSortChange, onActiveChange, onSave, onCancel }: {
  journals: AdminJournalPost[]
  editorOpen: boolean
  editId: string
  tag: string
  title: string
  text: string
  sort: string
  active: boolean
  onNew: () => void
  onEdit: (post: AdminJournalPost) => void
  onTogglePublish: (post: AdminJournalPost) => void
  onDelete: (id: string) => void
  onEditIdChange: (v: string) => void
  onTagChange: (v: string) => void
  onTitleChange: (v: string) => void
  onTextChange: (v: string) => void
  onSortChange: (v: string) => void
  onActiveChange: (v: boolean) => void
  onSave: () => void
  onCancel: () => void
}) {
  const [preview, setPreview] = useState<AdminJournalPost | null>(null)
  const scrollRef = useRef<ScrollView | null>(null)
  React.useEffect(() => {
    // Editing a post should land you at the data fields, not leave the list in view.
    if (editorOpen) scrollRef.current?.scrollTo({ y: 0, animated: false })
  }, [editorOpen])
  return (
    <>
    <ScrollView ref={scrollRef} className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View className="mb-4 flex-row items-center justify-between">
        <View>
          <Text className="text-base font-bold text-ink">Journal posts ({journals.length})</Text>
          <Text className="mt-0.5 text-xs text-muted">Edits publish to the website and the app immediately.</Text>
        </View>
        {!editorOpen && (
          <Pressable onPress={onNew} className="rounded-full bg-navy px-4 py-2">
            <Text className="text-xs font-black text-white">+ New post</Text>
          </Pressable>
        )}
      </View>

      {editorOpen && (
        <View className="mb-4 rounded-xl border border-line bg-card p-4">
          <Text className="mb-3 text-sm font-bold text-ink">{editId ? `Edit ${editId}` : 'Add a new journal post'}</Text>
          <Text className="mb-1 text-xs font-bold text-muted">Id (slug, auto-generated from title if blank)</Text>
          <TextInput
            value={editId}
            onChangeText={onEditIdChange}
            className="mb-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            placeholder="e.g. esp32-beginner-project"
          />
          <Text className="mb-1 text-xs font-bold text-muted">Tag / category</Text>
          <TextInput value={tag} onChangeText={onTagChange} className="mb-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink" placeholder="Tutorial · Robotics" />
          <Text className="mb-1 text-xs font-bold text-muted">Title</Text>
          <TextInput value={title} onChangeText={onTitleChange} className="mb-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink" placeholder="Post title" />
          <Text className="mb-1 text-xs font-bold text-muted">Excerpt / summary</Text>
          <TextInput
            value={text}
            onChangeText={onTextChange}
            multiline
            style={{ textAlignVertical: 'top' }}
            className="mb-3 min-h-24 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            placeholder="One or two sentences shown on the journal page."
          />
          <View className="mb-3 flex-row items-center gap-3">
            <Text className="text-sm font-semibold text-ink">Published (visible on site + app)</Text>
            <Switch value={active} onValueChange={onActiveChange} trackColor={{ true: '#1e3a8a', false: '#e2e8f0' }} />
          </View>
          <TextInput
            value={sort}
            onChangeText={onSortChange}
            keyboardType="numeric"
            className="mb-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            placeholder="Sort order"
          />
          <View className="flex-row gap-3">
            <Pressable onPress={onSave} className="rounded-full bg-gold px-5 py-2">
              <Text className="text-xs font-black text-ink">Save</Text>
            </Pressable>
            <Pressable onPress={onCancel} className="rounded-full border border-line px-5 py-2">
              <Text className="text-xs font-black text-ink">Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {journals.length === 0 ? (
        <Text className="py-8 text-center text-sm text-muted">No journal posts yet.</Text>
      ) : (
        journals.map((item) => (
          <View key={item.id} className="mb-3 rounded-xl border border-line bg-card p-4">
            <View className="flex-row items-center justify-between">
              <View className="min-w-0 flex-1 pr-2">
                <Text className="text-sm font-bold text-ink">{item.title}</Text>
                <Text className="mt-0.5 text-xs text-muted" numberOfLines={2}>{item.tag} · {item.text}</Text>
              </View>
              <Text className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-black uppercase ${item.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                {item.active ? 'Published' : 'Hidden'}
              </Text>
            </View>
            <View className="mt-2 flex-row flex-wrap gap-2">
              <AdminAction onPress={() => onEdit(item)} label="Edit" tone="navy" />
              <AdminAction onPress={() => setPreview(item)} label="Preview" tone="plain" />
              <AdminAction onPress={() => onTogglePublish(item)} label={item.active ? 'Unpublish' : 'Publish'} tone="plain" />
              <AdminAction onPress={() => onDelete(item.id)} label="Delete" tone="red" />
            </View>
          </View>
        ))
      )}
    </ScrollView>
    {preview && (
      <CatalogPreviewModal
        typeLabel={preview.tag || 'Journal'}
        title={preview.title}
        body={preview.text}
        priceLabel=""
        image=""
        active={preview.active}
        onClose={() => setPreview(null)}
      />
    )}
    </>
  )
}

function FinanceTab({ stats }: { stats: DashboardStats | null }) {
  if (!stats) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    )
  }

  const pending = stats.pendingOrders
  const paid = stats.paidOrders
  const fulfilled = stats.fulfilledOrders
  const cancelled = stats.cancelledOrders

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
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
          <Text className="text-sm font-bold text-ink">Order Status Breakdown</Text>
          <View className="mt-3 flex-row flex-wrap gap-3">
            {([
              { label: 'Pending', count: pending, color: 'text-amber-600' },
              { label: 'Paid', count: paid, color: 'text-navy' },
              { label: 'Fulfilled', count: fulfilled, color: 'text-emerald-600' },
              { label: 'Cancelled', count: cancelled, color: 'text-red-500' },
            ] as const).map((s) => (
              <View key={s.label} className="min-w-[45%] rounded-lg border border-line p-3">
                <Text className="text-xs font-black uppercase tracking-widest text-muted">{s.label}</Text>
                <Text className={`mt-1 font-display text-xl font-bold ${s.color}`}>{s.count}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  )
}

function ActivityTab({ activities, page, totalPages, total, onLoadMore }: {
  activities: ActivityEntry[]; page: number; totalPages: number; total: number;
  onLoadMore: (page: number) => void;
}) {
  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {activities.length === 0 ? (
        <View className="items-center py-16">
          <Feather name="clock" size={32} color="#cbd5e1" />
          <Text className="mt-3 text-sm text-muted">No activity recorded yet.</Text>
        </View>
      ) : (
        <>
          {activities.map((entry) => {
            const dotColor = entry.action.includes('deleted')
              ? 'bg-red-500'
              : entry.action.includes('saved')
                ? 'bg-emerald-500'
                : entry.action.includes('status')
                  ? 'bg-amber-500'
                  : 'bg-navy'
            return (
              <View key={entry.id} className="mb-2 flex-row items-start gap-3 rounded-xl border border-line bg-card px-4 py-3">
                <View className={`mt-1 h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
                <View className="min-w-0 flex-1">
                  <Text className="text-sm">
                    <Text className="font-bold text-ink">{entry.action}</Text>
                    {' '}<Text className="text-muted">{entry.entityType}{entry.entityId ? ` / ${entry.entityId}` : ''}</Text>
                  </Text>
                  {Object.keys(entry.details).length > 0 && (
                    <Text className="mt-0.5 text-xs text-muted">{JSON.stringify(entry.details)}</Text>
                  )}
                </View>
                <Text className="shrink-0 text-xs text-muted">
                  {new Date(entry.createdAt).toLocaleDateString()}
                </Text>
              </View>
            )
          })}

          {/* Pager */}
          {totalPages > 1 && (
            <View className="mt-3 flex-row items-center justify-between">
              <Pressable
                onPress={() => onLoadMore(Math.max(1, page - 1))}
                disabled={page === 1}
                className="h-10 w-10 items-center justify-center rounded-full border border-line bg-card disabled:opacity-40"
              >
                <Feather name="chevron-left" size={18} color="#1e3a8a" />
              </Pressable>
              <Text className="text-xs font-bold text-muted">Page {page} of {totalPages}</Text>
              <Pressable
                onPress={() => onLoadMore(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="h-10 w-10 items-center justify-center rounded-full border border-line bg-card disabled:opacity-40"
              >
                <Feather name="chevron-right" size={18} color="#1e3a8a" />
              </Pressable>
            </View>
          )}
          <Text className="mt-2 text-center text-xs text-muted">{total} total event{total === 1 ? '' : 's'}</Text>
        </>
      )}
    </ScrollView>
  )
}

function MessagesTab({ messages, total, page, totalPages, onPage, status, onStatusFilter, onMarkReplied }: {
  messages: AdminMessage[]; total: number; page: number; totalPages: number; onPage: (p: number) => void;
  status: string; onStatusFilter: (s: string) => void; onMarkReplied: (id: string) => void;
}) {
  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View className="mb-3">
        <Text className="font-display text-xl font-bold text-ink">Messages ({total})</Text>
        <View className="mt-2 flex-row flex-wrap gap-2">
          {(['', 'new', 'replied'] as const).map((s) => (
            <Pressable
              key={s || 'all'}
              onPress={() => onStatusFilter(s)}
              className={`rounded-full px-3 py-1.5 ${status === s ? 'bg-navy' : 'border border-line bg-card'}`}
            >
              <Text className={`text-xs font-bold capitalize ${status === s ? 'text-white' : 'text-muted'}`}>{s || 'All'}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {messages.length === 0 ? (
        <Text className="py-8 text-center text-sm text-muted">No messages.</Text>
      ) : (
        <>
          {messages.map((m) => (
            <View key={m.id} className={`mb-3 rounded-xl border bg-card p-4 ${m.status === 'new' ? 'border-l-4 border-l-navy border border-line' : 'border-line'}`}>
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-bold text-ink">{m.name} <Text className="font-normal text-muted">· {m.email}</Text></Text>
                {m.status === 'new'
                  ? <Pressable onPress={() => onMarkReplied(m.id)} className="rounded-full border border-line px-3 py-1"><Text className="text-xs font-bold text-navy">Mark replied</Text></Pressable>
                  : <Text className="text-xs font-bold uppercase text-emerald-600">Replied</Text>
                }
              </View>
              <Text className="mt-1 text-xs text-muted">{new Date(m.createdAt).toLocaleString()}</Text>
              <Text className="mt-2 text-xs leading-5 text-muted">{m.message}</Text>
            </View>
          ))}
          <AdminPager page={page} totalPages={totalPages} onPage={onPage} />
        </>
      )}
    </ScrollView>
  )
}

// ─── Settings (company info + programs) ─────────────────────────────

function SettingsTab({ company, setCompany, trainingPrograms, setTrainingPrograms, pilotCostLines, setPilotCostLines, curriculumHighlights, setCurriculumHighlights, onCompanySaved, onSaveProgram, onDeleteProgram, onSavePilotLine, onDeletePilotLine, onSaveCurriculum, onDeleteCurriculum }: {
  company: AdminCompanyInfo | null; setCompany: (c: AdminCompanyInfo | null) => void
  trainingPrograms: AdminTrainingProgram[]; setTrainingPrograms: (p: AdminTrainingProgram[]) => void
  pilotCostLines: AdminPilotCostLine[]; setPilotCostLines: (p: AdminPilotCostLine[]) => void
  curriculumHighlights: AdminCurriculumHighlight[]; setCurriculumHighlights: (c: AdminCurriculumHighlight[]) => void
  onCompanySaved: (next: AdminCompanyInfo) => void
  onSaveProgram: (p: AdminTrainingProgram, isNew: boolean) => void
  onDeleteProgram: (id: string) => void
  onSavePilotLine: (p: AdminPilotCostLine, isNew: boolean) => void
  onDeletePilotLine: (id: string) => void
  onSaveCurriculum: (c: AdminCurriculumHighlight, isNew: boolean) => void
  onDeleteCurriculum: (id: string) => void
}) {
  const inputClass = 'rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink'

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text className="font-display text-2xl font-bold tracking-tight text-ink">Settings</Text>
      <Text className="mt-1 text-xs text-muted">Company details, training programs, pilot costs, and curriculum highlights — all DB-first (shared with the website).</Text>

      <CompanyInfoEditor company={company} setCompany={setCompany} onSaved={onCompanySaved} inputClass={inputClass} />

      <TrainingProgramsManager programs={trainingPrograms} setPrograms={setTrainingPrograms} onSave={onSaveProgram} onDelete={onDeleteProgram} inputClass={inputClass} />

      <PilotCostManager lines={pilotCostLines} setLines={setPilotCostLines} onSave={onSavePilotLine} onDelete={onDeletePilotLine} inputClass={inputClass} />

      <CurriculumManager highlights={curriculumHighlights} setHighlights={setCurriculumHighlights} onSave={onSaveCurriculum} onDelete={onDeleteCurriculum} inputClass={inputClass} />
    </ScrollView>
  )
}

function SectionCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View className="mt-5 rounded-xl border border-line bg-card p-4">
      <Text className="font-display text-lg font-bold text-ink">{title}</Text>
      {hint ? <Text className="mt-0.5 text-xs text-muted">{hint}</Text> : null}
      <View className="mt-3">{children}</View>
    </View>
  )
}

function CompanyInfoEditor({ company, setCompany, onSaved, inputClass }: {
  company: AdminCompanyInfo | null; setCompany: (c: AdminCompanyInfo | null) => void
  onSaved: (next: AdminCompanyInfo) => void; inputClass: string
}) {
  const [saved, setSaved] = useState(false)
  function patch(part: Partial<AdminCompanyInfo>) {
    if (company) setCompany({ ...company, ...part })
  }
  return (
    <SectionCard title="Company information" hint="Shown in the app Contact/Legal screens and the website footer/contact pages.">
      {!company ? (
        <Text className="text-sm text-muted">Loading company info…</Text>
      ) : (
        <>
          <View className="mb-3 flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1 text-xs font-bold text-muted">Name</Text>
              <TextInput value={company.name} onChangeText={(name) => patch({ name })} className={inputClass} />
            </View>
            <View className="flex-1">
              <Text className="mb-1 text-xs font-bold text-muted">Short name</Text>
              <TextInput value={company.shortName} onChangeText={(shortName) => patch({ shortName })} className={inputClass} />
            </View>
          </View>
          <Text className="mb-1 text-xs font-bold text-muted">Address</Text>
          <TextInput value={company.address} onChangeText={(address) => patch({ address })} multiline className={`mb-3 ${inputClass}`} />
          <View className="mb-3 flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1 text-xs font-bold text-muted">City</Text>
              <TextInput value={company.city} onChangeText={(city) => patch({ city })} className={inputClass} />
            </View>
            <View className="flex-1">
              <Text className="mb-1 text-xs font-bold text-muted">Country</Text>
              <TextInput value={company.country} onChangeText={(country) => patch({ country })} className={inputClass} />
            </View>
          </View>
          <View className="mb-3 flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1 text-xs font-bold text-muted">Email</Text>
              <TextInput value={company.email} onChangeText={(email) => patch({ email })} autoCapitalize="none" keyboardType="email-address" className={inputClass} />
            </View>
            <View className="flex-1">
              <Text className="mb-1 text-xs font-bold text-muted">Phone</Text>
              <TextInput value={company.phone} onChangeText={(phone) => patch({ phone })} keyboardType="phone-pad" className={inputClass} />
            </View>
          </View>
          <View className="mb-3 flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1 text-xs font-bold text-muted">PAN</Text>
              <TextInput value={company.pan} onChangeText={(pan) => patch({ pan })} className={inputClass} />
            </View>
            <View className="flex-1">
              <Text className="mb-1 text-xs font-bold text-muted">VAT label</Text>
              <TextInput value={company.vatLabel} onChangeText={(vatLabel) => patch({ vatLabel })} className={inputClass} />
            </View>
          </View>
          <Text className="mb-1 text-xs font-bold text-muted">Description</Text>
          <TextInput value={company.description} onChangeText={(description) => patch({ description })} multiline style={{ textAlignVertical: 'top' }} className={`mb-3 min-h-20 ${inputClass}`} />
          <View className="flex-row items-center gap-3">
            <Pressable onPress={() => { onSaved(company); setSaved(true) }} className="rounded-full bg-navy px-5 py-2">
              <Text className="text-xs font-black text-white">Save company</Text>
            </Pressable>
            {saved && <Text className="text-sm font-semibold text-emerald-700">Saved.</Text>}
          </View>
        </>
      )}
    </SectionCard>
  )
}

function TrainingProgramsManager({ programs, setPrograms, onSave, onDelete, inputClass }: {
  programs: AdminTrainingProgram[]; setPrograms: (p: AdminTrainingProgram[]) => void
  onSave: (p: AdminTrainingProgram, isNew: boolean) => void; onDelete: (id: string) => void; inputClass: string
}) {
  const [editing, setEditing] = useState<AdminTrainingProgram | null>(null)
  function blank(): AdminTrainingProgram {
    return { id: '', title: '', audience: '', description: '', duration: '', outcome: '', active: true, sortOrder: 0 }
  }
  function patch(part: Partial<AdminTrainingProgram>) {
    if (editing) setEditing({ ...editing, ...part })
  }
  const isNew = editing ? !programs.some((p) => p.id === editing.id) : false
  const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return (
    <SectionCard title={`Training programs (${programs.length})`} hint="Shown on the Home screen and the website /services page.">
      <Pressable onPress={() => setEditing(blank())} className="mb-3 self-start rounded-full bg-navy px-4 py-2">
        <Text className="text-xs font-black text-white">+ New program</Text>
      </Pressable>
      {editing && (
        <View className="mb-3 rounded-lg border border-line bg-surface p-3">
          <Text className="mb-2 text-sm font-bold text-ink">{isNew ? 'Add a training program' : `Edit ${editing.id}`}</Text>
          <Text className="mb-1 text-xs font-bold text-muted">Title</Text>
          <TextInput value={editing.title} onChangeText={(title) => patch({ title })} className={`mb-2 ${inputClass}`} />
          <Text className="mb-1 text-xs font-bold text-muted">Audience</Text>
          <TextInput value={editing.audience} onChangeText={(audience) => patch({ audience })} className={`mb-2 ${inputClass}`} placeholder="Students / Teachers / Makers" />
          <Text className="mb-1 text-xs font-bold text-muted">Duration</Text>
          <TextInput value={editing.duration} onChangeText={(duration) => patch({ duration })} className={`mb-2 ${inputClass}`} placeholder="2 hours / 4 sessions" />
          <Text className="mb-1 text-xs font-bold text-muted">Description</Text>
          <TextInput value={editing.description} onChangeText={(description) => patch({ description })} multiline className={`mb-2 ${inputClass}`} />
          <Text className="mb-1 text-xs font-bold text-muted">Outcome</Text>
          <TextInput value={editing.outcome} onChangeText={(outcome) => patch({ outcome })} multiline className={`mb-2 ${inputClass}`} />
          <Text className="mb-1 text-xs font-bold text-muted">Sort order</Text>
          <TextInput value={String(editing.sortOrder)} onChangeText={(sortOrder) => patch({ sortOrder: Math.max(0, Math.round(Number(sortOrder) || 0)) })} keyboardType="numeric" className={`mb-2 ${inputClass}`} />
          <View className="mb-3 flex-row items-center gap-3">
            <Text className="text-sm font-semibold text-ink">Active</Text>
            <Switch value={editing.active} onValueChange={(active) => patch({ active })} trackColor={{ true: '#1e3a8a', false: '#e2e8f0' }} />
          </View>
          <View className="flex-row gap-2">
            <Pressable onPress={() => { const next = { ...editing, id: (editing.id.trim() || slug(editing.title)) }; onSave(next, isNew); setEditing(null) }} className="rounded-full bg-gold px-5 py-2">
              <Text className="text-xs font-black text-ink">Save</Text>
            </Pressable>
            <Pressable onPress={() => setEditing(null)} className="rounded-full border border-line px-5 py-2">
              <Text className="text-xs font-black text-ink">Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
      {programs.length === 0 ? (
        <Text className="text-sm text-muted">No training programs yet.</Text>
      ) : (
        programs.map((program) => (
          <View key={program.id} className="mb-2 flex-row items-center justify-between gap-2 rounded-lg border border-line p-3">
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-bold text-ink" numberOfLines={1}>{program.title}</Text>
              <Text className="text-xs text-muted" numberOfLines={1}>{program.audience}{program.duration ? ` · ${program.duration}` : ''}</Text>
            </View>
            <View className="flex-row flex-wrap gap-2">
              <AdminAction onPress={() => setEditing({ ...program })} label="Edit" tone="navy" />
              <AdminAction onPress={() => onDelete(program.id)} label="Delete" tone="red" />
            </View>
          </View>
        ))
      )}
    </SectionCard>
  )
}

function PilotCostManager({ lines, setLines, onSave, onDelete, inputClass }: {
  lines: AdminPilotCostLine[]; setLines: (p: AdminPilotCostLine[]) => void
  onSave: (p: AdminPilotCostLine, isNew: boolean) => void; onDelete: (id: string) => void; inputClass: string
}) {
  const [editing, setEditing] = useState<AdminPilotCostLine | null>(null)
  function blank(): AdminPilotCostLine {
    return { id: '', item: '', cost: '', note: '', active: true, sortOrder: 0 }
  }
  function patch(part: Partial<AdminPilotCostLine>) {
    if (editing) setEditing({ ...editing, ...part })
  }
  const isNew = editing ? !lines.some((l) => l.id === editing.id) : false
  return (
    <SectionCard title={`Pilot cost lines (${lines.length})`} hint="Shown on the Home screen (pilot program running costs).">
      <Pressable onPress={() => setEditing(blank())} className="mb-3 self-start rounded-full bg-navy px-4 py-2">
        <Text className="text-xs font-black text-white">+ New cost line</Text>
      </Pressable>
      {editing && (
        <View className="mb-3 rounded-lg border border-line bg-surface p-3">
          <Text className="mb-2 text-sm font-bold text-ink">{isNew ? 'Add a cost line' : `Edit ${editing.id}`}</Text>
          <Text className="mb-1 text-xs font-bold text-muted">Item</Text>
          <TextInput value={editing.item} onChangeText={(item) => patch({ item })} className={`mb-2 ${inputClass}`} />
          <Text className="mb-1 text-xs font-bold text-muted">Cost</Text>
          <TextInput value={editing.cost} onChangeText={(cost) => patch({ cost })} className={`mb-2 ${inputClass}`} placeholder="NPR 25,000 / month" />
          <Text className="mb-1 text-xs font-bold text-muted">Note</Text>
          <TextInput value={editing.note} onChangeText={(note) => patch({ note })} multiline className={`mb-2 ${inputClass}`} />
          <Text className="mb-1 text-xs font-bold text-muted">Sort order</Text>
          <TextInput value={String(editing.sortOrder)} onChangeText={(sortOrder) => patch({ sortOrder: Math.max(0, Math.round(Number(sortOrder) || 0)) })} keyboardType="numeric" className={`mb-2 ${inputClass}`} />
          <View className="mb-3 flex-row items-center gap-3">
            <Text className="text-sm font-semibold text-ink">Active</Text>
            <Switch value={editing.active} onValueChange={(active) => patch({ active })} trackColor={{ true: '#1e3a8a', false: '#e2e8f0' }} />
          </View>
          <View className="flex-row gap-2">
            <Pressable onPress={() => { const next = { ...editing, id: editing.id.trim() || `cost-${Date.now()}` }; onSave(next, isNew); setEditing(null) }} className="rounded-full bg-gold px-5 py-2">
              <Text className="text-xs font-black text-ink">Save</Text>
            </Pressable>
            <Pressable onPress={() => setEditing(null)} className="rounded-full border border-line px-5 py-2">
              <Text className="text-xs font-black text-ink">Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
      {lines.length === 0 ? (
        <Text className="text-sm text-muted">No pilot cost lines yet.</Text>
      ) : (
        lines.map((line) => (
          <View key={line.id} className="mb-2 flex-row items-center justify-between gap-2 rounded-lg border border-line p-3">
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-bold text-ink" numberOfLines={1}>{line.item}</Text>
              <Text className="text-xs text-muted" numberOfLines={1}>{line.cost}{line.note ? ` · ${line.note}` : ''}</Text>
            </View>
            <View className="flex-row flex-wrap gap-2">
              <AdminAction onPress={() => setEditing({ ...line })} label="Edit" tone="navy" />
              <AdminAction onPress={() => onDelete(line.id)} label="Delete" tone="red" />
            </View>
          </View>
        ))
      )}
    </SectionCard>
  )
}

function CurriculumManager({ highlights, setHighlights, onSave, onDelete, inputClass }: {
  highlights: AdminCurriculumHighlight[]; setHighlights: (c: AdminCurriculumHighlight[]) => void
  onSave: (c: AdminCurriculumHighlight, isNew: boolean) => void; onDelete: (id: string) => void; inputClass: string
}) {
  const [editing, setEditing] = useState<AdminCurriculumHighlight | null>(null)
  function blank(): AdminCurriculumHighlight {
    return { id: '', ageBand: '', items: [], active: true, sortOrder: 0 }
  }
  function patch(part: Partial<AdminCurriculumHighlight>) {
    if (editing) setEditing({ ...editing, ...part })
  }
  const isNew = editing ? !highlights.some((h) => h.id === editing.id) : false
  return (
    <SectionCard title={`Curriculum highlights (${highlights.length})`} hint="Age-band curriculum items shown on the Home screen.">
      <Pressable onPress={() => setEditing(blank())} className="mb-3 self-start rounded-full bg-navy px-4 py-2">
        <Text className="text-xs font-black text-white">+ New highlight</Text>
      </Pressable>
      {editing && (
        <View className="mb-3 rounded-lg border border-line bg-surface p-3">
          <Text className="mb-2 text-sm font-bold text-ink">{isNew ? 'Add a curriculum highlight' : `Edit ${editing.id}`}</Text>
          <Text className="mb-1 text-xs font-bold text-muted">Age band</Text>
          <TextInput value={editing.ageBand} onChangeText={(ageBand) => patch({ ageBand })} className={`mb-2 ${inputClass}`} placeholder="Ages 8-11" />
          <Text className="mb-1 text-xs font-bold text-muted">Skills / items (one per line)</Text>
          <TextInput value={editing.items.join('\n')} onChangeText={(v) => patch({ items: toStringArrayLines(v) })} multiline style={{ textAlignVertical: 'top' }} className={`mb-2 min-h-20 ${inputClass}`} />
          <Text className="mb-1 text-xs font-bold text-muted">Sort order</Text>
          <TextInput value={String(editing.sortOrder)} onChangeText={(sortOrder) => patch({ sortOrder: Math.max(0, Math.round(Number(sortOrder) || 0)) })} keyboardType="numeric" className={`mb-2 ${inputClass}`} />
          <View className="mb-3 flex-row items-center gap-3">
            <Text className="text-sm font-semibold text-ink">Active</Text>
            <Switch value={editing.active} onValueChange={(active) => patch({ active })} trackColor={{ true: '#1e3a8a', false: '#e2e8f0' }} />
          </View>
          <View className="flex-row gap-2">
            <Pressable onPress={() => { const next = { ...editing, id: editing.id.trim() || `curriculum-${Date.now()}` }; onSave(next, isNew); setEditing(null) }} className="rounded-full bg-gold px-5 py-2">
              <Text className="text-xs font-black text-ink">Save</Text>
            </Pressable>
            <Pressable onPress={() => setEditing(null)} className="rounded-full border border-line px-5 py-2">
              <Text className="text-xs font-black text-ink">Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
      {highlights.length === 0 ? (
        <Text className="text-sm text-muted">No curriculum highlights yet.</Text>
      ) : (
        highlights.map((highlight) => (
          <View key={highlight.id} className="mb-2 flex-row items-center justify-between gap-2 rounded-lg border border-line p-3">
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-bold text-ink" numberOfLines={1}>{highlight.ageBand}</Text>
              <Text className="text-xs text-muted" numberOfLines={1}>{highlight.items.length} skill{highlight.items.length === 1 ? '' : 's'}</Text>
            </View>
            <View className="flex-row flex-wrap gap-2">
              <AdminAction onPress={() => setEditing({ ...highlight })} label="Edit" tone="navy" />
              <AdminAction onPress={() => onDelete(highlight.id)} label="Delete" tone="red" />
            </View>
          </View>
        ))
      )}
    </SectionCard>
  )
}

// ─── Shared admin list helpers ───────────────────────────────────────

function AdminPager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <View className="mt-2 flex-row items-center justify-between">
      <Pressable
        onPress={() => onPage(Math.max(1, page - 1))}
        disabled={page === 1}
        accessibilityLabel="Previous page"
        className="h-10 w-10 items-center justify-center rounded-full border border-line bg-card disabled:opacity-40"
      >
        <Feather name="chevron-left" size={18} color="#1e3a8a" />
      </Pressable>
      <Text className="text-xs font-bold text-muted">Page {page} of {totalPages}</Text>
      <Pressable
        onPress={() => onPage(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        accessibilityLabel="Next page"
        className="h-10 w-10 items-center justify-center rounded-full border border-line bg-card disabled:opacity-40"
      >
        <Feather name="chevron-right" size={18} color="#1e3a8a" />
      </Pressable>
    </View>
  )
}

function AdminAction({ onPress, label, tone }: { onPress: () => void; label: string; tone: 'navy' | 'plain' | 'red' }) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full px-3 py-1 ${tone === 'navy' ? 'bg-navy' : tone === 'red' ? 'border border-red-200' : 'border border-line'}`}
    >
      <Text className={`text-xs font-bold ${tone === 'navy' ? 'text-white' : tone === 'red' ? 'text-red-600' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  )
}

function ProductPreviewModal({ product, onClose }: { product: AdminProduct; onClose: () => void }) {
  return (
    <CatalogPreviewModal
      typeLabel={product.badge || product.productType}
      title={product.name}
      body={product.note || product.description}
      priceLabel={product.priceLabel || `NPR ${product.price.toLocaleString('en-IN')}`}
      image={product.image}
      active={product.active}
      onClose={onClose}
    />
  )
}

function CatalogPreviewModal({ typeLabel, title, body, priceLabel, image, active, onClose }: {
  typeLabel: string; title: string; body: string; priceLabel: string; image: string;
  active: boolean; onClose: () => void;
}) {
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.7)', alignItems: 'center', justifyContent: 'center', padding: 20 }} onPress={onClose} accessibilityLabel="Close preview">
        <Pressable onPress={() => {}} className="w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-card">
          {image ? (
            <View className="h-40 w-full bg-ink">
              <Image source={{ uri: image }} className="h-full w-full" resizeMode="cover" />
            </View>
          ) : null}
          <View className="p-5">
            <View className="flex-row items-center justify-between">
              <Text className="shrink-1 text-xs font-black uppercase tracking-widest text-navy" numberOfLines={1}>{typeLabel}</Text>
              <Text className={`ml-2 shrink-0 text-[10px] font-black uppercase ${active ? 'text-emerald-600' : 'text-red-500'}`}>{active ? 'Published' : 'Hidden'}</Text>
            </View>
            <Text className="mt-2 font-display text-xl font-bold leading-snug text-ink">{title}</Text>
            {body ? <Text className="mt-2 text-sm leading-6 text-muted">{body}</Text> : null}
            <View className="mt-4 flex-row items-center justify-between gap-3">
              {priceLabel ? <Text className="font-display text-lg font-bold text-ink">{priceLabel}</Text> : <View />}
              <Pressable onPress={onClose} className="rounded-full border border-line px-4 py-2">
                <Text className="text-xs font-black text-ink">Close</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
