// =====================================================================
// AdminScreen - native admin dashboard mirroring the website AdminPanel.
// Tabs: Dashboard, Orders, Products, Services, Users, Messages, Content.
// =====================================================================
import React, { useEffect, useState, useCallback } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useApp } from '../context/AppContext'
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
  type AdminOrder,
  type AdminProduct,
  type AdminService,
  type AdminUser,
  type AdminMessage,
  type DashboardStats,
} from '../services/adminService'

type Tab = 'Dashboard' | 'Orders' | 'Products' | 'ProjectPackages' | 'RobotCarProjects' | 'Services' | 'Users' | 'Messages' | 'Content'

const TABS: Tab[] = ['Dashboard', 'Orders', 'Products', 'ProjectPackages', 'RobotCarProjects', 'Services', 'Users', 'Messages', 'Content']

export function AdminScreen() {
  const { isAdmin, signOut } = useApp()
  const [tab, setTab] = useState<Tab>('Dashboard')
  const [loading, setLoading] = useState(false)

  // Orders
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [ordersTotal, setOrdersTotal] = useState(0)
  const [ordersPage, setOrdersPage] = useState(1)
  const [orderQuery, setOrderQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Products
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [productQuery, setProductQuery] = useState('')

  // Services
  const [services, setServices] = useState<AdminService[]>([])

  // Users
  const [users, setUsers] = useState<AdminUser[]>([])

  // Messages
  const [messages, setMessages] = useState<AdminMessage[]>([])
  const [messagesPage, setMessagesPage] = useState(1)

  // Site content
  const [siteContent, setSiteContent] = useState<{ id: number; home_title: string; home_body: string } | null>(null)
  const [contentTitle, setContentTitle] = useState('')
  const [contentBody, setContentBody] = useState('')
  const [contentSaved, setContentSaved] = useState(false)

  // Dashboard
  const [stats, setStats] = useState<DashboardStats | null>(null)

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
      } else if (tab === 'Orders') {
        void loadOrders(1)
      } else if (tab === 'Products' || tab === 'ProjectPackages' || tab === 'RobotCarProjects') {
        setProducts(await listAdminProducts())
      } else if (tab === 'Services') {
        setServices(await listAdminServices())
      } else if (tab === 'Users') {
        setUsers(await listAdminUsers())
      } else if (tab === 'Messages') {
        void loadMessages(1)
      } else if (tab === 'Content') {
        const result = await fetchSiteContent()
        const content = result?.content
        if (content) {
          setSiteContent(content)
          setContentTitle(content.home_title || '')
          setContentBody(content.home_body || '')
        }
      }
    } catch (e) {
      console.error('Admin load error:', e)
    } finally {
      setLoading(false)
    }
  }

  async function loadOrders(page: number) {
    const result = await listAdminOrders(page, 20, statusFilter || undefined, orderQuery || undefined)
    setOrders(result.orders)
    setOrdersTotal(result.total)
    setOrdersPage(page)
  }

  async function loadMessages(page: number) {
    const result = await listAdminMessages(page, 20)
    setMessages(result.messages)
    setMessagesPage(page)
  }

  async function handleUpdateOrderStatus(orderId: string, status: string) {
    await updateOrderStatus(orderId, status)
    void loadOrders(ordersPage)
  }

  async function handleSaveProduct() {
    if (!editingProduct) return
    await upsertAdminProduct(editingProduct)
    setEditingProduct(null)
    void loadTab()
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
    await upsertAdminService(editingService)
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

  async function handleToggleUserRole(user: AdminUser) {
    const newRole = user.role === 'admin' ? 'customer' : 'admin'
    await toggleAdminRole(user.id, newRole)
    void loadTab()
  }

  async function handleMarkReplied(id: string) {
    await markMessageReplied(id)
    void loadMessages(messagesPage)
  }

  return (
    <View className="flex-1 bg-mist">
      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="border-b border-line bg-card">
        <View className="flex-row">
          {TABS.map((t) => (
            <Pressable
              key={t}
              onPress={() => { setTab(t); setEditingProduct(null); setEditingService(null) }}
              className={`px-4 py-3 border-b-2 ${tab === t ? 'border-navy' : 'border-transparent'}`}
            >
              <Text className={`text-xs font-bold ${tab === t ? 'text-navy' : 'text-muted'}`}>{t}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Tab content */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#1e3a8a" />
        </View>
      ) : (
        <>
          {tab === 'Dashboard' && <DashboardTab stats={stats} />}
          {tab === 'Orders' && (
            <OrdersTab
              orders={orders}
              total={ordersTotal}
              page={ordersPage}
              onLoadMore={() => loadOrders(ordersPage + 1)}
              onStatusChange={handleUpdateOrderStatus}
              query={orderQuery}
              onQueryChange={setOrderQuery}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
            />
          )}
          {tab === 'Products' && (
            <ProductsTab
              products={products}
              query={productQuery}
              onQueryChange={setProductQuery}
              editing={editingProduct}
              onEdit={(product) => {
                setEditingProduct(product)
                if (product) setTab('Products')
              }}
              onSave={handleSaveProduct}
              onDelete={handleDeleteProduct}
            />
          )}
          {(tab === 'ProjectPackages' || tab === 'RobotCarProjects') && (
            <ProjectTab
              title={tab === 'ProjectPackages' ? 'Project packages' : 'Robot car projects'}
              products={products.filter((product) => tab === 'ProjectPackages' ? product.productType === 'Project package' : product.category === 'Robot Cars')}
              onEdit={setEditingProduct}
              onDelete={handleDeleteProduct}
            />
          )}
          {tab === 'Services' && (
            <ServicesTab
              services={services}
              editing={editingService}
              onEdit={setEditingService}
              onSave={handleSaveService}
              onDelete={handleDeleteService}
            />
          )}
          {tab === 'Users' && (
            <UsersTab users={users} onToggleRole={handleToggleUserRole} />
          )}
          {tab === 'Messages' && (
            <MessagesTab
              messages={messages}
              page={messagesPage}
              onLoadMore={() => loadMessages(messagesPage + 1)}
              onMarkReplied={handleMarkReplied}
            />
          )}
          {tab === 'Content' && (
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
          )}
        </>
      )}
    </View>
  )
}

// ─── Sub-tabs ────────────────────────────────────────────────────────

function DashboardTab({ stats }: { stats: DashboardStats | null }) {
  if (!stats) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    )
  }

  return (
    <ScrollView className="p-4">
      <Text className="text-base font-bold text-ink">Dashboard</Text>
      <View className="mt-3 flex-row flex-wrap gap-3">
        <StatCard label="Users" value={String(stats.totalUsers)} />
        <StatCard label="Cart items" value={String(stats.totalCartItems)} sub={`${stats.activeCarts} active carts`} />
        <StatCard label="Orders" value={String(stats.totalOrders)} sub={`${stats.pendingOrders} pending`} />
        <StatCard label="Products" value={String(stats.totalProducts)} sub={stats.lowStockProducts > 0 ? `${stats.lowStockProducts} low stock` : 'OK'} />
        <StatCard label="Messages" value={String(stats.totalMessages)} sub={`${stats.unreadMessages} unread`} />
      </View>
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

function OrdersTab({ orders, total, page, onLoadMore, onStatusChange, query, onQueryChange, statusFilter, onStatusFilterChange }: {
  orders: AdminOrder[]; total: number; page: number; onLoadMore: () => void;
  onStatusChange: (id: string, s: string) => void; query: string; onQueryChange: (q: string) => void;
  statusFilter: string; onStatusFilterChange: (s: string) => void;
}) {
  return (
    <View className="p-4">
      <View className="mb-4 flex-row gap-2">
        <View className="flex-1">
          <TextInput value={query} onChangeText={onQueryChange} placeholder="Search buyer…" className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink" />
        </View>
        <View className="w-32">
          <TextInput value={statusFilter} onChangeText={onStatusFilterChange} placeholder="Status" className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink" />
        </View>
      </View>
      {orders.length === 0 ? (
        <Text className="py-8 text-center text-sm text-muted">No orders found.</Text>
      ) : (
        <>
          {orders.map((o) => (
            <View key={o.id} className="mb-3 rounded-xl border border-line bg-card p-4">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-sm font-bold text-ink">#{o.id.slice(0, 8).toUpperCase()} · NPR {o.totalNpr.toLocaleString('en-IN')}</Text>
                  <Text className="text-xs text-muted">{o.customerName} · {o.email}</Text>
                </View>
                <Text className="text-xs font-bold uppercase text-navy">{o.status}</Text>
              </View>
              <View className="mt-2 flex-row flex-wrap gap-2">
                {['pending', 'paid', 'fulfilled', 'cancelled'].map((s) => (
                  <Pressable key={s} onPress={() => onStatusChange(o.id, s)} className={`rounded-full px-3 py-1 ${o.status === s ? 'bg-navy' : 'border border-line'}`}>
                    <Text className={`text-xs font-bold ${o.status === s ? 'text-white' : 'text-muted'}`}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
          {page * 20 < total && (
            <Pressable onPress={onLoadMore} className="items-center py-4">
              <Text className="text-sm font-bold text-navy">Load more</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  )
}

function ProductsTab({ products, query, onQueryChange, editing, onEdit, onSave, onDelete }: {
  products: AdminProduct[]; query: string; onQueryChange: (q: string) => void;
  editing: AdminProduct | null; onEdit: (p: AdminProduct | null) => void; onSave: () => void; onDelete: (id: string) => void;
}) {
  const filtered = query
    ? products.filter((p) => `${p.name} ${p.sku} ${p.id}`.toLowerCase().includes(query.toLowerCase()))
    : products

  return (
    <View className="p-4">
      <TextInput value={query} onChangeText={onQueryChange} placeholder="Search by name, SKU, or id…" className="mb-4 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink" />
      {editing ? (
        <ProductEditor product={editing} onSave={onSave} onCancel={() => onEdit(null)} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <View className="mb-3 rounded-xl border border-line bg-card p-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-bold text-ink">{item.name}</Text>
                <Text className="text-xs font-bold text-navy">NPR {item.price.toLocaleString('en-IN')}</Text>
              </View>
              <View className="mt-2 flex-row gap-2">
                <Pressable onPress={() => onEdit(item)} className="rounded-full bg-navy px-3 py-1">
                  <Text className="text-xs font-bold text-white">Edit</Text>
                </Pressable>
                <Pressable onPress={() => onDelete(item.id)} className="rounded-full border border-red-200 px-3 py-1">
                  <Text className="text-xs font-bold text-red-600">Delete</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </View>
  )
}

function ProjectTab({ title, products, onEdit, onDelete }: {
  title: string; products: AdminProduct[]; onEdit: (p: AdminProduct) => void; onDelete: (id: string) => void;
}) {
  return (
    <FlatList
      data={products}
      keyExtractor={(product) => product.id}
      className="p-4"
      ListHeaderComponent={<Text className="mb-4 text-base font-bold text-ink">{title} ({products.length})</Text>}
      ListEmptyComponent={<Text className="py-8 text-center text-sm text-muted">No {title.toLowerCase()} found.</Text>}
      renderItem={({ item }) => (
        <View className="mb-3 overflow-hidden rounded-xl border border-line bg-card">
          {item.image ? <Image source={{ uri: item.image }} className="h-36 w-full" resizeMode="cover" /> : null}
          <View className="p-4">
            <Text className="text-xs font-black uppercase tracking-wide text-gold">{item.category}</Text>
            <Text className="mt-1 text-sm font-bold text-ink">{item.name}</Text>
            <Text className="mt-1 text-xs leading-5 text-muted">{item.description || item.note}</Text>
            {item.specs.length > 0 ? <Text className="mt-2 text-xs text-muted">{item.specs.join(' · ')}</Text> : null}
            <View className="mt-3 flex-row gap-2">
              <Pressable onPress={() => onEdit(item)} className="rounded-full bg-navy px-3 py-1">
                <Text className="text-xs font-bold text-white">Edit</Text>
              </Pressable>
              <Pressable onPress={() => onDelete(item.id)} className="rounded-full border border-red-200 px-3 py-1">
                <Text className="text-xs font-bold text-red-600">Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    />
  )
}

function ProductEditor({ product, onSave, onCancel }: { product: AdminProduct; onSave: () => void; onCancel: () => void }) {
  const [name, setName] = useState(product.name)
  const [price, setPrice] = useState(String(product.price))
  const [stock, setStock] = useState(String(product.stock))
  const [desc, setDesc] = useState(product.description)

  return (
    <View className="mb-4 rounded-xl border border-line bg-card p-4">
      <Text className="mb-3 text-sm font-bold text-ink">Edit Product</Text>
      <TextInput value={name} onChangeText={setName} className="mb-3 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink" placeholder="Name" />
      <View className="mb-3 flex-row gap-3">
        <View className="flex-1">
          <TextInput value={price} onChangeText={setPrice} keyboardType="numeric" className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink" placeholder="Price" />
        </View>
        <View className="flex-1">
          <TextInput value={stock} onChangeText={setStock} keyboardType="numeric" className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink" placeholder="Stock" />
        </View>
      </View>
      <TextInput value={desc} onChangeText={setDesc} multiline numberOfLines={3} className="mb-3 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink" placeholder="Description" />
      <View className="flex-row gap-3">
        <Pressable onPress={onSave} className="rounded-full bg-gold px-5 py-2">
          <Text className="text-xs font-black text-ink">Save</Text>
        </Pressable>
        <Pressable onPress={onCancel} className="rounded-full border border-line px-5 py-2">
          <Text className="text-xs font-black text-ink">Cancel</Text>
        </Pressable>
      </View>
    </View>
  )
}

function ServicesTab({ services, editing, onEdit, onSave, onDelete }: {
  services: AdminService[]; editing: AdminService | null; onEdit: (s: AdminService | null) => void; onSave: () => void; onDelete: (id: string) => void;
}) {
  if (editing) {
    return <ServiceEditor service={editing} onSave={onSave} onCancel={() => onEdit(null)} />
  }
  return (
    <FlatList
      data={services}
      keyExtractor={(s) => s.id}
      className="p-4"
      renderItem={({ item }) => (
        <View className="mb-3 rounded-xl border border-line bg-card p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-bold text-ink">{item.name}</Text>
            <Text className={`text-xs font-bold uppercase ${item.active ? 'text-emerald-600' : 'text-red-500'}`}>{item.active ? 'active' : 'inactive'}</Text>
          </View>
          <Text className="mt-1 text-xs leading-5 text-muted">{item.description}</Text>
          <View className="mt-2 flex-row gap-2">
            <Pressable onPress={() => onEdit(item)} className="rounded-full bg-navy px-3 py-1">
              <Text className="text-xs font-bold text-white">Edit</Text>
            </Pressable>
            <Pressable onPress={() => onDelete(item.id)} className="rounded-full border border-red-200 px-3 py-1">
              <Text className="text-xs font-bold text-red-600">Delete</Text>
            </Pressable>
          </View>
        </View>
      )}
    />
  )
}

function ServiceEditor({ service, onSave, onCancel }: { service: AdminService; onSave: () => void; onCancel: () => void }) {
  const [name, setName] = useState(service.name)
  const [desc, setDesc] = useState(service.description)
  const [active, setActive] = useState(service.active)

  return (
    <View className="mb-4 rounded-xl border border-line bg-card p-4">
      <Text className="mb-3 text-sm font-bold text-ink">Edit Service</Text>
      <TextInput value={name} onChangeText={setName} className="mb-3 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink" placeholder="Name" />
      <TextInput value={desc} onChangeText={setDesc} multiline numberOfLines={3} className="mb-3 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink" placeholder="Description" />
      <View className="mb-3 flex-row items-center gap-3">
        <Text className="text-sm font-semibold text-ink">Active</Text>
        <Switch
          value={active}
          onValueChange={setActive}
          trackColor={{ true: '#1e3a8a', false: '#e2e8f0' }}
        />
      </View>
      <View className="flex-row gap-3">
        <Pressable onPress={() => { onSave() }} className="rounded-full bg-gold px-5 py-2">
          <Text className="text-xs font-black text-ink">Save</Text>
        </Pressable>
        <Pressable onPress={onCancel} className="rounded-full border border-line px-5 py-2">
          <Text className="text-xs font-black text-ink">Cancel</Text>
        </Pressable>
      </View>
    </View>
  )
}

function UsersTab({ users, onToggleRole }: { users: AdminUser[]; onToggleRole: (u: AdminUser) => void }) {
  return (
    <FlatList
      data={users}
      keyExtractor={(u) => u.id}
      className="p-4"
      renderItem={({ item }) => (
        <View className="mb-3 rounded-xl border border-line bg-card p-4">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-sm font-bold text-ink">{item.name || item.email}</Text>
              <Text className="text-xs text-muted">{item.email}</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Text className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${item.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>{item.role}</Text>
              <Pressable onPress={() => onToggleRole(item)} className="rounded-full border border-line px-3 py-1">
                <Text className="text-xs font-bold text-ink">
                  {item.role === 'admin' ? 'Revoke' : 'Make admin'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    />
  )
}

function ContentTab({ siteContent, contentTitle, contentBody, onTitleChange, onBodyChange, onSave, saved }: {
  siteContent: { id: number; home_title: string; home_body: string } | null;
  contentTitle: string; contentBody: string;
  onTitleChange: (t: string) => void; onBodyChange: (b: string) => void;
  onSave: () => void; saved: boolean;
}) {
  return (
    <ScrollView className="p-4">
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

function MessagesTab({ messages, page, onLoadMore, onMarkReplied }: {
  messages: AdminMessage[]; page: number; onLoadMore: () => void; onMarkReplied: (id: string) => void;
}) {
  return (
    <View className="p-4">
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
              <Text className="mt-2 text-xs leading-5 text-muted">{m.message}</Text>
            </View>
          ))}
          <Pressable onPress={onLoadMore} className="items-center py-4">
            <Text className="text-sm font-bold text-navy">Load more</Text>
          </Pressable>
        </>
      )}
    </View>
  )
}
