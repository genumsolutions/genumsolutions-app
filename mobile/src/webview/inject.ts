// =====================================================================
// inject.ts - JS + CSS injected into the loaded website so it renders and
// behaves like a native app inside the WebView.
//
//  1. INJECTED_CSS  - hides the website's own header/footer/app banner and
//     compacts the content (tighter paddings, horizontally-scrolling
//     category chips, a dense 2-column product grid) so it feels like a
//     mobile app rather than a shrunk website.
//  2. BRIDGE_SCRIPT - drives the native-side state via postMessage:
//       genum:cart    { count, size }   derived from localStorage['genum-cart']
//       genum:session { user | null }   from /api/auth/session
//       genum:path    { path }          current location.pathname
//       genum:online  { online }        from navigator.onLine
//
// The script is idempotent (window.__GENUM_BRIDGE__) because the WebView can
// re-inject it on reload/restore. It runs before the document is parsed, so
// first the class + CSS are applied (preventing a flash of the website
// header), then the intervals start on DOMContentLoaded.
// =====================================================================

const css = `
html.genum-native body > header,
html.genum-native body > footer,
html.genum-native body > aside,
html.genum-native body > main > header {
  display: none !important;
}

/* Tighter rhythm so content starts right under the native header. */
html.genum-native main { padding-top: 0 !important; }
html.genum-native main .mx-auto.max-w-7xl {
  padding-left: 0.875rem !important;
  padding-right: 0.875rem !important;
}
html.genum-native main .py-8,
html.genum-native main .py-10,
html.genum-native main .py-12,
html.genum-native main .py-14,
html.genum-native main .py-16,
html.genum-native main .py-20,
html.genum-native main.py-10,
html.genum-native main.py-12,
html.genum-native main.py-14,
html.genum-native main.py-16 {
  padding-top: 0.75rem !important;
  padding-bottom: 1.25rem !important;
}
html.genum-native main .pt-10,
html.genum-native main .pt-20,
html.genum-native main .pt-24 {
  padding-top: 0.75rem !important;
}
/* Strip stray top margin from the first block so nothing floats above the
   content when a page only adds top margin (not padding) to its hero. */
html.genum-native main > section:first-child,
html.genum-native main > div:first-child:not(.mx-auto) {
  margin-top: 0 !important;
}

/* Product categories -> one compact horizontally-scrolling row. */
html.genum-native [aria-label="Product categories"] {
  flex-wrap: nowrap !important;
  overflow-x: auto !important;
  -webkit-overflow-scrolling: touch;
  gap: 0.375rem !important;
  padding-bottom: 0.25rem !important;
}
html.genum-native [aria-label="Product categories"]::-webkit-scrollbar {
  display: none !important;
}
html.genum-native [aria-label="Product categories"] > button {
  flex: none !important;
  min-height: 1.75rem !important;
  padding-top: 0.4rem !important;
  padding-bottom: 0.4rem !important;
  padding-left: 0.625rem !important;
  padding-right: 0.625rem !important;
  font-size: 0.6875rem !important;
  line-height: 1 !important;
  white-space: nowrap !important;
}

/* Dense 2-column product grid (app feel instead of a wide web layout). */
html.genum-native main .grid.gap-5 {
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 0.625rem !important;
}
html.genum-native main .grid.gap-5 > article > a {
  height: 7.5rem !important;
}
html.genum-native main .grid.gap-5 article .p-5 {
  padding: 0.625rem !important;
}
html.genum-native main .grid.gap-5 article .mt-5 {
  margin-top: 0.375rem !important;
}
html.genum-native main .grid.gap-5 article h2 {
  font-size: 0.875rem !important;
  line-height: 1.1 !important;
}
html.genum-native main .grid.gap-5 article p.text-sm {
  font-size: 0.6875rem !important;
  line-height: 1.3 !important;
  min-height: 0 !important;
}
`;

export const INJECTED_CSS = css;

export const BRIDGE_SCRIPT = `(function () {
  if (window.__GENUM_BRIDGE__) return;
  window.__GENUM_BRIDGE__ = true;

  var root = document.documentElement;
  root.classList.add('genum-native');

  function installCss() {
    var id = 'genum-native-styles';
    if (document.getElementById(id)) return;
    var style = document.createElement('style');
    style.id = id;
    style.textContent = ${JSON.stringify(css)};
    var head = document.head || root;
    head.appendChild(style);
  }
  installCss();

  function post(payload) {
    try {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    } catch (e) {}
  }

  var last = { cart: null, path: null, session: null, online: null };

  function readCart() {
    try {
      var raw = JSON.parse(window.localStorage.getItem('genum-cart') || '[]');
      if (!Array.isArray(raw)) return { count: 0, size: 0 };
      var count = 0;
      for (var i = 0; i < raw.length; i++) {
        var line = raw[i];
        if (line && typeof line.productId === 'string' && Number.isFinite(line.quantity)) {
          count += Math.max(0, Math.floor(line.quantity));
        }
      }
      return { count: count, size: raw.length };
    } catch (e) {
      return { count: 0, size: 0 };
    }
  }

  function reportCart() {
    var cart = readCart();
    if (cart.count === last.cart) return;
    last.cart = cart.count;
    post({ type: 'genum:cart', count: cart.count, size: cart.size });
  }

  function reportPath() {
    var path = window.location.pathname;
    if (path === last.path) return;
    last.path = path;
    post({ type: 'genum:path', path: path });
  }

  function reportOnline() {
    var online = window.navigator && window.navigator.onLine;
    var flag = online === false ? false : true;
    if (flag === last.online) return;
    last.online = flag;
    post({ type: 'genum:online', online: flag });
  }

  function reportSession() {
    window.fetch('/api/auth/session', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var u = data && data.user;
        var user = u ? { name: u.name || '', email: u.email || '', role: u.role || 'customer' } : null;
        var key = user ? user.role + '|' + user.email : '';
        if (key === last.session) return;
        last.session = key;
        post({ type: 'genum:session', user: user });
      })
      .catch(function () {});
  }

  window.addEventListener('online', function () { last.online = null; reportOnline(); });
  window.addEventListener('offline', function () { last.online = null; reportOnline(); });
  window.addEventListener('popstate', function () { last.path = null; reportPath(); });
  window.addEventListener('storage', function () { last.cart = null; reportCart(); });

  function start() {
    reportCart();
    reportPath();
    reportOnline();
    reportSession();
    setInterval(reportCart, 1500);
    setInterval(reportPath, 2000);
    setInterval(reportOnline, 2000);
    setInterval(reportSession, 8000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
true;`;