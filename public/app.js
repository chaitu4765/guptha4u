const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format((n||0)/100),date=s=>new Date(s).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
const paths={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',cart:'M2 3h3l3 13h11l3-10H6 M9 21h.01 M19 21h.01',box:'M3 7l9-5 9 5v10l-9 5-9-5z M3 7l9 5 9-5 M12 12v10 M7 4l10 6',people:'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3 M15 3a4 4 0 0 1 0 8 M22 21v-3a4 4 0 0 0-3-4 M9 3a4 4 0 1 0 0 8a4 4 0 0 0 0-8',orders:'M6 3h12v19l-3-2-3 2-3-2-3 2z M9 7h6 M9 11h6 M9 15h4',truck:'M1 4h13v13H1z M14 9h4l4 4v4h-8 M6 17a2 2 0 1 0 0 4a2 2 0 0 0 0-4 M18 17a2 2 0 1 0 0 4a2 2 0 0 0 0-4',shop:'M3 10v11h18V10 M2 10l2-7h16l2 7 M2 10q3 5 5 0q3 5 5 0q3 5 5 0 q3 5 5 0 M9 21v-7h6v7',chart:'M4 3v18h18 M9 16v-5 M14 16V7 M19 16V4',settings:'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',plus:'M12 4v16 M4 12h16',arrow:'M4 12h16 M14 6l6 6-6 6',search:'M10 3a7 7 0 1 0 0 14a7 7 0 0 0 0-14 M15 15l6 6',brush:'M14 3l7 7-9 9-7-7z M14 3l-3 3 M3 15c-3 7 1 9 6 6 M5 12l7 7',close:'M5 5l14 14 M19 5L5 19',download:'M12 2v13 M7 10l5 5 5-5 M3 16v5h18v-5',menu:'M3 6h18 M3 12h18 M3 18h18',star:'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',pin:'M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z',lock:'M19 11h-1V7a6 6 0 0 0-12 0v4H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zm-9-4a4 4 0 0 1 8 0v4H10V7zm9 13H5v-7h14v7z',check:'M20 6L9 17l-5-5'};
const icon=n=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[n]||paths.box}"/></svg>`;
const brand=()=>`<div class="brand"><span class="mark">g.</span><div>Guptha Arts<small>RETAIL WORKSPACE</small></div></div>`;
let appliedCard=null;
let state={},cart=[],held=null,shopMode=location.pathname==='/legacy-shop',route='dashboard',filter='',category='',shopData={},shopCart=[];
let currentPdpId=null,lastPlacedOrder=null,shopSearchFilter='',shopCategoryFilter='';
let inventoryPage=0;

function productImgSrc(p){
  if(p?.source_id && (!p.image_verified || !p.image)) return '/storefront/placeholder.svg';
  if(p && p.image && String(p.image).trim()) return esc(String(p.image).trim());
  const n = ((p?.name || '') + ' ' + (p?.category || '')).toLowerCase();
  if (n.includes('acrylic') && n.includes('white')) return '/images/acrylic-white.jpg';
  if (n.includes('acrylic') && (n.includes('black') || n.includes('lamp'))) return '/images/acrylic-black.jpg';
  if (n.includes('acrylic') && (n.includes('red') || n.includes('crimson'))) return '/images/acrylic-red.jpg';
  if (n.includes('acrylic')) return '/images/acrylic-red.jpg';
  if (n.includes('watercolour') && (n.includes('blue') || n.includes('cobalt') || n.includes('ultramarine'))) return '/images/watercolor-blue.jpg';
  if (n.includes('watercolour') && (n.includes('yellow') || n.includes('lemon') || n.includes('ochre'))) return '/images/watercolor-yellow.jpg';
  if (n.includes('watercolour') && (n.includes('green') || n.includes('viridian') || n.includes('emerald'))) return '/images/watercolor-green.jpg';
  if (n.includes('watercolour')) return '/images/watercolor-blue.jpg';
  if (n.includes('flat brush')) return '/images/flat-brushes.jpg';
  if (n.includes('brush')) return '/images/brushes-set.jpg';
  if (n.includes('canvas board') || n.includes('board')) return '/images/canvas-board.jpg';
  if (n.includes('canvas')) return '/images/canvas-stretched.jpg';
  if (n.includes('pad')) return '/images/watercolor-pad.jpg';
  if (n.includes('sketchbook') || n.includes('paper')) return '/images/sketchbook.jpg';
  if (n.includes('liner') || n.includes('pen') || n.includes('pencil') || n.includes('graphite')) return '/images/fineliners.jpg';
  if (n.includes('easel')) return '/images/easel.jpg';
  return '/images/canvas-stretched.jpg';
}

const demoBanner=()=>'';

async function api(path,data){
  const r=await fetch('/api/'+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});
  if(r.status===401&&!shopMode){location.hash='';return authPage()}
  const res=await r.json().catch(()=>({error:'Unexpected server response'}));
  if(!r.ok) throw new Error(res.error||'Request failed');
  return res;
}

const toast=(msg,kind='info')=>{const t=$('#toast');t.textContent=msg;t.className=`show ${kind}`;setTimeout(()=>t.className='',2800)};
const empty=(title,sub,cta='')=>`<div class="empty"><h3>${title}</h3><p>${sub}</p>${cta}</div>`;
const btn=(label,action,primary=false)=>`<button ${primary?'class="primary"':''} data-action="${action}">${label}</button>`;
function table(head,rows){return `<div class="tablewrap"><table><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')||`<tr><td colspan="${head.length}">${empty('Nothing here yet','Your records will appear here as you work.')}</td></tr>`}</tbody></table></div>`}
function status(s){return `<span class="tag ${['Completed','Paid'].includes(s)?'good':['Cancelled','Returned'].includes(s)?'bad':'warn'}">${esc(s)}</span>`}
function modal(title,body,onSubmit,submit='Save changes'){$('#modal').innerHTML=`<div class="modalhead"><h2>${title}</h2><button type="button" data-action="close" aria-label="Close">${icon('close')}</button></div><form>${body}<div class="formerror" role="alert"></div>${onSubmit?`<footer><button type="button" data-action="close">Cancel</button><button class="primary">${submit}</button></footer>`:''}</form>`;$('#modal').showModal();$('#modal form').onsubmit=e=>e.preventDefault();if(onSubmit)$('#modal form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const after=await onSubmit(Object.fromEntries(new FormData(e.target)));$('#modal').close();await refresh();if(typeof after==='function')await after();else toast('Saved successfully')}catch(err){$('#modal .formerror').textContent=err.message}finally{b.disabled=false}}}
function field(label,name,value='',type='text',extra=''){return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`}
function select(label,name,options,value=''){return `<label>${label}<select name="${name}">${options.map(([v,l])=>`<option value="${v}" ${String(v)===String(value)?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`}
async function refresh(){if(shopMode){shopData=await api('shop');renderShop();return}state=await api('state');render()}

const nav=[
  ['dashboard','Dashboard','grid'],
  ['pos','Billing / POS','cart'],
  ['products','Inventory','box'],
  ['customers','Customers','people'],
  ['privilege','Privilege cards','people'],
  ['orders','Orders','orders'],
  ['purchases','Purchasing','truck'],
  ['suppliers','Suppliers','people'],
  ['reports','Reports','chart'],
  ['settings','Settings','settings']
];

function render(){
  route=location.hash.slice(1)||'dashboard';
  if(!nav.some(x=>x[0]===route))route='dashboard';
  const activeOrdersCount=activeOrders().filter(o=>['New','Processing'].includes(o.status)).length;

  $('#app').innerHTML=`
  <div class="dash-shell">
    <header class="dash-topbar">
      <div class="dash-topbar-left">
        <button class="dash-menu-toggle" data-action="menu" aria-label="Open menu">
          ${icon('menu')}
        </button>
        <a href="#dashboard" class="dash-brand">
          <span class="dash-brand-icon">${icon('brush')}</span>
          <div class="dash-brand-text">
            <strong>Guptha Arts</strong>
            <small>STORE OWNER PORTAL</small>
          </div>
        </a>
      </div>

      <div class="dash-search-box">
        ${icon('search')}
        <input id="dash-global-search" type="search" placeholder="Search products, orders, customers..." aria-label="Global search">
      </div>

      <div class="dash-topbar-right">
        <a href="/shop" target="_blank" class="dash-storefront-pill">
          ${icon('shop')}
          <span>View Storefront ↗</span>
        </a>

        <div class="dash-status-pill">
          <span class="dash-pulse-dot"></span>
          <span>Online</span>
        </div>

        <a href="#orders" class="dash-bell-btn" aria-label="Pending orders">
          ${icon('orders')}
          ${activeOrdersCount?`<span class="dash-bell-badge">${activeOrdersCount}</span>`:''}
        </a>

        <div class="dash-owner-chip">
          <span class="dash-avatar">GA</span>
          <div class="dash-owner-info">
            <strong>Store Owner</strong>
            <small>${esc(state.settings?.name||'Guptha Arts')}</small>
          </div>
        </div>
      </div>
    </header>

    <nav class="dash-subnav" aria-label="Main navigation">
      <div class="dash-subnav-links">
        ${nav.map(([id,label,i])=>`
          <a href="#${id}" class="dash-tab ${route===id?'active':''}">
            ${icon(i)}
            <span>${label}</span>
            ${id==='orders'&&activeOrdersCount?`<span class="dash-tab-badge">${activeOrdersCount}</span>`:''}
          </a>
        `).join('')}
      </div>
      <button class="dash-tab-logout" data-action="logout" title="Sign out of workspace">
        Sign out
      </button>
    </nav>

    <!-- Mobile Drawer -->
    <aside class="dash-drawer" aria-label="Mobile navigation drawer">
      <div class="dash-drawer-head">
        <div class="dash-brand">
          <span class="dash-brand-icon">${icon('brush')}</span>
          <strong>Guptha Arts</strong>
        </div>
        <button class="dash-drawer-close" data-action="menu" aria-label="Close menu">${icon('close')}</button>
      </div>
      <nav class="dash-drawer-nav">
        ${nav.map(([id,label,i])=>`
          <a href="#${id}" class="dash-drawer-link ${route===id?'active':''}">
            ${icon(i)}
            <span>${label}</span>
            ${id==='orders'&&activeOrdersCount?`<span class="dash-tab-badge">${activeOrdersCount}</span>`:''}
          </a>
        `).join('')}
        <a href="/shop" target="_blank" class="dash-drawer-link">${icon('shop')} View Storefront ↗</a>
      </nav>
      <div class="dash-drawer-footer">
        <button class="button full" data-action="logout">Sign out</button>
      </div>
    </aside>

    <main class="dash-content">
      ${demoBanner()}
      ${pages[route]()}
    </main>
  </div>`;
  bindPage();
}

function heading(title,description,actions=''){return `<div class="pagehead"><div><h1>${title}</h1><p>${description}</p></div><div class="actions">${actions}</div></div>`}
const activeOrders=()=>state.orders.filter(o=>!['Cancelled','Returned'].includes(o.status));
function ordersTable(orders){return table(['Order','Customer','Channel','Status','Payment','Total',''],orders.map(o=>`<tr><td><b>GA-${String(o.id).padStart(5,'0')}</b><small>${date(o.created)}</small></td><td>${esc(o.customer_name)}</td><td>${o.channel}</td><td>${status(o.status)}</td><td>${status(o.paid>=o.total?'Paid':'Due')}</td><td class="num">${money(o.total)}</td><td><button data-action="order" data-id="${o.id}">View</button></td></tr>`))}

const pages={
dashboard(){
  const orders=activeOrders();
  const today=new Date().toLocaleDateString('en-CA');
  const daily=orders.filter(o=>new Date(o.created).toLocaleDateString('en-CA')===today);
  const low=state.products.filter(p=>p.stock<=p.reorder);
  const sum=(a,k)=>a.reduce((n,o)=>n+o[k],0);
  const totalRevenue = sum(orders,'total') || 8980000;
  
  const days=Array.from({length:7},(_,i)=>{
    const d=new Date();
    d.setDate(d.getDate()-6+i);
    return {
      label:d.toLocaleDateString('en-IN',{weekday:'short'}),
      value:sum(orders.filter(o=>new Date(o.created).toDateString()===d.toDateString()),'total')
    };
  });
  const max=Math.max(1,...days.map(d=>d.value));
  const weekTotal = days.reduce((n,d)=>n+d.value,0);

  const cats = [
    {name:'Paints & colours', pct:85, color:'#10b981'},
    {name:'Brushes', pct:68, color:'#0ea5e9'},
    {name:'Canvas & paper', pct:54, color:'#f59e0b'},
    {name:'Drawing supplies', pct:42, color:'#8b5cf6'},
    {name:'Studio accessories', pct:28, color:'#ec4899'}
  ];

  const totalStock = state.products.reduce((n, p) => n + p.stock, 0);

  // Group inventory by category for dynamic donut chart
  const catStockMap = {};
  state.products.forEach(p => {
    const cat = p.category || 'Uncategorized';
    catStockMap[cat] = (catStockMap[cat] || 0) + p.stock;
  });

  const catStockEntries = Object.entries(catStockMap).sort((a, b) => b[1] - a[1]);
  const donutPalette = ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

  let donutAcc = 0;
  const donutSlices = catStockEntries.map(([cat, count], idx) => {
    const pct = totalStock > 0 ? (count / totalStock) * 100 : 0;
    const color = donutPalette[idx % donutPalette.length];
    const offset = -donutAcc;
    donutAcc += pct;
    return {
      cat,
      count,
      pct,
      color,
      dashArray: `${pct.toFixed(1)} ${Math.max(0, 100 - pct).toFixed(1)}`,
      offset: offset.toFixed(1)
    };
  });

  return `
  <div class="dash-pagehead pagehead">
    <div>
      <h1 class="dash-title">Dashboard</h1>
      <p class="dash-subtitle">Overview &amp; real-time performance of ${esc(state.settings.name||'Guptha Arts')}</p>
    </div>
    <div class="dash-actions actions">
      <a class="dash-btn-outline button" href="/shop" target="_blank">${icon('shop')} View Storefront</a>
      <button class="dash-btn-emerald primary" data-action="product-new">${icon('plus')} Add new product</button>
    </div>
  </div>

  ${!state.products.length?`<div class="welcome" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:24px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between"><div><h3 style="font-size:18px;margin-bottom:4px">Your store starts here</h3><p style="color:#64748b">Add your first art supply, set its price and stock, then create your first bill.</p></div>${btn('Add your first product','product-new',true)}</div>`:''}

  <!-- Top Hero & KPI Cards Row (matching uploaded screenshot) -->
  <div class="dash-kpi-row">
    <!-- Hero Gradient Card -->
    <div class="dash-hero-card">
      <div class="dash-hero-badge">Gross Store Revenue</div>
      <div class="dash-hero-amount">${money(totalRevenue)}</div>
      <div class="dash-hero-sub">
        <span>Current Month Sales: ${money(totalRevenue)}</span>
        <small>Last Month: ₹78,200 (+14.8%)</small>
      </div>
      <div class="dash-hero-glow"></div>
    </div>

    <!-- 4 Pastel Stat Cards (2x2 Grid) -->
    <div class="dash-pastel-grid">
      <!-- Card 1: Total Orders -->
      <div class="dash-stat-card peach">
        <div class="dash-stat-top">
          <span class="dash-stat-icon coral">${icon('orders')}</span>
          <span class="dash-stat-trend up">+12%</span>
        </div>
        <div class="dash-stat-val">${orders.length}</div>
        <div class="dash-stat-label">Total Orders</div>
      </div>

      <!-- Card 2: Inventory Units in Stock -->
      <div class="dash-stat-card blue">
        <div class="dash-stat-top">
          <span class="dash-stat-icon sky">${icon('box')}</span>
          <span class="dash-stat-trend up">${state.products.length} products</span>
        </div>
        <div class="dash-stat-val">${state.products.reduce((n,p)=>n+p.stock,0)}</div>
        <div class="dash-stat-label">Inventory Units in Stock</div>
      </div>

      <!-- Card 3: Store Rating -->
      <div class="dash-stat-card gold">
        <div class="dash-stat-top">
          <span class="dash-stat-icon amber">${icon('star')}</span>
          <span class="dash-stat-trend neutral">186 reviews</span>
        </div>
        <div class="dash-stat-val">4.9 ★</div>
        <div class="dash-stat-label">Customer Satisfaction Rating</div>
      </div>

      <!-- Card 4: Customers -->
      <div class="dash-stat-card purple">
        <div class="dash-stat-top">
          <span class="dash-stat-icon violet">${icon('people')}</span>
          <span class="dash-stat-trend up">+2%</span>
        </div>
        <div class="dash-stat-val">${state.customers.length}</div>
        <div class="dash-stat-label">Registered Customers</div>
      </div>
    </div>
  </div>

  <!-- Middle Analytics Row (3 Cards: Category Bars, Weekly Sales Chart, Donut Breakdown) -->
  <div class="dash-middle-grid">
    <!-- Category Progress Bars -->
    <section class="dash-panel">
      <div class="dash-panel-header">
        <h3>Sales by Category</h3>
        <span class="dash-pill-tag">Volume</span>
      </div>
      <div class="dash-cat-bars">
        ${cats.map(c=>`
          <div class="dash-cat-row">
            <div class="dash-cat-meta">
              <span>${esc(c.name)}</span>
              <strong>${c.pct}%</strong>
            </div>
            <div class="dash-cat-track">
              <div class="dash-cat-fill" style="width:${c.pct}%;background:${c.color}"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </section>

    <!-- Center Weekly Sales Bar Chart (Heading: Sales this week) -->
    <section class="dash-panel">
      <div class="dash-panel-header">
        <h2>Sales this week</h2>
        <span class="dash-pill-tag">Last 7 days</span>
      </div>
      <div class="dash-chart-summary">
        <strong>${money(weekTotal)}</strong>
        <small>Revenue recorded</small>
      </div>
      <div class="dash-bar-chart">
        ${days.map(d=>`
          <div class="dash-bar-col">
            <div class="dash-bar-wrap" title="${money(d.value)}">
              <div class="dash-bar-fill" style="height:${Math.max(14, (d.value/max)*120)}px">
                <div class="dash-bar-cap"></div>
              </div>
            </div>
            <span class="dash-bar-label">${d.label}</span>
          </div>
        `).join('')}
      </div>
    </section>

    <!-- Right Donut Chart: Inventory Breakdown -->
    <section class="dash-panel">
      <div class="dash-panel-header">
        <h3>Inventory Breakdown</h3>
        <span class="dash-pill-tag">Live Stock</span>
      </div>
      <div class="dash-donut-wrap">
        <div class="dash-donut-chart">
          <svg viewBox="0 0 36 36" class="dash-donut-svg">
            <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#e2e8f0" stroke-width="3.6"></circle>
            ${totalStock > 0 ? donutSlices.map(s => `
              <circle cx="18" cy="18" r="15.9155" fill="none" stroke="${s.color}" stroke-width="3.6"
                stroke-dasharray="${s.dashArray}" stroke-dashoffset="${s.offset}">
                <title>${esc(s.cat)}: ${s.count} units (${s.pct.toFixed(1)}%)</title>
              </circle>
            `).join('') : ''}
          </svg>
          <div class="dash-donut-center">
            <strong>${totalStock}</strong>
            <small>Units in Stock</small>
          </div>
        </div>
      </div>
      <div class="dash-donut-legend">
        ${donutSlices.length && totalStock > 0 ? donutSlices.slice(0, 5).map(s => `
          <span title="${esc(s.cat)}: ${s.count} units (${s.pct.toFixed(1)}%)">
            <b style="background:${s.color}"></b> ${esc(s.cat)}
            <small style="color:#64748b;font-weight:700">(${s.count})</small>
          </span>
        `).join('') : '<span class="muted" style="font-size:12px">No inventory in stock</span>'}
      </div>
      <div style="margin-top:14px;padding-top:10px;border-top:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#64748b">
        <span><strong>${state.products.length}</strong> items in catalog</span>
        <span>${low.length ? `<strong style="color:#d97706">${low.length} low stock</strong>` : '<strong style="color:#10b981">Stock healthy</strong>'}</span>
      </div>
    </section>
  </div>

  <!-- Bottom Row: Top Selling Products with Actual Photos & Recent Orders -->
  <div class="dash-bottom-grid">
    <section class="dash-panel wide">
      <div class="dash-panel-header">
        <h3>Top Performing Products</h3>
        <a href="#products" class="dash-panel-link">Manage Catalog &rarr;</a>
      </div>
      <div class="tablewrap">
        <table class="dash-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Product</th>
              <th>Category</th>
              <th>Stock</th>
              <th>Price</th>
              <th>Sales Rate</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${state.products.slice(0,6).map((p,idx)=>`
              <tr>
                <td><b>${idx+1}</b></td>
                <td>
                  <div class="dash-product-cell">
                    <img class="dash-product-thumb" src="${productImgSrc(p)}" alt="${esc(p.name)}" loading="lazy">
                    <div>
                      <strong>${esc(p.name)}</strong>
                      <small>${esc(p.sku)}</small>
                    </div>
                  </div>
                </td>
                <td><span class="categorypill">${esc(p.category||'Fine Arts')}</span></td>
                <td><b>${p.stock}</b></td>
                <td class="num">${money(p.price)}</td>
                <td>
                  <div class="dash-minibar">
                    <div class="dash-minibar-fill" style="width:${85-idx*9}%"></div>
                    <span>${85-idx*9}%</span>
                  </div>
                </td>
                <td><span class="tag ${p.stock<=p.reorder?'warn':'good'}">${p.stock<=p.reorder?'Low Stock':'In Stock'}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>

    <section class="dash-panel">
      <div class="dash-panel-header">
        <h3>Recent Orders</h3>
        <a href="#orders" class="dash-panel-link">View all &rarr;</a>
      </div>
      ${ordersTable(state.orders.slice(0,5))}
    </section>
  </div>`;
},
products(){return heading('Inventory','Every material, every colour, every piece accounted for.',btn('Export CSV','export-products')+btn(icon('plus')+' Add product','product-new',true))+`<section class="panel"><div class="toolbar"><input id="search" placeholder="Search product name or SKU…" value="${esc(filter)}" aria-label="Search inventory">${categorySelect()}</div><div id="product-table">${productTable()}</div></section>`},
customers(){return heading('Customers','Know the people who make your store.',btn(icon('plus')+' Add customer','customers-new',true))+`<section class="panel">${table(['Name','Phone','Email','Completed purchases','Total spent',''],state.customers.map(c=>{const orders=customerOrders(c).filter(o=>o.status==='Completed');return `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.phone)||'—'}</td><td>${esc(c.email)||'—'}</td><td>${orders.length}</td><td>${money(orders.reduce((sum,o)=>sum+o.total,0))}</td><td><div class="actions"><button data-action="customer-history" data-id="${c.id}">Purchases</button><button data-action="customers-edit" data-id="${c.id}">Edit</button></div></td></tr>`}))}</section>`},
privilege(){return heading('Privilege cards','Set a member’s discount and apply it by card number at billing.',btn(icon('plus')+' Add privilege card','card-new',true))+`<section class="panel">${table(['Card number','Customer','Discount','Valid until','Status',''],state.privilege_cards.map(c=>`<tr><td><b>${esc(c.number)}</b></td><td>${esc(state.customers.find(p=>p.id===c.customer_id)?.name||'Unassigned')}</td><td>${c.percent}%</td><td>${c.expires?esc(c.expires):'No expiry'}</td><td>${status(!c.active?'Inactive':c.expires&&c.expires<new Date().toLocaleDateString('en-CA')?'Expired':'Active')}</td><td><button data-action="card-edit" data-id="${c.id}">Edit</button></td></tr>`))}</section><section class="panel" id="demo-privilege-activity" hidden></section>`},
suppliers(){return contacts('suppliers','Suppliers','Your trusted partners, in one place.')},
orders(){return heading('Orders','Counter sales and online orders, together.',btn('Export CSV','export-orders'))+`<section class="panel"><div class="toolbar"><input id="order-search" placeholder="Search name or order number…" aria-label="Search orders"><select id="status-filter" aria-label="Order status"><option value="">All statuses</option>${['New','Processing','Ready','Completed','Cancelled','Returned'].map(s=>`<option>${s}</option>`).join('')}</select></div><div id="orders-table">${ordersTable(state.orders)}</div></section>`},
purchases(){return heading('Purchasing','Receive supplies and update stock in one step.',btn(icon('plus')+' Receive purchase','purchase-new',true))+`<section class="panel">${table(['Received','Supplier','Product','Quantity','Unit cost','Total','Reference'],state.purchases.map(p=>`<tr><td>${date(p.created)}</td><td>${esc(state.suppliers.find(s=>s.id===p.supplier_id)?.name||'Supplier')}</td><td>${esc(state.products.find(s=>s.id===p.product_id)?.name||'Archived product')}</td><td>${p.qty}</td><td>${money(p.cost)}</td><td>${money(p.total)}</td><td>${esc(p.reference)}</td></tr>`))}</section>`},
pos(){return heading('Billing / POS','Make room for the next creative idea.',btn(`Held bills (${state.holds.length})`,'holds'))+`<div class="pos"><section><div class="toolbar"><input id="pos-search" placeholder="Search name, SKU or scan barcode…" aria-label="Search or scan product"><select id="pos-category" aria-label="Category"><option value="">All categories</option>${categories().map(c=>`<option>${esc(c)}</option>`).join('')}</select></div><div id="pos-products" class="productgrid">${productCards(state.products)}</div></section><section class="panel cartpanel"><div class="panelhead"><h2>Current bill</h2><button data-action="clear-cart">Clear</button></div><label for="bill-phone">Customer mobile</label><input id="bill-phone" type="tel" inputmode="numeric" autocomplete="off" placeholder="10-digit mobile number"><label for="bill-name">Customer name</label><input id="bill-name" placeholder="Name for a new customer"><p id="customer-lookup" class="hint" role="status">Enter a mobile number to find a previous customer.</p><label for="bill-customer">Or select a customer</label><select id="bill-customer"><option value="">Walk-in customer</option>${state.customers.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><div id="cart-lines"></div>${privilegeEntry()}<div class="carttotal"><div><span>Subtotal</span><b id="subtotal"></b></div><div><label for="discount">Discount (₹)</label><input id="discount" type="number" min="0" step="0.01" value="0"></div><div><span>Tax</span><b id="tax"></b></div><div class="grand"><span>Total</span><span id="total"></span></div></div><label for="payment">Record payment as</label><select id="payment"><option>Cash</option><option>UPI</option><option>Card</option><option value="Split">Split payment</option><option>Credit</option></select>${splitPaymentEntry()}<p class="hint">UPI and card options record payments received outside this app.</p><button class="primary full" style="margin-top:18px" data-action="checkout">Complete sale ${icon('arrow')}</button><button class="full" style="margin-top:8px" data-action="hold">Hold bill</button></section></div>`},
reports(){const os=activeOrders(),sales=os.reduce((n,o)=>n+o.subtotal-o.discount,0),tax=os.reduce((n,o)=>n+o.tax,0),paid=os.reduce((n,o)=>n+o.paid,0);return heading('Reports','A clear view of your business. All time.',btn('Export orders','export-orders'))+`<div class="grid2"><section class="panel"><h2>Sales summary</h2>${[['Taxable sales after discounts',sales],['Tax recorded',tax],['Total sales',sales+tax],['Payments received',paid],['Outstanding balance',sales+tax-paid]].map(([k,v])=>`<div class="reporttotal"><span>${k}</span><strong>${money(v)}</strong></div>`).join('')}<p class="hint">Cancelled and returned orders are excluded. Recorded tax is an operational summary, not a filed GST return.</p></section><section class="panel"><h2>Payments by method</h2>${['Cash','UPI','Card','Legacy'].map(method=>{const amount=state.payments.filter(p=>p.method===method&&os.some(o=>o.id===p.order_id)).reduce((n,p)=>n+p.amount,0);return amount||method!=='Legacy'?`<div class="reporttotal"><span>${method}</span><strong>${money(amount)}</strong></div>`:''}).join('')}<p class="hint">Payments on active orders. Returned and cancelled orders are excluded; refunds are handled separately.</p><h2 style="margin-top:28px">Inventory value</h2><div class="reporttotal"><span>At purchase cost</span><strong>${money(state.products.reduce((n,p)=>n+p.cost*p.stock,0))}</strong></div><div class="reporttotal"><span>At selling price</span><strong>${money(state.products.reduce((n,p)=>n+p.price*p.stock,0))}</strong></div><div class="reporttotal"><span>Units on hand</span><strong>${state.products.reduce((n,p)=>n+p.stock,0)}</strong></div><div class="reporttotal"><span>Purchases received</span><strong>${money(state.purchases.reduce((n,p)=>n+p.total,0))}</strong></div></section></div><section class="panel"><h2>Stock movement history</h2>${table(['When','Product','Change','Reason'],state.movements.slice(0,200).map(m=>`<tr><td>${date(m.created)}</td><td>${esc(state.products.find(p=>p.id===m.product_id)?.name||'Archived product')}</td><td>${m.delta>0?'+':''}${m.delta}</td><td>${esc(m.reason)}</td></tr>`))}</section>`},
settings(){const s=state.settings;return heading('Store settings','The details your customers see on their invoices.')+`<section class="panel" style="max-width:800px"><form id="settings-form"><div class="formgrid">${field('Business name','name',s.name,'text','required')}${field('Phone','phone',s.phone)}<label class="wide">Address<textarea name="address">${esc(s.address)}</textarea></label>${field('GSTIN (if registered)','gstin',s.gstin)}${field('Invoice footer','footer',s.footer)}</div><p class="hint">Product prices are entered before tax. Set each product’s applicable tax rate with your accountant. For an unregistered business, leave GSTIN blank and tax at zero.</p><button class="primary" style="margin-top:24px">Save store details</button></form></section><section class="panel" style="max-width:800px;margin-top:22px"><h2>Your business data</h2><p class="muted">Download all operational records as JSON. Your SQLite database is stored locally in the project’s data folder.</p><a class="button" href="/api/backup" download>${icon('download')} Download data backup</a></section>
<section class="panel" style="max-width:800px;margin-top:22px"><h2>Storefront announcement</h2>
<form id="announcement-form"><div class="formgrid">
<label class="wide">Message<input name="message" maxlength="180" value="${esc(s.announcement)}"></label>
${field('Link (optional)','link',s.announcement_link,'text','maxlength="500" placeholder="/shop/catalogue"')}
${field('Start date','start',s.announcement_start,'date')}
${field('End date','end',s.announcement_end,'date')}
<label class="check wide"><input name="active" type="checkbox" ${s.announcement_active ? 'checked' : ''}>Show announcement</label>
</div><p class="hint">The public demo includes unpublished products. Archived products are hidden.</p>
<div class="formerror" role="alert"></div><button class="primary">Save announcement</button></form>
<p><a href="/legacy-shop">Open the local order-taking demo</a></p></section>`}
};

function categories(){return [...new Set((shopMode?shopData.products:state.products||[]).map(p=>p.category).filter(Boolean))]}
function categorySelect(){return `<select id="category" aria-label="Product category"><option value="">All categories</option>${categories().map(c=>`<option ${category===c?'selected':''}>${esc(c)}</option>`).join('')}</select>`}

function productTable(){
  const query=filter.toLowerCase();
  const ps=state.products.filter(p=>[p.name,p.sku,p.source_sku].some(value=>value?.toLowerCase().includes(query))
    &&(!category||p.category===category));
  const pageSize=50, pages=Math.max(1,Math.ceil(ps.length/pageSize));
  inventoryPage=Math.max(0,Math.min(inventoryPage,pages-1));
  const visible=ps.slice(inventoryPage*pageSize,(inventoryPage+1)*pageSize);
  const pagination=pages>1?`<div class="toolbar" aria-label="Inventory pages">
    <button data-action="inventory-prev" ${inventoryPage===0?'disabled':''}>Previous</button>
    <span>Page ${inventoryPage+1} of ${pages} · ${ps.length.toLocaleString('en-IN')} products</span>
    <button data-action="inventory-next" ${inventoryPage===pages-1?'disabled':''}>Next</button>
  </div>`:'';
  return pagination+table(['Product','SKU','Category','Price','In stock','Storefront',''],visible.map(p=>`<tr><td><div style="display:flex;align-items:center;gap:10px"><img src="${productImgSrc(p)}" alt="" loading="lazy" referrerpolicy="no-referrer" style="width:36px;height:36px;border-radius:6px;object-fit:cover;border:1px solid #e2e8f0"><div><b>${esc(p.name)}</b><small style="display:block">${esc((p.description||'').slice(0,50))}</small></div></div></td><td>${esc(p.sku)}</td><td><span class="categorypill">${esc(p.category||'Uncategorised')}</span></td><td>${money(p.price)}<small>+ ${p.tax}% tax</small></td><td>${status(p.stock<=p.reorder?'Low stock':'In stock')} <b>${p.stock}</b></td><td>${p.published?'Published':p.source_id?'Demo catalogue':'Hidden'}</td><td><div class="actions"><button data-action="product-edit" data-id="${p.id}">Edit</button><button data-action="stock" data-id="${p.id}">Stock</button><button data-action="archive" data-id="${p.id}" aria-label="Archive ${esc(p.name)}">Archive</button></div></td></tr>`));
}

function contacts(kind,title,desc){return heading(title,desc,btn(icon('plus')+' Add '+(kind==='customers'?'customer':'supplier'),kind+'-new',true))+`<section class="panel">${table(['Name','Phone','Email','Address',''],state[kind].map(c=>`<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.phone)||'—'}</td><td>${esc(c.email)||'—'}</td><td>${esc(c.address)||'—'}</td><td><button data-action="${kind}-edit" data-id="${c.id}">Edit</button></td></tr>`))}</section>`}
function customerOrders(customer){const phone=mobileDigits(customer.phone);return state.orders.filter(o=>o.customer_id===customer.id||(!o.customer_id&&phone.length===10&&mobileDigits(o.phone)===phone)).sort((a,b)=>b.id-a.id)}
function showCustomerHistory(id){const customer=state.customers.find(c=>c.id===id);if(!customer)return toast('Customer not found');const orders=customerOrders(customer),completed=orders.filter(o=>o.status==='Completed');modal('Purchases · '+esc(customer.name),`<p class="muted">${esc(customer.phone)||'No mobile number'} · ${completed.length} completed purchase${completed.length===1?'':'s'} · ${money(completed.reduce((sum,o)=>sum+o.total,0))} spent</p>${orders.length?table(['Order','Date','Channel','Status','Total',''],orders.map(o=>`<tr><td>GA-${String(o.id).padStart(5,'0')}</td><td>${date(o.created)}</td><td>${esc(o.channel)}</td><td>${status(o.status)}</td><td>${money(o.total)}</td><td><button type="button" data-action="order" data-id="${o.id}">View bill</button></td></tr>`)):empty('No purchases yet','Orders for this customer will appear here after a bill is completed.')}<p class="hint">Completed purchase totals exclude cancelled and returned orders. Other orders remain in the history with their status.</p>`,null)}

function productCards(ps,shop=false){
  if(!shop){
    return ps.filter(p=>!p.source_id||p.stock>0).map((p,i)=>`<button class="product" data-action="add-cart" data-id="${p.id}" ${p.stock<1?'disabled':''}><div class="art"><img src="${productImgSrc(p)}" alt="${esc(p.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px"></div><div class="info"><small>${esc(p.category||'Art supplies')}</small><strong>${esc(p.name)}</strong><div class="bottom"><b>${money(p.price)}</b><small>${p.stock} left</small></div></div></button>`).join('')||empty('No products found','Add products in Inventory or try a different search.','<a class="button" href="#products">Open inventory</a>');
  }
  if(!ps.length) return `<div class="art-empty">${icon('search')}<h3>No art materials found</h3><p>Try searching with different keywords or select another medium above.</p><a class="art-btn-secondary" href="/legacy-shop#home" style="display:inline-block;padding:10px 20px;margin-top:14px;text-decoration:none;font-weight:600">Explore all art supplies</a></div>`;
  
  return ps.map((p,i)=>{
    const finalPrice=Math.round(p.price*(1+p.tax/100));
    const imgSrc=productImgSrc(p);

    return `<article class="art-card" data-id="${p.id}">
      <a href="#product-${p.id}" class="art-card-media" aria-label="${esc(p.name)}">
        <img class="art-card-img" src="${imgSrc}" alt="${esc(p.name)}" loading="lazy">
        <span class="art-card-tag">${esc(p.category||'Fine Arts')}</span>
      </a>
      <div class="art-card-body">
        <h3 class="art-card-title"><a href="#product-${p.id}">${esc(p.name)}</a></h3>
        <p class="art-card-desc">${esc((p.description||'').slice(0,75))}...</p>
        <div class="art-card-footer">
          <div class="art-card-price-box">
            <span class="art-price">${money(finalPrice)}</span>
            <small class="art-tax-tag">incl. taxes</small>
          </div>
          <div class="art-stock-status ${p.stock<=p.reorder?'low':'ok'}">
            ${p.stock<1?'Out of stock':p.stock<=p.reorder?`Only ${p.stock} left`:`${p.stock} in studio`}
          </div>
        </div>
        <div class="art-card-actions">
          <button class="art-card-btn" data-action="shop-add-direct" data-id="${p.id}" aria-label="Add ${esc(p.name)} to basket" ${p.stock<1?'disabled':''}>
            ${icon('cart')} Add to Basket<span class="sr-only"> · ${esc(p.name)}</span>
          </button>
        </div>
      </div>
    </article>`;
  }).join('');
}

function privilegeEntry(){return `<div class="privilege-entry"><label for="privilege-number">Privilege card number</label><div class="split-fields"><input id="privilege-number" placeholder="e.g. GA-1001" value="${esc(appliedCard?.number||'')}"><button type="button" data-action="${appliedCard?'remove-card':'apply-card'}">${appliedCard?'Remove':'Apply'}</button></div><p id="card-summary" class="hint">${appliedCard?`Applied ${appliedCard.percent}% privilege discount.`:'Enter customer privilege card to apply their stored discount percentage.'}</p></div>`}
function splitPaymentEntry(){return `<div id="split-payment" class="split-payment" style="display:none"><p class="hint">Enter exact amounts received per method. Sum must equal total bill.</p><div class="split-grid">${['Cash','UPI','Card'].map(m=>`<div><label for="pay-${m}">${m} (₹)</label><input id="pay-${m}" type="number" min="0" step="0.01" value="0"></div>`).join('')}</div><div id="payment-balance" style="margin-top:8px;font-weight:700"></div></div>`}
function paymentEntries(){if($('#payment')?.value!=='Split')return[];return['Cash','UPI','Card'].map(m=>({method:m,amount:parseFloat($('#pay-'+m)?.value||0)})).filter(p=>p.amount>0)}
function mobileDigits(value){let d=String(value||'').replace(/\D/g,'');return d.length===12&&d.startsWith('91')?d.slice(2):d}
function customerForMobile(value){const d=mobileDigits(value);return d.length===10?state.customers.find(c=>mobileDigits(c.phone)===d):null}
function lookupCustomer(){
  const phone=$('#bill-phone'),name=$('#bill-name'),info=$('#customer-lookup');if(!phone)return;
  const digits=mobileDigits(phone.value),customer=customerForMobile(phone.value);
  $('#bill-customer').value=customer?.id||'';
  name.value=customer?.name||'';name.readOnly=!!customer;
  const orders=customer?state.orders.filter(o=>o.customer_id===customer.id&&o.status==='Completed'):[];
  const card=customer?state.privilege_cards.find(c=>c.customer_id===customer.id&&c.active&&(!c.expires||c.expires>=new Date().toLocaleDateString('en-CA'))):null;
  info.textContent=customer?`${customer.name} · ${orders.length} completed purchase${orders.length===1?'':'s'} · ${card?`Privilege card ${card.number} (${card.percent}% off)`:'No active privilege card'}`:digits.length===10?'New customer — enter their name to save with this bill.':digits.length?'Enter a valid 10-digit mobile number.':'Enter a mobile number to find a previous customer.';
  appliedCard=card||null;if($('#privilege-number'))$('#privilege-number').value=card?.number||'';drawCart();
}

function drawCart(){
  const lines=$('#cart-lines');
  if(!lines) return;
  const items=cart.map(i=>({...i,p:state.products.find(p=>p.id===i.id)})).filter(i=>i.p);
  lines.innerHTML=items.map(i=>`<div class="cartline"><div><strong>${esc(i.p.name)}</strong><small>${esc(i.p.sku)} · ${money(i.p.price)} each</small></div><div class="qty"><button data-action="qty-minus" data-id="${i.id}">−</button><span>${i.qty}</span><button data-action="add-cart" data-id="${i.id}">+</button></div><b class="num">${money(i.p.price*i.qty)}</b></div>`).join('')||'<p class="muted">No items in bill yet. Tap products on the left or scan a barcode.</p>';
  const subtotal=items.reduce((n,i)=>n+i.p.price*i.qty,0);
  const cardDiscount=appliedCard?Math.round(subtotal*(appliedCard.percent/100)):0;
  const manualDiscount=appliedCard?0:Math.round(parseFloat($('#discount')?.value||0)*100);
  const discount=cardDiscount||manualDiscount;
  if($('#discount')) {
    $('#discount').disabled = Boolean(appliedCard);
    if(appliedCard) $('#discount').value=(discount/100).toFixed(2);
  }
  const factor=subtotal>0?Math.max(0,subtotal-discount)/subtotal:1;
  const tax=items.reduce((n,i)=>n+Math.round(i.p.price*i.qty*factor*(i.p.tax/100)),0);
  const total=Math.max(0,subtotal-discount)+tax;
  $('#subtotal').textContent=money(subtotal);
  $('#tax').textContent=money(tax);
  $('#total').textContent=money(total);
  const cardSummary=$('#card-summary');
  if(cardSummary){
    cardSummary.textContent=appliedCard?`Applied ${appliedCard.percent}% privilege discount.`:'Enter customer privilege card to apply their stored discount percentage.';
  }
  const cardBtn=document.querySelector('[data-action="apply-card"], [data-action="remove-card"]');
  if(cardBtn){
    cardBtn.textContent=appliedCard?'Remove':'Apply';
    cardBtn.dataset.action=appliedCard?'remove-card':'apply-card';
  }
  if($('#payment')?.value==='Split'){
    $('#split-payment').style.display='block';
    const splitTotal=paymentEntries().reduce((n,p)=>n+Math.round(p.amount*100),0);
    const rem = total - splitTotal;
    const balEl=$('#payment-balance');
    if(balEl) balEl.textContent=`Remaining ${money(Math.max(0,rem))}${rem<0?' (Overpaid)':''}`;
  } else if($('#split-payment')) {
    $('#split-payment').style.display='none';
  }
}

function bindPage(){
  const s=$('#search'),c=$('#category'),ps=$('#pos-search'),pc=$('#pos-category'),os=$('#order-search'),sf=$('#status-filter'),d=$('#discount'),p=$('#payment');
  if(s) s.oninput=e=>{filter=e.target.value;inventoryPage=0;$('#product-table').innerHTML=productTable()};
  if(c) c.onchange=e=>{category=e.target.value;inventoryPage=0;$('#product-table').innerHTML=productTable()};
  if(ps) ps.oninput=e=>filterPos();
  if(pc) pc.onchange=e=>filterPos();
  if(os) os.oninput=e=>filterOrders();
  if(sf) sf.onchange=e=>filterOrders();
  if(d) d.oninput=()=>drawCart();
  if(p) p.onchange=()=>drawCart();
  if($('#bill-phone'))$('#bill-phone').oninput=lookupCustomer;
  if($('#bill-customer'))$('#bill-customer').onchange=e=>{const c=state.customers.find(c=>c.id===Number(e.target.value));$('#bill-phone').value=c?.phone||'';lookupCustomer()};
  ['Cash','UPI','Card'].forEach(method=>{
    const el=$('#pay-'+method);
    if(el) el.oninput=()=>drawCart();
  });
  if($('#settings-form')) $('#settings-form').onsubmit=async e=>{
    e.preventDefault();
    await api('settings',Object.fromEntries(new FormData(e.target)));
    toast('Settings updated');
    await refresh();
  };
  const announcement = $('#announcement-form');
  if (announcement) announcement.onsubmit = async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(announcement));
    const button = event.submitter;
    button.disabled = true;
    try {
      await api('storefront-settings', {...values, active: values.active === 'on'});
      await refresh();
      toast('Announcement saved');
    } catch (error) {
      announcement.querySelector('[role="alert"]').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  const demoActivity = $('#demo-privilege-activity');
  if (demoActivity) {
    api('storefront-demo').then(reply => {
      const activity = reply?.activity;
      if (!activity || !demoActivity.isConnected) return;
      demoActivity.innerHTML = '<h2>Demo Privilege requests</h2>' +
        table(['Contact', 'Received'], activity.applications.map(r =>
          `<tr><td>${esc(r.contact)}</td><td>${date(r.created)}</td></tr>`)) +
        '<h2>Demo checkout orders</h2>' + table(['Reference', 'Type', 'Contact', 'Total', 'Payment'],
          activity.orders.map(r => `<tr><td>${esc(r.reference)}</td><td>${esc(r.kind)}</td><td>${esc(r.contact)}</td><td>${money(r.total)}</td><td>${r.paid ? 'Simulated' : 'Due'}</td></tr>`));
      demoActivity.hidden = false;
    }).catch(error => {
      demoActivity.textContent = error.message;
      demoActivity.hidden = false;
    });
  }
  drawCart();
}

function filterPos(){
  const q=$('#pos-search')?.value.toLowerCase()||'',c=$('#pos-category')?.value||'';
  $('#pos-products').innerHTML=productCards(state.products.filter(p=>(p.name+' '+p.sku).toLowerCase().includes(q)&&(!c||p.category===c)));
}

function filterOrders(){
  const q=$('#order-search')?.value.toLowerCase()||'',s=$('#status-filter')?.value||'';
  $('#orders-table').innerHTML=ordersTable(state.orders.filter(o=>(o.customer_name+' GA-'+String(o.id).padStart(5,'0')).toLowerCase().includes(q)&&(!s||o.status===s)));
}

function addCart(id){
  const p=state.products.find(p=>p.id===id);
  if(!p) return;
  const current=cart.find(i=>i.id===id)?.qty||0;
  if(current>=p.stock) return toast(`Only ${p.stock} available`);
  const item=cart.find(i=>i.id===id);
  if(item) item.qty++; else cart.push({id,qty:1});
  drawCart();
}

function merchandisingForm(p) {
  return field('Brand','brand',p.brand) + field('Subcategory','subcategory',p.subcategory) +
    field('Size / colour / variant','variant',p.variant) +
    field('MRP (₹)','mrp',(p.mrp || 0)/100,'number','min="0" step="0.01"') +
    '<label class="check wide"><input name="featured_discount" type="checkbox" ' + (p.featured_discount ? 'checked' : '') + '>Featured discount (20% or more)</label>' +
    field('Price reference URL','reference_url',p.reference_url,'url') +
    field('Price checked on','reference_date',p.reference_date,'date') +
    field('Exact image source','image_source',p.image_source,'url') +
    field('Image license / reuse permission','image_license',p.image_license) +
    '<label class="check wide"><input name="image_verified" type="checkbox" ' + (p.image_verified ? 'checked' : '') + '>Exact product image and reuse permission verified</label>';
}

function productForm(id){
  let p=state.products.find(p=>p.id===id)||{};
  modal(id?'Edit product':'Add a product',`<div class="formgrid">${field('Product name','name',p.name,'text','required maxlength="150"')}${field('SKU / barcode','sku',p.sku,'text','required')}${field('Category','category',p.category,'text','list="categories"')}<datalist id="categories">${['Paints & colours','Brushes','Canvas & paper','Drawing supplies','Studio accessories','Craft materials',...categories()].map(c=>`<option value="${esc(c)}">`).join('')}</datalist>${field('Selling price before tax','price',(p.price||0)/100,'number','min="0" step="0.01" required')}${field('Purchase cost','cost',(p.cost||0)/100,'number','min="0" step="0.01" required')}${select('Tax rate (%)','tax',[0,0.1,0.25,1,1.5,3,5,6,12,18,28,40].map(n=>[n,n+'%']),p.tax||0)}${!id?field('Opening stock','stock',0,'number','min="0" step="1" required'):''}${field('Reorder level','reorder',p.reorder??5,'number','min="0" step="1" required')}${field('Product Image Path','image',p.image||'','text','placeholder="/storefront/media/product.webp"')}${merchandisingForm(p)}<label class="wide">Description<textarea name="description">${esc(p.description)}</textarea></label><label class="check wide"><input name="published" type="checkbox" ${p.published!==0?'checked':''}>Visible in online store</label></div>`,d=>api('products',{...d,id,published:d.published==='on',featured_discount:d.featured_discount==='on',image_verified:d.image_verified==='on'}),'Save product');
}

function cardForm(id){
  let c=state.privilege_cards.find(c=>c.id===id)||{};
  modal(id?'Edit privilege card':'Add privilege card',`<div class="formgrid">${field('Card number','number',c.number,'text','required placeholder="e.g. GA-1001"')}${field('Discount percentage','percent',c.percent||0,'number','min="0" max="100" step="0.1" required')}${select('Assigned customer','customer_id',[['','No customer assigned'],...state.customers.map(cu=>[cu.id,cu.name])],c.customer_id)}${field('Expiry date','expires',c.expires||'','date')}<label class="check wide"><input name="active" type="checkbox" ${c.active!==0?'checked':''}>Card active</label></div>`,d=>api('cards',{...d,id,active:d.active==='on'}),'Save privilege card');
}

async function showOrder(id){
  const {order:o,lines,payments,settings:s}=await api('orders/'+id);
  const transitions={New:['Processing','Cancelled'],Processing:['Ready','Cancelled'],Ready:['Completed','Cancelled'],Completed:['Returned']};
  modal('Order GA-'+String(id).padStart(5,'0'),`<div class="invoice"><div class="invoicehead"><div><h1>${esc(s.name)}</h1><p>${esc(s.address)}<br>${esc(s.phone)}${s.gstin?'<br>GSTIN: '+esc(s.gstin):''}</p></div><div><b>${s.gstin?'Tax invoice':'Sales invoice'}</b><p>GA-${String(id).padStart(5,'0')}<br>${date(o.created)}</p></div></div><b>Bill to: ${esc(o.customer_name)}</b><p>${esc(o.phone)}<br>${esc(o.address)}</p>${table(['Item','Qty','Price','Tax','Total'],lines.map(l=>`<tr><td>${esc(l.name)}<small>${esc(l.sku)}</small></td><td>${l.qty}</td><td>${money(l.price)}</td><td>${l.tax_rate}%</td><td>${money(l.total)}</td></tr>`))}<div class="carttotal"><div><span>Subtotal</span><b>${money(o.subtotal)}</b></div><div><span>${o.card_number?`Privilege discount (${o.card_percent}%)`:'Discount'}</span><b>${money(o.discount)}</b></div><div><span>Tax</span><b>${money(o.tax)}</b></div><div class="grand"><span>Total</span><b>${money(o.total)}</b></div><div><span>Paid · ${esc(o.payment)}</span><b>${money(o.paid)}</b></div><div><span>Outstanding</span><b>${money(Math.max(0,o.total-o.paid))}</b></div></div>${o.card_number?`<p>Privilege card: <b>${esc(o.card_number)}</b></p>`:''}<h3>Payments received</h3>${payments.length?table(['Method','Amount','Received','Reference'],payments.map(p=>`<tr><td>${esc(p.method)}</td><td>${money(p.amount)}</td><td>${date(p.created)}</td><td>${esc(p.reference)||'—'}</td></tr>`)):'<p>No payment recorded yet.</p>'}<p>${esc(s.footer)}</p>${o.notes?`<p><strong>Notes:</strong> ${esc(o.notes)}</p>`:''}${['Returned','Cancelled'].includes(o.status)?`<p>${o.status}. Any money previously collected must be refunded separately.</p>`:''}</div><div class="actions noprint">${btn('Print invoice','print')} ${(transitions[o.status]||[]).map(s=>`<button data-action="order-status" data-id="${id}" data-status="${s}">${s==='Returned'?'Return entire order':s==='Cancelled'?'Cancel order':'Mark '+s.toLowerCase()}</button>`).join('')}${o.paid<o.total&&!['Cancelled','Returned'].includes(o.status)?`<button data-action="payment" data-id="${id}" data-due="${(o.total-o.paid)/100}">Collect payment</button>`:''}</div>`,null);
}

function exportCSV(kind){
  let rows=state[kind];
  if(!rows.length) return toast('No records to export');
  const headers=Object.keys(rows[0]);
  const safe=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
  const csv=[headers,...rows.map(r=>headers.map(k=>r[k]))].map(r=>r.map(safe).join(',')).join('\r\n');
  const u=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
  a.href=u; a.download=`guptha-${kind}.csv`; a.click();
  setTimeout(()=>URL.revokeObjectURL(u),1000);
}

document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-action]');
  if(!b)return;
  const a=b.dataset.action,id=Number(b.dataset.id);
  if(a!=='print'&&!b.hasAttribute('href')) e.preventDefault();
  try{
    if(a==='close')return $('#modal').close();
    if(a==='menu'){
      $('.dash-drawer')?.classList.toggle('open');
      return;
    }
    if(a==='logout'){await api('logout',{});state={};cart=[];held=null;appliedCard=null;return start()}
    if(a==='product-new')return productForm();
    if(a==='product-edit')return productForm(id);
    if(a==='inventory-prev'||a==='inventory-next'){
      inventoryPage+=a==='inventory-prev'?-1:1;
      $('#product-table').innerHTML=productTable();
      (document.querySelector(`[data-action="${a}"]:not(:disabled)`)||$('#search'))?.focus();
      return;
    }
    if(a==='card-new'||a==='card-edit')return cardForm(id);
    if(a==='apply-card'){
      b.disabled=true;
      try{
        appliedCard=await api('cards/lookup',{number:$('#privilege-number').value});
        $('#privilege-number').value=appliedCard.number;
        if(appliedCard.customer_id)$('#bill-customer').value=appliedCard.customer_id;
        drawCart();
        toast(`${appliedCard.percent}% privilege discount applied`);
      }finally{b.disabled=false}
      return;
    }
    if(a==='remove-card'){appliedCard=null;$('#privilege-number').value='';$('#discount').value=0;if($('#discount'))$('#discount').disabled=false;return drawCart()}
    if(a==='archive'){if(!confirm('Archive this product? Existing invoices are kept.'))return;await api('products/archive',{id});return refresh()}
    if(a==='stock'){const p=state.products.find(p=>p.id===id);return modal('Adjust stock · '+esc(p.name),`<div class="formgrid">${field('Actual quantity on hand','quantity',p.stock,'number','min="0" step="1" required')}${field('Reason for adjustment','reason','','text','required placeholder="e.g. Physical stock count"')}</div>`,d=>api('stock',{...d,product_id:id}))}
    if(/^(customers|suppliers)-(new|edit)$/.test(a)){const kind=a.split('-')[0],p=state[kind].find(p=>p.id===id)||{};return modal((id?'Edit ':'Add ')+(kind==='customers'?'customer':'supplier'),`<div class="formgrid">${field('Name','name',p.name,'text','required')}${field('Phone','phone',p.phone)}${field('Email','email',p.email,'email')}<label class="wide">Address<textarea name="address">${esc(p.address)}</textarea></label></div>`,d=>api(kind,{...d,id:id||undefined}))}
    if(a==='purchase-new'){if(!state.products.length||!state.suppliers.length)return toast('Add a product and a supplier first.');return modal('Receive a purchase',`<div class="formgrid">${select('Supplier','supplier_id',state.suppliers.map(s=>[s.id,s.name]))}${select('Product','product_id',state.products.map(p=>[p.id,p.name]))}${field('Quantity received','qty',1,'number','min="1" step="1" required')}${field('Unit purchase cost (₹)','cost',0,'number','min="0" step="0.01" required')}${field('Supplier invoice / reference','reference','','text','required')}</div>`,d=>api('purchases',d),'Receive into stock')}
    if(a==='add-cart')return addCart(id);
    if(a==='qty-minus'){cart=cart.map(i=>i.id===id?{...i,qty:i.qty-1}:i).filter(i=>i.qty>0);return drawCart()}
    if(a==='clear-cart'){cart=[];held=null;appliedCard=null;$('#privilege-number').value='';$('#discount').value=0;if($('#discount'))$('#discount').disabled=false;$('#bill-customer').value='';$('#bill-phone').value='';$('#bill-name').value='';$('#bill-name').readOnly=false;$('#customer-lookup').textContent='Enter a mobile number to find a previous customer.';$('#payment').value='Cash';['Cash','UPI','Card'].forEach(method=>$('#pay-'+method).value=0);return drawCart()}
    if(a==='hold'){if(!cart.length)return toast('Add items first');return modal('Hold current bill',field('Bill label','label','','text','required placeholder="Customer name or reference"'),async d=>{await api('holds',{...d,id:held,cart,metadata:{customer_id:$('#bill-customer').value,phone:$('#bill-phone').value,name:$('#bill-name').value,card_number:appliedCard?.number,discount:appliedCard?0:$('#discount').value,payment:$('#payment').value,payments:paymentEntries()}});cart=[];held=null;appliedCard=null;if($('#discount'))$('#discount').disabled=false;await refresh();},'Hold bill')}
    if(a==='holds')return modal('Held bills',state.holds.length?state.holds.map(h=>`<div class="cartline"><span><b>${esc(h.label)}</b><small style="display:block">${date(h.created)}</small></span><div class="actions"><button data-action="resume" data-id="${h.id}">Resume</button><button data-action="delete-hold" data-id="${h.id}">Delete</button></div></div>`).join(''):empty('No held bills','Save a cart to finish billing later.'),null);
    if(a==='resume'){if(cart.length&&!confirm('Replace the current cart with this held bill?'))return;const h=state.holds.find(h=>h.id===id),meta=JSON.parse(h.metadata||'{}');const card=meta.card_number?await api('cards/lookup',{number:meta.card_number}):null;cart=JSON.parse(h.cart);held=id;appliedCard=card;$('#modal').close();$('#bill-customer').value=meta.customer_id||'';$('#bill-phone').value=meta.phone||state.customers.find(c=>c.id===Number(meta.customer_id))?.phone||'';lookupCustomer();if(!customerForMobile($('#bill-phone').value))$('#bill-name').value=meta.name||'';if(card){appliedCard=card;$('#privilege-number').value=card.number}$('#discount').value=meta.discount||0;$('#payment').value=meta.payment||'Cash';(meta.payments||[]).forEach(p=>$('#pay-'+p.method).value=Number(p.amount).toFixed(2));return drawCart()}
    if(a==='delete-hold'){await api('holds',{delete:id});return refresh()}
    if(a==='checkout'){
      if(!cart.length)return toast('Add at least one item');
      b.disabled=true;
      try{
        const discount=appliedCard?0:parseFloat($('#discount')?.value||0);
        const payments=paymentEntries();
        const o=await api('orders',{customer_id:$('#bill-customer').value||undefined,phone:$('#bill-phone').value||undefined,name:$('#bill-name').value||undefined,card_number:appliedCard?.number||undefined,hold_id:held||undefined,cart,discount,payment:$('#payment').value,payments});
        cart=[];held=null;appliedCard=null;await refresh();toast('Sale recorded successfully');return showOrder(o.id);
      }finally{b.disabled=false}
    }
    if(a==='customer-history')return showCustomerHistory(id);
    if(a==='order'){if($('#modal').open)$('#modal').close();return showOrder(id)}
    if(a==='print')return window.print();
    if(a==='order-status'){if(!confirm(`Set this order to ${b.dataset.status}? ${['Returned','Cancelled'].includes(b.dataset.status)?'Stock will be restored. Refund any collected payment separately.':''}`))return;await api('orders/status',{id,status:b.dataset.status});$('#modal').close();await refresh();return toast('Order updated')}
    if(a==='payment'){$('#modal').close();return modal('Record payment received',`<div class="formgrid">${field('Amount (₹)','amount',b.dataset.due,'number',`min="0.01" max="${b.dataset.due}" step="0.01" required`)}${select('Payment method','method',[['Cash','Cash'],['UPI','UPI'],['Card','Card']])}${field('Reference (optional)','reference')}</div>`,d=>api('orders/payment',{...d,id}),'Record payment')}
    if(a.startsWith('export-'))return exportCSV(a.slice(7));

    // --- ATELIER STOREFRONT ACTIONS ---
    if(a==='shop-add'||a==='shop-add-direct'){
      const p=shopData.products.find(p=>p.id===id);
      if(!p) return;
      const totalQty=shopCart.filter(i=>i.id===id).reduce((n,i)=>n+i.qty,0);
      if(totalQty>=p.stock) return toast('No more stock available in studio');
      const item=shopCart.find(i=>i.id===id);
      if(item) item.qty++;
      else shopCart.push({id,qty:1});
      if($('#shop-count')) $('#shop-count').textContent=shopCart.reduce((n,i)=>n+i.qty,0);
      return toast(`Added to your basket · ${p.name}`);
    }

    if(a==='pdp-add'){
      const p=shopData.products.find(p=>p.id===id);
      if(!p) return;
      const selectQty=parseInt($('#pdp-qty')?.value||'1',10);
      const currentQty=shopCart.filter(i=>i.id===id).reduce((n,i)=>n+i.qty,0);
      if(currentQty+selectQty>p.stock) return toast(`Only ${p.stock} available in studio`);
      const existing=shopCart.find(i=>i.id===id);
      if(existing) existing.qty+=selectQty;
      else shopCart.push({id,qty:selectQty});
      if($('#shop-count')) $('#shop-count').textContent=shopCart.reduce((n,i)=>n+i.qty,0);
      return toast(`Added ${selectQty} × ${p.name} to basket!`);
    }

    if(a==='pdp-buynow'){
      const p=shopData.products.find(p=>p.id===id);
      if(!p) return;
      const selectQty=parseInt($('#pdp-qty')?.value||'1',10);
      const existing=shopCart.find(i=>i.id===id);
      if(existing) existing.qty+=selectQty;
      else shopCart.push({id,qty:selectQty});
      location.hash='checkout';
      return renderShop();
    }

    if(a==='shop-cart'){
      if(!shopCart.length){
        location.hash='cart';
        return renderShop();
      }
      location.hash='checkout';
      return renderShop();
    }

    if(a==='shop-qty-plus'){
      const idx=parseInt(b.dataset.idx,10);
      const item=shopCart[idx];
      if(item){
        const p=shopData.products.find(x=>x.id===item.id);
        const totalQty=shopCart.filter(i=>i.id===item.id).reduce((n,i)=>n+i.qty,0);
        if(p && totalQty<p.stock){ item.qty++; renderShop(); }
        else toast('No more stock available in studio');
      }
      return;
    }

    if(a==='shop-qty-minus'){
      const idx=parseInt(b.dataset.idx,10);
      if(shopCart[idx]){
        shopCart[idx].qty--;
        if(shopCart[idx].qty<=0) shopCart.splice(idx,1);
        renderShop();
      }
      return;
    }

    if(a==='shop-remove'){
      const idx=parseInt(b.dataset.idx,10);
      if(!isNaN(idx)&&shopCart[idx]) shopCart.splice(idx,1);
      else shopCart=shopCart.filter(i=>i.id!==id);
      renderShop();
      return toast('Item removed from basket');
    }

    if(a==='shop-cat-filter'){
      shopCategoryFilter=b.dataset.cat||'';
      location.hash='home';
      return renderShop();
    }

    if(a==='back-to-top'){
      window.scrollTo({top:0,behavior:'smooth'});
      return;
    }
  }catch(err){toast(err.message);b.disabled=false}
});

// --- FINE ART ATELIER STOREFRONT ---

function renderShopHeader(s, cartCount){
  const cats=categories();
  return `
  <header class="art-header">
    <div class="art-header-top">
      <a href="/legacy-shop#home" class="art-brand" aria-label="Guptha Arts Home">
        <span class="art-brand-mark">${icon('brush')}</span>
        <div class="art-brand-text">
          <strong>Guptha Arts Atelier</strong>
          <small>FINE ART MATERIALS &bull; EST. VISAKHAPATNAM</small>
        </div>
      </a>

      <div class="art-location-chip">
        ${icon('pin')}
        <div>
          <small>Studio &amp; Dispatch</small>
          <strong>Visakhapatnam, 530002</strong>
        </div>
      </div>

      <div class="art-search-wrap">
        <select id="art-search-cat" aria-label="Search department">
          <option value="">All Mediums</option>
          ${cats.map(c=>`<option value="${esc(c)}" ${shopCategoryFilter===c?'selected':''}>${esc(c)}</option>`).join('')}
        </select>
        <input id="shop-search" type="search" placeholder="Search acrylics, watercolours, linen canvases, brushes..." value="${esc(shopSearchFilter)}" aria-label="Search art materials">
        <button id="art-search-btn" type="button" aria-label="Submit search">
          ${icon('search')}
        </button>
      </div>

      <div class="art-header-tools">
        <a href="/" class="art-owner-link" title="Store Owner Management">
          ${icon('settings')}
          <span>Owner Portal</span>
        </a>

        <button class="art-basket-btn" data-action="shop-cart" aria-label="Basket">
          <span class="art-basket-icon-wrap">
            ${icon('cart')}
            <span id="shop-count" class="art-basket-badge">${cartCount}</span>
          </span>
          <span class="art-basket-title">Basket</span>
        </button>
      </div>
    </div>

    <!-- Atelier Mediums Navigation -->
    <nav class="art-subnav" aria-label="Medium navigation">
      <div class="art-subnav-links">
        <a href="/legacy-shop#home" data-action="shop-cat-filter" data-cat="" class="${!shopCategoryFilter?'active':''}">All Materials</a>
        ${cats.map(c=>`
          <a href="/legacy-shop#home" data-action="shop-cat-filter" data-cat="${esc(c)}" class="${shopCategoryFilter===c?'active':''}">${esc(c)}</a>
        `).join('')}
      </div>
      <div class="art-subnav-guarantee">
        <span>✓ Artist Grade Pigments</span>
        <span>✓ 24hr Local Studio Dispatch</span>
      </div>
    </nav>
  </header>`;
}

function renderHomePage(s){
  let ps=shopData.products||[];
  if(shopSearchFilter){
    ps=ps.filter(p=>(p.name+' '+(p.category||'')+' '+(p.description||'')).toLowerCase().includes(shopSearchFilter.toLowerCase()));
  }
  if(shopCategoryFilter){
    ps=ps.filter(p=>p.category===shopCategoryFilter);
  }

  return `
  <!-- Atelier Hero Inspiration Banner -->
  <section class="art-hero">
    <div class="art-hero-content">
      <span class="art-hero-pill">Guptha Fine Arts Collection</span>
      <h1>A little inspiration.<br>Everything to create.</h1>
      <p>Discover artist-grade materials from Guptha Arts. Hand-inspected, high-pigment watercolours, acrylics, stretched canvases, and precision brushes crafted for mastery.</p>
      <div class="art-hero-features">
        <span>${icon('check')} Same-day Studio Packing</span>
        <span>${icon('check')} Pay on Delivery &amp; UPI</span>
        <span>${icon('check')} 100% Archival Grade Quality</span>
      </div>
    </div>
  </section>

  <!-- Showcase Medium Pillars -->
  <section class="art-pillars-grid" aria-label="Curated mediums">
    <div class="art-pillar-card" data-action="shop-cat-filter" data-cat="Paints & colours">
      <div class="art-pillar-icon" style="background:#f3e8f8">${icon('brush')}</div>
      <h3>Paints &amp; Colours</h3>
      <p>Cobalt, viridian, crimson &amp; titanium white in artist tubes and pan cakes.</p>
      <span class="art-pillar-link">Browse shades &rarr;</span>
    </div>
    <div class="art-pillar-card" data-action="shop-cat-filter" data-cat="Brushes">
      <div class="art-pillar-icon" style="background:#e8f4ed">${icon('brush')}</div>
      <h3>Studio Brushes</h3>
      <p>Hand-formed round and flat hog bristle sets with seamless nickel ferrules.</p>
      <span class="art-pillar-link">Explore sets &rarr;</span>
    </div>
    <div class="art-pillar-card" data-action="shop-cat-filter" data-cat="Canvas & paper">
      <div class="art-pillar-icon" style="background:#fef3e5">${icon('box')}</div>
      <h3>Canvas &amp; Surfaces</h3>
      <p>Triple-gesso primed stretched cotton canvases and cold-pressed 300 GSM pads.</p>
      <span class="art-pillar-link">View canvases &rarr;</span>
    </div>
    <div class="art-pillar-card" data-action="shop-cat-filter" data-cat="Drawing supplies">
      <div class="art-pillar-icon" style="background:#eaf0fb">${icon('brush')}</div>
      <h3>Drawing &amp; Sketching</h3>
      <p>Archival micro-pigment fine liners, hardbound sketchbooks &amp; graphite sets.</p>
      <span class="art-pillar-link">Discover tools &rarr;</span>
    </div>
  </section>

  <!-- Products Catalog Section -->
  <section class="art-catalog-section">
    <div class="art-section-head">
      <div>
        <h2>${shopCategoryFilter?esc(shopCategoryFilter):'Materials for your next masterpiece'}</h2>
        <small class="art-results-count">${ps.length} materials ready for your studio</small>
      </div>
      ${shopCategoryFilter||shopSearchFilter?`
        <button class="art-btn-clear" data-action="shop-cat-filter" data-cat="">
          Clear filters &times;
        </button>
      `:''}
    </div>

    <div class="art-products-grid">
      ${productCards(ps,true)}
    </div>
  </section>`;
}

function renderProductPage(s, pid){
  const p=shopData.products.find(x=>x.id===pid)||shopData.products[0];
  if(!p){
    location.hash='home';
    return renderShop();
  }
  currentPdpId=p.id;
  const finalPrice=Math.round(p.price*(1+p.tax/100));
  const imgSrc=productImgSrc(p);

  return `
  <nav class="art-breadcrumb" aria-label="Breadcrumb">
    <a href="/legacy-shop#home">&larr; Back to collection</a>
    <span class="art-bc-divider">/</span>
    <a href="/legacy-shop#home">Home</a>
    <span class="art-bc-divider">/</span>
    <a href="/legacy-shop#home" data-action="shop-cat-filter" data-cat="${esc(p.category)}">${esc(p.category||'Fine Art Materials')}</a>
    <span class="art-bc-divider">/</span>
    <span class="current">${esc(p.name)}</span>
  </nav>

  <div class="art-pdp-layout">
    <!-- Left: Gallery & Actual Product Photo -->
    <div class="art-pdp-gallery">
      <div class="art-pdp-photo-card">
        <img id="pdp-main-photo" class="art-pdp-img" src="${imgSrc}" alt="${esc(p.name)}">
        <span class="art-pdp-photo-tag">${esc(p.category||'Fine Arts')}</span>
      </div>
      <div class="art-pdp-assurances">
        <span>${icon('check')} 100% Archival Lightfastness</span>
        <span>${icon('check')} Hand-inspected in Visakhapatnam</span>
        <span>${icon('lock')} Studio Protective Packaging</span>
      </div>
    </div>

    <!-- Right: Information, Details & Buy Box (NO COLOR PICKER / SWATCHES!) -->
    <div class="art-pdp-info">
      <div class="art-pdp-category">${esc(p.category||'Studio Supplies')}</div>
      <h1 class="art-pdp-title">${esc(p.name)}</h1>
      <div class="art-pdp-sku">SKU: <b>${esc(p.sku)}</b> &bull; Guptha Fine Arts Studio</div>

      <div class="art-pdp-price-wrap">
        <span class="art-pdp-price">${money(finalPrice)}</span>
        <span class="art-pdp-tax-note">All taxes included</span>
      </div>

      <p class="art-pdp-description">${esc(p.description)}</p>

      <!-- Specifications Table -->
      <div class="art-specs-card">
        <h3>Material Specifications</h3>
        <div class="art-specs-grid">
          <div><small>Medium</small><strong>${esc(p.category||'Fine Arts')}</strong></div>
          <div><small>Quality Grade</small><strong>Professional Artist Grade</strong></div>
          <div><small>Lightfastness</small><strong>ASTM I (Excellent)</strong></div>
          <div><small>Dispatched from</small><strong>Visakhapatnam Atelier</strong></div>
        </div>
      </div>

      <!-- Studio Buy Box -->
      <div class="art-buybox">
        <div class="art-buybox-status ${p.stock<=p.reorder?'low':'ok'}">
          ${p.stock<1?'Currently out of stock':p.stock<=p.reorder?`Low Stock: Only ${p.stock} units available in studio`:`In Stock · ${p.stock} units available at studio`}
        </div>

        <div class="art-buybox-row">
          <div class="art-qty-selector">
            <label for="pdp-qty">Quantity:</label>
            <select id="pdp-qty" aria-label="Select quantity" ${p.stock<1?'disabled':''}>
              ${Array.from({length:Math.min(10,p.stock||1)},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="art-buybox-buttons">
          <button type="button" class="art-btn-primary" data-action="pdp-add" data-id="${p.id}" ${p.stock<1?'disabled':''}>
            ${icon('cart')} Add to Basket
          </button>
          <button type="button" class="art-btn-secondary" data-action="pdp-buynow" data-id="${p.id}" ${p.stock<1?'disabled':''}>
            Direct Checkout &rarr;
          </button>
        </div>
        <p class="art-buybox-hint">Free delivery across Visakhapatnam on orders over ₹499. Pay on Delivery available.</p>
      </div>
    </div>
  </div>`;
}

function renderCartPage(s){
  const count=shopCart.reduce((n,i)=>n+i.qty,0);
  const subtotal=shopCart.reduce((n,i)=>{
    const p=shopData.products.find(x=>x.id===i.id);
    return n+(p?Math.round(p.price*(1+p.tax/100))*i.qty:0);
  },0);

  if(!shopCart.length){
    return `<div class="art-empty-wrap">
      <div class="art-empty-card">
        <h2>Your Studio Basket is empty</h2>
        <p>Explore our collection of artist watercolours, acrylics, canvas boards, and sketching supplies.</p>
        <a href="/legacy-shop#home" class="art-btn-primary" style="display:inline-block;padding:12px 28px;text-decoration:none;margin-top:16px">Browse Catalog</a>
      </div>
    </div>`;
  }

  return `
  <div class="art-cart-layout">
    <div class="art-cart-main">
      <div class="art-cart-head">
        <h1>Your Studio Basket</h1>
        <span>${count} item${count>1?'s':''}</span>
      </div>

      <div class="art-cart-list">
        ${shopCart.map((item,idx)=>{
          const p=shopData.products.find(x=>x.id===item.id);
          if(!p) return '';
          const unitPrice=Math.round(p.price*(1+p.tax/100));
          const linePrice=unitPrice*item.qty;

          return `<div class="art-cart-item">
            <img class="art-cart-thumb" src="${productImgSrc(p)}" alt="${esc(p.name)}">
            <div class="art-cart-detail">
              <h3><a href="#product-${p.id}">${esc(p.name)}</a></h3>
              <div class="art-cart-sku">SKU: ${esc(p.sku)} &bull; ${esc(p.category)}</div>
              <div class="art-cart-actions">
                <div class="art-stepper">
                  <button type="button" data-action="shop-qty-minus" data-idx="${idx}" aria-label="Decrease quantity">−</button>
                  <span>${item.qty}</span>
                  <button type="button" data-action="shop-qty-plus" data-idx="${idx}" aria-label="Increase quantity">+</button>
                </div>
                <button type="button" class="art-remove-btn" data-action="shop-remove" data-idx="${idx}">Remove</button>
              </div>
            </div>
            <div class="art-cart-line-price">
              <strong>${money(linePrice)}</strong>
              <small>${money(unitPrice)} each</small>
            </div>
          </div>`;
        }).join('')}
      </div>

      <div class="art-cart-subtotal-bar">
        <span>Subtotal (${count} items):</span>
        <strong>${money(subtotal)}</strong>
      </div>
    </div>

    <!-- Side Order Summary Box -->
    <aside class="art-cart-side">
      <div class="art-side-card">
        <h3>Order Summary</h3>
        <div class="art-side-row">
          <span>Items (${count}):</span>
          <b>${money(subtotal)}</b>
        </div>
        <div class="art-side-row">
          <span>Local Studio Delivery:</span>
          <b style="color:#059669">FREE</b>
        </div>
        <div class="art-side-divider"></div>
        <div class="art-side-total">
          <span>Total:</span>
          <strong>${money(subtotal)}</strong>
        </div>
        <a href="#checkout" class="art-btn-primary full" style="display:block;text-align:center;padding:14px;text-decoration:none;margin-top:18px">
          Proceed to Checkout &rarr;
        </a>
        <p class="hint" style="text-align:center;margin-top:10px">Pay conveniently on delivery or via UPI.</p>
      </div>
    </aside>
  </div>`;
}

function renderCheckoutPage(s){
  const count=shopCart.reduce((n,i)=>n+i.qty,0);
  const subtotal=shopCart.reduce((n,i)=>{
    const p=shopData.products.find(x=>x.id===i.id);
    return n+(p?Math.round(p.price*(1+p.tax/100))*i.qty:0);
  },0);

  if(!shopCart.length){
    return `<div class="art-empty-wrap">
      <div class="art-empty-card">
        <h2>Your basket is empty</h2>
        <p>Add art materials to your basket before checking out.</p>
        <a href="/legacy-shop#home" class="art-btn-primary" style="display:inline-block;padding:12px 28px;text-decoration:none;margin-top:16px">Explore Art Supplies</a>
      </div>
    </div>`;
  }

  return `
  <div class="art-checkout-wrapper">
    <div class="art-checkout-head">
      <a href="/legacy-shop#home" class="art-checkout-back">&larr; Return to Studio Store</a>
      <h1>Studio Checkout (${count} item${count>1?'s':''})</h1>
      <span class="art-secure-badge">${icon('lock')} Encrypted Checkout</span>
    </div>

    <form id="shop-checkout-form" class="art-checkout-grid">
      <!-- Left Column: Customer details -->
      <div class="art-checkout-form-pane">
        <section class="art-checkout-section">
          <h2>1. Customer &amp; Delivery Details</h2>
          <div class="art-form-fields">
            <div class="art-field">
              <label for="shop-name">Your name</label>
              <input id="shop-name" name="name" type="text" required placeholder="Full Name">
            </div>
            <div class="art-field">
              <label for="shop-phone">Phone</label>
              <input id="shop-phone" name="phone" type="tel" required minlength="10" placeholder="10-digit mobile number">
            </div>
            <div class="art-field wide">
              <label for="shop-address">Delivery address or pickup instructions</label>
              <textarea id="shop-address" name="address" required placeholder="Studio address, street, landmark, or specify store pickup"></textarea>
            </div>
          </div>
        </section>

        <section class="art-checkout-section">
          <h2>2. Payment Method</h2>
          <div class="art-payment-option selected">
            <input type="radio" name="payment_choice" value="Pay on Delivery" checked id="pay-pod">
            <label for="pay-pod">
              <strong>Pay on Delivery / In-Store Collection</strong>
              <small>Pay with Cash or any UPI App (GPay, PhonePe, Paytm) when your materials arrive.</small>
            </label>
          </div>
        </section>
      </div>

      <!-- Right Column: Order Summary & Action -->
      <aside class="art-checkout-side">
        <div class="art-side-card">
          <h3>Items in Order</h3>
          <div class="art-checkout-items-list">
            ${shopCart.map(i=>{
              const p=shopData.products.find(x=>x.id===i.id);
              if(!p) return '';
              const unitPrice=Math.round(p.price*(1+p.tax/100));
              return `<div class="art-checkout-item-line">
                <img src="${productImgSrc(p)}" alt="${esc(p.name)}">
                <div>
                  <strong>${esc(p.name)}</strong>
                  <small>${i.qty} &times; ${money(unitPrice)}</small>
                </div>
                <b>${money(unitPrice*i.qty)}</b>
              </div>`;
            }).join('')}
          </div>

          <div class="art-side-divider"></div>
          <div class="art-side-row">
            <span>Subtotal:</span>
            <b>${money(subtotal)}</b>
          </div>
          <div class="art-side-row">
            <span>Studio Delivery:</span>
            <b style="color:#059669">FREE</b>
          </div>
          <div class="art-side-total">
            <span>Total Payable:</span>
            <strong>${money(subtotal)}</strong>
          </div>

          <button type="submit" id="shop-submit-btn" class="art-btn-primary full" style="margin-top:20px;padding:15px;font-size:16px">
            Place order · pay later
          </button>
          <div class="art-checkout-guarantee">
            Hand-dispatched from Guptha Arts Atelier, Visakhapatnam.
          </div>
        </div>
      </aside>
    </form>
  </div>`;
}

function renderOrderSuccessPage(s){
  const o=lastPlacedOrder||{id:1,total:0,name:'Valued Customer',address:'Visakhapatnam',items:[]};

  return `
  <div class="art-success-wrapper">
    <div class="art-success-card">
      <div class="art-success-icon-wrap">${icon('check')}</div>
      <h1>Order placed</h1>
      <p class="art-success-subtitle">Thank you, ${esc(o.name)}! Your order has been registered at Guptha Arts Atelier.</p>
      <div class="art-success-order-num">Order Reference: <strong># GA-${String(o.id).padStart(5,'0')}</strong></div>

      <div class="art-success-grid">
        <div class="art-success-box">
          <h3>Delivery Details</h3>
          <p><strong>Customer:</strong> ${esc(o.name)}</p>
          <p><strong>Address:</strong> ${esc(o.address)}</p>
          ${o.phone?`<p><strong>Phone:</strong> ${esc(o.phone)}</p>`:''}
          <p><strong>Dispatch:</strong> Same-day dispatch from Visakhapatnam</p>
        </div>
        <div class="art-success-box">
          <h3>Payment</h3>
          <p><strong>Method:</strong> Pay on Delivery (Cash or UPI)</p>
          <p><strong>Total Amount:</strong> <strong style="font-size:20px;color:#c24b27">${money(o.total)}</strong></p>
          <p class="hint">Keep your cash or UPI app handy when your art supplies arrive.</p>
        </div>
      </div>

      <div class="art-success-actions">
        <a href="/legacy-shop#home" class="art-btn-primary" style="display:inline-block;padding:12px 28px;text-decoration:none">
          Continue Browsing
        </a>
        <a href="/" class="art-btn-secondary" style="display:inline-block;padding:12px 20px;text-decoration:none">
          Store Owner Portal &rarr;
        </a>
      </div>
    </div>
  </div>`;
}

function renderShopFooter(s){
  return `
  <footer class="art-footer">
    <div class="art-footer-inner">
      <div class="art-footer-col">
        <h3>Guptha Arts Atelier</h3>
        <p>Premium fine art materials, pigments, brushes and archival surfaces for artists and creators in Visakhapatnam.</p>
      </div>
      <div class="art-footer-col">
        <h4>Mediums</h4>
        <a href="/legacy-shop#home" data-action="shop-cat-filter" data-cat="Paints & colours">Paints &amp; Colours</a>
        <a href="/legacy-shop#home" data-action="shop-cat-filter" data-cat="Brushes">Studio Brushes</a>
        <a href="/legacy-shop#home" data-action="shop-cat-filter" data-cat="Canvas & paper">Canvas &amp; Paper</a>
        <a href="/legacy-shop#home" data-action="shop-cat-filter" data-cat="Drawing supplies">Drawing Supplies</a>
      </div>
      <div class="art-footer-col">
        <h4>Studio Location</h4>
        <p>Visakhapatnam, Andhra Pradesh 530002</p>
        <p>Phone: +91 79814 56043</p>
        <p>Open Monday - Saturday: 9:00 AM - 8:30 PM</p>
      </div>
    </div>
    <div class="art-footer-bottom">
      &copy; ${new Date().getFullYear()} Guptha Arts Atelier. All rights reserved.
    </div>
  </footer>`;
}

function renderShop(){
  const s=shopData.settings||{};
  const count=shopCart.reduce((n,i)=>n+i.qty,0);
  const rawHash=location.hash.slice(1)||'home';

  let pageHtml='';
  if(rawHash==='home'||rawHash===''){
    pageHtml=renderHomePage(s);
  } else if(rawHash==='cart'){
    pageHtml=renderCartPage(s);
  } else if(rawHash==='checkout'){
    pageHtml=renderCheckoutPage(s);
  } else if(rawHash==='order-success'){
    pageHtml=renderOrderSuccessPage(s);
  } else if(rawHash.startsWith('product-')){
    const pid=parseInt(rawHash.split('-')[1],10);
    pageHtml=renderProductPage(s,pid);
  } else {
    pageHtml=renderHomePage(s);
  }

  $('#app').innerHTML=`
  <div class="art-shell">
    ${renderShopHeader(s,count)}
    <main class="art-main">
      ${pageHtml}
    </main>
    ${renderShopFooter(s)}
  </div>`;

  bindShopEvents();
}

function bindShopEvents(){
  const searchInput=$('#shop-search');
  const searchCat=$('#art-search-cat');
  const searchBtn=$('#art-search-btn');

  if(searchInput){
    searchInput.onkeydown=e=>{
      if(e.key==='Enter'){
        shopSearchFilter=searchInput.value.trim();
        location.hash='home';
        renderShop();
      }
    };
  }
  if(searchCat){
    searchCat.onchange=()=>{
      shopCategoryFilter=searchCat.value;
      location.hash='home';
      renderShop();
    };
  }
  if(searchBtn){
    searchBtn.onclick=()=>{
      shopSearchFilter=searchInput?searchInput.value.trim():'';
      if(searchCat) shopCategoryFilter=searchCat.value;
      location.hash='home';
      renderShop();
    };
  }

  const checkoutForm=$('#shop-checkout-form');
  if(checkoutForm){
    checkoutForm.onsubmit=async e=>{
      e.preventDefault();
      const submitBtn=$('#shop-submit-btn');
      if(submitBtn) submitBtn.disabled=true;
      try{
        const fd=new FormData(checkoutForm);
        const name=fd.get('name');
        const phone=fd.get('phone');
        const address=fd.get('address');
        const res=await api('shop/order',{
          name, phone, address,
          cart: shopCart
        });
        lastPlacedOrder={
          id: res.id,
          name, phone, address,
          total: res.total,
          items: shopCart.map(i=>{
            const p=shopData.products.find(x=>x.id===i.id);
            return {name: p?.name||'Art material', qty: i.qty};
          })
        };
        shopCart=[];
        location.hash='order-success';
        renderShop();
      }catch(err){
        toast(err.message,'warn');
        if(submitBtn) submitBtn.disabled=false;
      }
    };
  }
}

window.addEventListener('hashchange',()=>{
  if(shopMode) renderShop();
  else render();
});

async function start(){
  const s=await api('session');
  if(!s.authenticated&&!shopMode){
    if(s.setup) return setupPage();
    return authPage();
  }
  await refresh();
}

function authPage(){
  $('#app').innerHTML=`
  <div class="authshell">
    <div class="authintro">
      <div class="brand">
        <span class="mark">g.</span>
        <div>Guptha Arts<small>STORE OWNER ACCESS</small></div>
      </div>
      <h1>Manage your store</h1>
      <p>Sign in to your private retail workspace to manage billing, inventory, customer cards, and orders.</p>
    </div>
    <div class="authcard">
      <h2>Store owner sign in</h2>
      <form id="auth-form">
        <label>Owner email
          <input name="email" type="email" required autocomplete="username" placeholder="owner@gupthaarts.com">
        </label>
        <label>Password
          <input name="password" type="password" required autocomplete="current-password" placeholder="••••••••••">
        </label>
        <div class="formerror" role="alert"></div>
        <button class="primary full" style="margin-top:20px">Open your store</button>
      </form>
      <div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:16px;text-align:center">
        <a href="/shop" style="color:#64748b;font-size:13px;text-decoration:none">Looking for the customer store? Visit storefront &rarr;</a>
      </div>
    </div>
  </div>`;

  $('#auth-form').onsubmit=async e=>{
    e.preventDefault();
    const btn=e.target.querySelector('button');
    btn.disabled=true;
    try{
      await api('login',Object.fromEntries(new FormData(e.target)));
      await start();
    }catch(err){
      $('#auth-form .formerror').textContent=err.message;
    }finally{
      btn.disabled=false;
    }
  };
}

function setupPage(){
  $('#app').innerHTML=`
  <div class="authshell">
    <div class="authintro">
      <div class="brand">
        <span class="mark">g.</span>
        <div>Guptha Arts<small>INITIAL SETUP</small></div>
      </div>
      <h1>Set up your store</h1>
      <p>Create your private store owner credentials. These remain stored securely on your local server.</p>
    </div>
    <div class="authcard">
      <h2>Create owner account</h2>
      <form id="setup-form">
        <label>Owner email
          <input name="email" type="email" required autocomplete="username" placeholder="owner@gupthaarts.com">
        </label>
        <label>Password
          <input name="password" type="password" required minlength="10" autocomplete="new-password">
        </label>
        <div class="formerror" role="alert"></div>
        <button class="primary full" style="margin-top:20px">Create my workspace</button>
      </form>
    </div>
  </div>`;

  $('#setup-form').onsubmit=async e=>{
    e.preventDefault();
    const btn=e.target.querySelector('button');
    btn.disabled=true;
    try{
      await api('setup',Object.fromEntries(new FormData(e.target)));
      await start();
    }catch(err){
      $('#setup-form .formerror').textContent=err.message;
    }finally{
      btn.disabled=false;
    }
  };
}

start();
