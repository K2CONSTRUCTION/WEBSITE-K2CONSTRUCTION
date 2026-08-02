// ===== K2 Smart Invoice v2 — fully self-contained, source Claude owns =====
(function(){
'use strict';

// ---------- Storage helpers ----------
function load(key, fallback){
  try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch(e){ return fallback; }
}
function save(key, val){ try { localStorage.setItem(key, JSON.stringify(val)); } catch(e){} }
function uid(prefix){ return prefix + '-' + Date.now() + '-' + Math.floor(Math.random()*1000); }
function fmt(n){ n = Number(n)||0; return n.toLocaleString(undefined,{maximumFractionDigits:2}); }
function todayStr(){ return new Date().toISOString().slice(0,10); }

// ---------- State ----------
var state = {
  screen: 'home',
  dashTab: 'overview',
  editingInvoiceId: null,
  editingItemId: null, // invoice line item builder
  editingInventoryId: null,
  editingProjectId: null,
  invoiceDraftItems: []
};

var DB = {
  invoices: load('k2inv-invoices', []),
  expenses: load('k2inv-expenses', []),
  inventory: load('k2inv-inventory', []),
  projects: load('k2inv-projects', []),
  scans: load('k2inv-scans', []),
  profile: load('k2inv-profile', { nameKm: 'សូមស្វាគមន៍', nameEn: 'K2 Team', company: 'K2-CONSTRUCTION' })
};
function persist(key){ save('k2inv-' + key, DB[key]); }

function toast(msg){
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 1800);
}

// ---------- Icons (tiny inline SVGs) ----------
var ICONS = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 12l4-4M12 3v3M21 12h-3M12 21v-3M3 12h3"/></svg>',
  invoice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2h9l3 3v17H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M3 4h2l2.4 11.5a2 2 0 002 1.5h7.2a2 2 0 002-1.6L21 8H6"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2h9l3 3v17H6z"/><path d="M12 17V9M9 12l3-3 3 3"/></svg>',
  archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8M10 12h4"/></svg>',
  briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 12h18"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>'
};

// ---------- Router ----------
function go(screen){ state.screen = screen; render(); }

function render(){
  var app = document.getElementById('app');
  var html = '';
  switch(state.screen){
    case 'home': html = renderHome(); break;
    case 'dashboard': html = renderDashboard(); break;
    case 'invoices': html = renderInvoices(); break;
    case 'invoiceForm': html = renderInvoiceForm(); break;
    case 'inventory': html = renderInventory(); break;
    case 'projects': html = renderProjects(); break;
    case 'scan': html = renderScan(); break;
    case 'archive': html = renderArchive(); break;
    default: html = renderHome();
  }
  app.innerHTML = html;
  afterRender();
}

// ---------- HOME ----------
function renderHome(){
  var p = DB.profile;
  var initials = (p.nameEn||'K2').split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();
  var tiles = [
    {icon:'dashboard', label:'ផ្ទាំងគ្រប់គ្រង', screen:'dashboard'},
    {icon:'invoice', label:'វិក្កយបត្រ', screen:'invoices'},
    {icon:'cart', label:'កម្ចង់ទំនិញ', screen:'inventory'},
    {icon:'upload', label:'ផ្ទុករូបបញ្ជាន់ដៃ', screen:'scan'},
    {icon:'archive', label:'ឯកសារចាស់', screen:'archive'},
    {icon:'briefcase', label:'គម្រោង', screen:'projects'}
  ];
  return (
    '<div class="screen active">' +
      '<div class="home-header">' +
        '<div class="home-header-top">' +
          '<button class="icon-btn" data-nav="home">☰</button>' +
          '<div style="display:flex;gap:8px;">' +
            '<button class="icon-btn">🔍</button>' +
            '<button class="icon-btn">⚙️</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="profile-card">' +
        '<div class="avatar">' + initials + '</div>' +
        '<div><div class="profile-name-km">' + p.nameKm + '</div><div class="profile-name-en">' + p.nameEn + '</div></div>' +
      '</div>' +
      '<div class="company-pill"><span>🔗 ' + p.company + '</span><span>' + ICONS.chevron + '</span></div>' +
      '<div class="icon-grid">' +
        tiles.map(function(t){
          return '<button class="icon-tile" data-nav="' + t.screen + '"><span class="ic">' + ICONS[t.icon] + '</span><span class="lbl">' + t.label + '</span></button>';
        }).join('') +
      '</div>' +
      '<button class="fab" data-nav="scan">' + ICONS.camera + '</button>' +
    '</div>'
  );
}

// ---------- DASHBOARD ----------
function computeDashboardData(){
  var invoices = DB.invoices;
  var expenses = DB.expenses;
  var totalInvoices = invoices.length;
  var unpaid = invoices.filter(function(i){return i.status==='unpaid';}).length;
  var overdue = invoices.filter(function(i){return i.status==='overdue';}).length;
  var paid = invoices.filter(function(i){return i.status==='paid';}).length;
  var income = invoices.reduce(function(a,i){ return a + invoiceTotal(i); }, 0);
  var expenseTotal = expenses.reduce(function(a,e){return a+Number(e.amount||0);},0);
  return { totalInvoices, unpaid, overdue, paid, income, expenseTotal };
}
function invoiceTotal(inv){
  var subtotal = (inv.items||[]).reduce(function(a,it){ return a + (Number(it.qty)||0)*(Number(it.price)||0); },0);
  var afterDiscount = subtotal - (subtotal * (Number(inv.discount)||0)/100);
  var withVat = afterDiscount + (afterDiscount * (Number(inv.vat)||0)/100);
  return withVat;
}

function renderDashboard(){
  var d = computeDashboardData();
  var tabs = [
    {key:'overview', label:'ធម្មតា'},
    {key:'analysis', label:'វិភាគទិន្នន័យ'},
    {key:'sales', label:'ម៉ែត្រការលក់'},
    {key:'kpi', label:'KPI ជំនួយ'}
  ];
  var recent = DB.invoices.slice(-3).reverse();
  return (
    '<div class="screen active">' +
      '<div class="topbar">' +
        '<div class="topbar-row">' +
          '<button class="topbar-back" data-nav="home">' + ICONS.back + '</button>' +
          '<div class="topbar-actions"><span class="topbar-chip">$</span><span class="topbar-chip">🌐 EN</span></div>' +
        '</div>' +
        '<div class="topbar-title">ផ្ទាំងគ្រប់គ្រង</div>' +
      '</div>' +
      '<div class="content">' +
        '<div class="segtabs">' +
          tabs.map(function(t){ return '<button class="segtab' + (state.dashTab===t.key?' active':'') + '" data-dashtab="' + t.key + '">' + t.label + '</button>'; }).join('') +
        '</div>' +

        '<div class="subview' + (state.dashTab==='overview'?' active':'') + '" data-subview="overview">' +
          '<div class="card"><div class="lbl-sm">វិក្កយបត្រមិនទាន់ទូទាត់</div><div class="val-lg expense">' + d.unpaid + '</div></div>' +
          '<div class="card"><div class="lbl-sm">កម្ចង់រង់ចាំ</div><div class="val-lg" style="color:#d97706;">' + d.overdue + '</div></div>' +
          '<div class="card"><div class="lbl-sm">ចំណូលសរុប</div><div class="val-lg income">$' + fmt(d.income) + '</div></div>' +
          '<div class="card"><div class="lbl-sm">សកម្មភាពថ្មីៗ</div>' +
            (recent.length ? recent.map(function(r){
              return '<div class="list-row"><div><div class="name">វិក្កយបត្រលេខ ' + (r.number||'-') + '</div><div class="sub">អតិថិជន — ' + (r.client||'-') + '</div></div>' + statusBadge(r.status) + '</div>';
            }).join('') : '<div class="empty-msg">មិនទាន់មានវិក្កយបត្រទេ</div>') +
          '</div>' +
        '</div>' +

        '<div class="subview' + (state.dashTab==='analysis'?' active':'') + '" data-subview="analysis">' +
          '<div class="card-dark"><div class="lbl-sm">វិក្កយបត្របូកសរុប</div><div class="val-lg" style="color:#fff;">' + d.totalInvoices + '</div>' +
            '<div class="chart-wrap"><canvas id="chartWeekly"></canvas></div></div>' +
          '<div class="grid2">' +
            '<div class="card-dark"><div class="lbl-sm">បានទូទាត់</div><div class="val-lg" style="color:#4ade80;">' + Math.round(d.totalInvoices? d.paid/d.totalInvoices*100:0) + '%</div></div>' +
            '<div class="card-dark"><div class="lbl-sm">មិនទាន់ទូទាត់</div><div class="val-lg" style="color:#f87171;">' + d.unpaid + '</div></div>' +
          '</div>' +
        '</div>' +

        '<div class="subview' + (state.dashTab==='sales'?' active':'') + '" data-subview="sales">' +
          '<div class="card-dark"><div class="lbl-sm">Gross Sales</div><div class="val-lg" style="color:#38bdf8;">$' + fmt(d.income) + '</div>' +
            '<div class="chart-wrap" style="height:170px;"><canvas id="chartGauge"></canvas></div></div>' +
          '<div class="card-dark"><div class="lbl-sm">សរុបកម្ចង់ (Total Orders)</div><div class="val-lg" style="color:#fff;">' + d.totalInvoices + '</div></div>' +
          '<div class="card-dark"><div class="lbl-sm">Funnel — Invoice Status</div><div class="chart-wrap"><canvas id="chartFunnel"></canvas></div></div>' +
        '</div>' +

        '<div class="subview' + (state.dashTab==='kpi'?' active':'') + '" data-subview="kpi">' +
          renderKpiTab() +
        '</div>' +
      '</div>' +
      renderBottomNav('dashboard') +
    '</div>'
  );
}
function renderKpiTab(){
  var projects = DB.projects;
  var totalBudget = projects.reduce(function(a,p){return a+Number(p.budget||0);},0);
  var totalSpent = projects.reduce(function(a,p){return a+Number(p.spent||0);},0);
  var completed = projects.filter(function(p){return p.status==='completed';}).length;
  var completionRate = projects.length ? Math.round(completed/projects.length*100) : 0;
  var budgetUsage = totalBudget ? Math.round(totalSpent/totalBudget*100) : 0;
  var onTime = projects.filter(function(p){ return p.status==='completed' && p.dueDate && p.dueDate >= todayStr(); }).length;
  return (
    '<div class="card"><div class="lbl-sm">អត្រាបញ្ចប់គម្រោង (Completion Rate)</div><div class="val-lg income">' + completionRate + '%</div></div>' +
    '<div class="kpi-grid">' +
      '<div class="card"><div class="lbl-sm">ការប្រើប្រាស់ថវិកា</div><div class="chart-wrap" style="height:110px;"><canvas id="chartKpi1"></canvas></div></div>' +
      '<div class="card"><div class="lbl-sm">គម្រោងបានបញ្ចប់</div><div class="chart-wrap" style="height:110px;"><canvas id="chartKpi2"></canvas></div></div>' +
    '</div>' +
    '<div class="card"><div class="lbl-sm">សង្ខេបគម្រោង</div>' +
      (projects.length ? projects.slice(0,5).map(function(p){
        return '<div class="satisfaction-row"><span>' + p.name + '</span><b style="color:' + (p.status==='completed'?'#16a34a':p.status==='in-progress'?'#d97706':'#64748b') + ';">' + projectStatusLabel(p.status) + '</b></div>';
      }).join('') : '<div class="empty-msg">មិនទាន់មានគម្រោងទេ</div>') +
    '</div>'
  );
}
function statusBadge(status){
  var cls = status==='paid' ? 'paid' : status==='overdue' ? 'overdue' : 'unpaid';
  var text = status==='paid' ? 'បានទូទាត់' : status==='overdue' ? 'ហួសកំណត់' : 'មិនទាន់ទូទាត់';
  return '<span class="badge ' + cls + '">' + text + '</span>';
}
function projectStatusLabel(s){
  return s==='completed' ? 'បញ្ចប់' : s==='in-progress' ? 'កំពុងធ្វើ' : 'គម្រោង';
}

function renderCharts(){
  if (typeof Chart === 'undefined') return;
  var d = computeDashboardData();
  ['chartWeekly','chartGauge','chartFunnel','chartKpi1','chartKpi2'].forEach(function(id){
    if (window['_c_'+id]) { window['_c_'+id].destroy(); window['_c_'+id] = null; }
  });

  var weeklyCanvas = document.getElementById('chartWeekly');
  if (weeklyCanvas){
    var days = ['S','M','T','W','T','F','S'];
    var counts = [0,0,0,0,0,0,0];
    DB.invoices.forEach(function(inv){
      if (!inv.date) return;
      var dow = new Date(inv.date + 'T00:00:00').getDay();
      counts[dow]++;
    });
    window._c_chartWeekly = new Chart(weeklyCanvas.getContext('2d'), {
      type:'bar',
      data:{ labels:days, datasets:[{ data:counts, backgroundColor:'rgba(74,222,128,.8)', borderRadius:6, maxBarThickness:28 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
        scales:{ x:{ticks:{color:'#94a3b8'},grid:{display:false}}, y:{ticks:{color:'#94a3b8'},grid:{color:'rgba(255,255,255,.06)'},beginAtZero:true} } }
    });
  }

  var gaugeCanvas = document.getElementById('chartGauge');
  if (gaugeCanvas){
    var paidPct = d.totalInvoices ? Math.round(d.paid/d.totalInvoices*100) : 0;
    window._c_chartGauge = new Chart(gaugeCanvas.getContext('2d'), {
      type:'doughnut',
      data:{ labels:['បានទូទាត់','នៅសល់'], datasets:[{ data:[paidPct, 100-paidPct], backgroundColor:['#38bdf8','#1e293b'], borderWidth:0 }] },
      options:{ responsive:true, maintainAspectRatio:false, circumference:180, rotation:270, cutout:'72%',
        plugins:{ legend:{display:false} } }
    });
  }

  var funnelCanvas = document.getElementById('chartFunnel');
  if (funnelCanvas){
    window._c_chartFunnel = new Chart(funnelCanvas.getContext('2d'), {
      type:'bar',
      data:{ labels:['សរុប','បានទូទាត់','មិនទាន់ទូទាត់','ហួសកំណត់'],
        datasets:[{ data:[d.totalInvoices, d.paid, d.unpaid, d.overdue], backgroundColor:['#a78bfa','#4ade80','#facc15','#f87171'], borderRadius:6 }] },
      options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
        scales:{ x:{ticks:{color:'#94a3b8'},grid:{color:'rgba(255,255,255,.06)'},beginAtZero:true}, y:{ticks:{color:'#94a3b8'},grid:{display:false}} } }
    });
  }

  var projects = DB.projects;
  var totalBudget = projects.reduce(function(a,p){return a+Number(p.budget||0);},0);
  var totalSpent = projects.reduce(function(a,p){return a+Number(p.spent||0);},0);
  var budgetUsage = totalBudget ? Math.min(100, Math.round(totalSpent/totalBudget*100)) : 0;
  var kpi1 = document.getElementById('chartKpi1');
  if (kpi1){
    window._c_chartKpi1 = new Chart(kpi1.getContext('2d'), {
      type:'doughnut',
      data:{ datasets:[{ data:[budgetUsage, 100-budgetUsage], backgroundColor:['#f59e0b','#e2e8f0'], borderWidth:0 }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'70%', plugins:{legend:{display:false}} }
    });
  }
  var completed = projects.filter(function(p){return p.status==='completed';}).length;
  var completionRate = projects.length ? Math.round(completed/projects.length*100) : 0;
  var kpi2 = document.getElementById('chartKpi2');
  if (kpi2){
    window._c_chartKpi2 = new Chart(kpi2.getContext('2d'), {
      type:'doughnut',
      data:{ datasets:[{ data:[completionRate, 100-completionRate], backgroundColor:['#22c55e','#e2e8f0'], borderWidth:0 }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'70%', plugins:{legend:{display:false}} }
    });
  }
}

// ---------- BOTTOM NAV ----------
function renderBottomNav(active){
  var items = [
    {key:'home', icon:'home', label:'ដើម'},
    {key:'dashboard', icon:'dashboard', label:'ផ្ទាំង'},
    {key:'invoices', icon:'invoice', label:'វិក្កយបត្រ'},
    {key:'archive', icon:'archive', label:'ឯកសារ'}
  ];
  return '<div class="bottomnav">' + items.map(function(it){
    return '<button class="' + (active===it.key?'active':'') + '" data-nav="' + it.key + '">' + ICONS[it.icon] + '<span>' + it.label + '</span></button>';
  }).join('') + '</div>';
}

// ---------- INVOICES ----------
function renderInvoices(){
  var list = DB.invoices.slice().reverse();
  return (
    '<div class="screen active">' +
      '<div class="topbar"><div class="topbar-row"><button class="topbar-back" data-nav="home">' + ICONS.back + '</button></div><div class="topbar-title">វិក្កយបត្រ</div></div>' +
      '<div class="content">' +
        '<button class="btn block" style="margin-bottom:14px;" data-action="newInvoice">' + ICONS.plus + ' បង្កើតវិក្កយបត្រថ្មី</button>' +
        '<div class="card">' +
          (list.length ? list.map(function(inv){
            return '<div class="list-row"><div style="cursor:pointer;flex:1;" data-action="editInvoice" data-id="' + inv.id + '">' +
              '<div class="name">' + inv.number + ' — ' + (inv.client||'N/A') + '</div>' +
              '<div class="sub">' + (inv.date||'-') + ' · $' + fmt(invoiceTotal(inv)) + '</div></div>' +
              statusBadge(inv.status) +
              '<button class="del-btn" data-action="delInvoice" data-id="' + inv.id + '" style="margin-left:10px;">✕</button></div>';
          }).join('') : '<div class="empty-msg">មិនទាន់មានវិក្កយបត្រទេ</div>') +
        '</div>' +
      '</div>' +
      renderBottomNav('invoices') +
    '</div>'
  );
}

function renderInvoiceForm(){
  var editing = state.editingInvoiceId ? DB.invoices.find(function(i){return i.id===state.editingInvoiceId;}) : null;
  var items = state.invoiceDraftItems;
  var subtotal = items.reduce(function(a,it){return a+(Number(it.qty)||0)*(Number(it.price)||0);},0);
  var discount = editing ? editing.discount : (document.getElementById('invDiscount') ? document.getElementById('invDiscount').value : 0);
  return (
    '<div class="screen active">' +
      '<div class="topbar"><div class="topbar-row"><button class="topbar-back" data-nav="invoices">' + ICONS.back + '</button></div><div class="topbar-title">' + (editing?'កែសម្រួលវិក្កយបត្រ':'វិក្កយបត្រថ្មី') + '</div></div>' +
      '<div class="content">' +
        '<div class="card">' +
          '<div class="grid2">' +
            '<div class="field"><label>ឈ្មោះអតិថិជន</label><input id="fClient" value="' + (editing?editing.client:'') + '"></div>' +
            '<div class="field"><label>លេខវិក្កយបត្រ</label><input id="fNumber" value="' + (editing?editing.number:('INV-' + (1000+DB.invoices.length+1))) + '"></div>' +
            '<div class="field"><label>កាលបរិច្ឆេទ</label><input type="date" id="fDate" value="' + (editing?editing.date:todayStr()) + '"></div>' +
            '<div class="field"><label>ស្ថានភាព</label><select id="fStatus">' +
              ['unpaid','paid','overdue'].map(function(s){ return '<option value="' + s + '"' + ((editing?editing.status:'unpaid')===s?' selected':'') + '>' + (s==='paid'?'បានទូទាត់':s==='overdue'?'ហួសកំណត់':'មិនទាន់ទូទាត់') + '</option>'; }).join('') +
            '</select></div>' +
            '<div class="field"><label>បញ្ចុះតម្លៃ (%)</label><input type="number" id="fDiscount" value="' + (editing?editing.discount:0) + '" min="0"></div>' +
            '<div class="field"><label>VAT (%)</label><input type="number" id="fVat" value="' + (editing?editing.vat:10) + '" min="0"></div>' +
          '</div>' +
        '</div>' +
        '<div class="card">' +
          '<div class="lbl-sm">បន្ថែមទំនិញ/សេវា</div>' +
          '<div class="grid2">' +
            '<div class="field" style="grid-column:1/-1;"><label>ការពិពណ៌នា</label><input id="fItemDesc" placeholder="ឧ. ការងារបេតុង"></div>' +
            '<div class="field"><label>បរិមាណ</label><input type="number" id="fItemQty" value="1" min="0"></div>' +
            '<div class="field"><label>តម្លៃ/ឯកតា</label><input type="number" id="fItemPrice" value="0" min="0"></div>' +
          '</div>' +
          '<button class="btn outline sm" data-action="addInvItem">' + ICONS.plus + ' បន្ថែម</button>' +
          (items.length ? '<div style="margin-top:12px;">' + items.map(function(it,i){
            return '<div class="list-row"><div><div class="name">' + it.desc + '</div><div class="sub">' + it.qty + ' × $' + fmt(it.price) + ' = $' + fmt(it.qty*it.price) + '</div></div>' +
              '<button class="del-btn" data-action="delInvItem" data-idx="' + i + '">✕</button></div>';
          }).join('') + '</div>' : '<div class="empty-msg">មិនទាន់មានធាតុទេ</div>') +
        '</div>' +
        '<div class="card">' +
          '<div class="list-row"><span>សរុបរង</span><b>$' + fmt(subtotal) + '</b></div>' +
          '<div class="list-row"><span>សរុប (បន្ទាប់ពី Discount/VAT)</span><b id="fGrandPreview">-</b></div>' +
        '</div>' +
        '<div class="row">' +
          '<button class="btn" data-action="saveInvoice">💾 រក្សាទុក</button>' +
          (editing ? '<button class="btn danger" data-action="delInvoice" data-id="' + editing.id + '">🗑 លុប</button>' : '') +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

// ---------- INVENTORY ----------
function renderInventory(){
  var list = DB.inventory.slice().reverse();
  return (
    '<div class="screen active">' +
      '<div class="topbar"><div class="topbar-row"><button class="topbar-back" data-nav="home">' + ICONS.back + '</button></div><div class="topbar-title">កម្ចង់ទំនិញ</div></div>' +
      '<div class="content">' +
        '<div class="card">' +
          '<div class="grid2">' +
            '<div class="field"><label>ឈ្មោះទំនិញ</label><input id="pName" placeholder="ឧ. ស៊ីម៉ង់ត៍"></div>' +
            '<div class="field"><label>ឯកតា</label><input id="pUnit" placeholder="pcs / kg / bag"></div>' +
            '<div class="field"><label>បរិមាណ</label><input type="number" id="pQty" value="1" min="0"></div>' +
            '<div class="field"><label>តម្លៃ/ឯកតា</label><input type="number" id="pPrice" value="0" min="0"></div>' +
          '</div>' +
          '<button class="btn block" data-action="addInventory">' + ICONS.plus + ' បន្ថែម' + '</button>' +
        '</div>' +
        '<div class="card">' +
          (list.length ? list.map(function(p){
            return '<div class="list-row"><div><div class="name">' + p.name + '</div><div class="sub">' + p.qty + ' ' + p.unit + ' × $' + fmt(p.price) + '</div></div>' +
              '<button class="del-btn" data-action="delInventory" data-id="' + p.id + '">✕</button></div>';
          }).join('') : '<div class="empty-msg">មិនទាន់មានទំនិញទេ</div>') +
        '</div>' +
      '</div>' +
      renderBottomNav('') +
    '</div>'
  );
}

// ---------- PROJECTS ----------
function renderProjects(){
  var list = DB.projects.slice().reverse();
  return (
    '<div class="screen active">' +
      '<div class="topbar"><div class="topbar-row"><button class="topbar-back" data-nav="home">' + ICONS.back + '</button></div><div class="topbar-title">គម្រោង</div></div>' +
      '<div class="content">' +
        '<div class="card">' +
          '<div class="grid2">' +
            '<div class="field"><label>ឈ្មោះគម្រោង</label><input id="prName" placeholder="ឧ. Borey Sunshine A1"></div>' +
            '<div class="field"><label>ទីតាំង</label><input id="prLocation" placeholder="ភ្នំពេញ"></div>' +
            '<div class="field"><label>ថវិកា ($)</label><input type="number" id="prBudget" value="0" min="0"></div>' +
            '<div class="field"><label>បានចំណាយ ($)</label><input type="number" id="prSpent" value="0" min="0"></div>' +
            '<div class="field"><label>ស្ថានភាព</label><select id="prStatus">' +
              '<option value="planning">គម្រោង</option><option value="in-progress">កំពុងធ្វើ</option><option value="completed">បញ្ចប់</option>' +
            '</select></div>' +
            '<div class="field"><label>កាលបរិច្ឆេទកំណត់</label><input type="date" id="prDue"></div>' +
          '</div>' +
          '<button class="btn block" data-action="addProject">' + ICONS.plus + ' បន្ថែមគម្រោង' + '</button>' +
        '</div>' +
        '<div class="card">' +
          (list.length ? list.map(function(p){
            return '<div class="list-row"><div><div class="name">' + p.name + '</div><div class="sub">' + (p.location||'-') + ' · $' + fmt(p.spent) + ' / $' + fmt(p.budget) + '</div></div>' +
              '<b style="color:' + (p.status==='completed'?'#16a34a':p.status==='in-progress'?'#d97706':'#64748b') + ';font-size:.78rem;">' + projectStatusLabel(p.status) + '</b>' +
              '<button class="del-btn" data-action="delProject" data-id="' + p.id + '" style="margin-left:10px;">✕</button></div>';
          }).join('') : '<div class="empty-msg">មិនទាន់មានគម្រោងទេ</div>') +
        '</div>' +
      '</div>' +
      renderBottomNav('') +
    '</div>'
  );
}

// ---------- SCAN / UPLOAD ----------
var scanStream = null;
function renderScan(){
  var thumbs = DB.scans.slice().reverse().slice(0,9);
  return (
    '<div class="screen active">' +
      '<div class="topbar"><div class="topbar-row"><button class="topbar-back" data-nav="home">' + ICONS.back + '</button></div><div class="topbar-title">ថតរូប/ផ្ទុកឯកសារ</div></div>' +
      '<div class="content">' +
        '<div class="scan-preview" id="scanPreviewWrap">' +
          '<video id="scanVideo" autoplay playsinline muted style="display:none;"></video>' +
          '<span id="scanPlaceholder" style="color:#94a3b8;font-size:.85rem;">ចុច "បើកកាមេរ៉ា" ដើម្បីថតរូប</span>' +
        '</div>' +
        '<div class="row" style="margin-bottom:16px;">' +
          '<button class="btn" data-action="openCamera">' + ICONS.camera + ' បើកកាមេរ៉ា</button>' +
          '<button class="btn outline" data-action="captureShot" id="captureBtn" style="display:none;">📸 ថត</button>' +
          '<label class="btn outline" style="cursor:pointer;">📁 ជ្រើសរូបភាព<input type="file" id="fileUpload" accept="image/*" style="display:none;"></label>' +
        '</div>' +
        '<div class="lbl-sm">ឯកសារថ្មីៗ</div>' +
        '<div class="scan-thumbs">' +
          (thumbs.length ? thumbs.map(function(s){
            return '<div class="scan-thumb"><img src="' + s.dataUrl + '"><button class="del-mini" data-action="delScan" data-id="' + s.id + '">✕</button></div>';
          }).join('') : '<div class="empty-msg" style="grid-column:1/-1;">មិនទាន់មានឯកសារទេ</div>') +
        '</div>' +
      '</div>' +
      renderBottomNav('') +
    '</div>'
  );
}

// ---------- ARCHIVE ----------
function renderArchive(){
  var scans = DB.scans.slice().reverse();
  var oldInvoices = DB.invoices.filter(function(i){return i.status==='paid';}).slice().reverse();
  return (
    '<div class="screen active">' +
      '<div class="topbar"><div class="topbar-row"><button class="topbar-back" data-nav="home">' + ICONS.back + '</button></div><div class="topbar-title">ឯកសារចាស់</div></div>' +
      '<div class="content">' +
        '<div class="card"><div class="lbl-sm">រូបភាព/ឯកសារដែលបានស្កេន (' + scans.length + ')</div>' +
          (scans.length ? '<div class="scan-thumbs" style="margin-top:10px;">' + scans.map(function(s){
            return '<div class="scan-thumb"><img src="' + s.dataUrl + '"><button class="del-mini" data-action="delScan" data-id="' + s.id + '">✕</button></div>';
          }).join('') + '</div>' : '<div class="empty-msg">មិនទាន់មានទេ</div>') +
        '</div>' +
        '<div class="card"><div class="lbl-sm">វិក្កយបត្រដែលបានទូទាត់រួច (' + oldInvoices.length + ')</div>' +
          (oldInvoices.length ? oldInvoices.map(function(inv){
            return '<div class="list-row"><div><div class="name">' + inv.number + ' — ' + (inv.client||'-') + '</div><div class="sub">' + inv.date + '</div></div><b>$' + fmt(invoiceTotal(inv)) + '</b></div>';
          }).join('') : '<div class="empty-msg">មិនទាន់មានទេ</div>') +
        '</div>' +
      '</div>' +
      renderBottomNav('archive') +
    '</div>'
  );
}

// ---------- EVENT WIRING ----------
function afterRender(){
  document.querySelectorAll('[data-nav]').forEach(function(el){
    el.addEventListener('click', function(){
      stopCamera();
      go(el.getAttribute('data-nav'));
    });
  });
  document.querySelectorAll('[data-dashtab]').forEach(function(el){
    el.addEventListener('click', function(){
      state.dashTab = el.getAttribute('data-dashtab');
      render();
    });
  });

  var newInvBtn = document.querySelector('[data-action="newInvoice"]');
  if (newInvBtn) newInvBtn.addEventListener('click', function(){
    state.editingInvoiceId = null; state.invoiceDraftItems = []; go('invoiceForm');
  });
  document.querySelectorAll('[data-action="editInvoice"]').forEach(function(el){
    el.addEventListener('click', function(){
      var id = el.getAttribute('data-id');
      var inv = DB.invoices.find(function(i){return i.id===id;});
      state.editingInvoiceId = id;
      state.invoiceDraftItems = inv ? inv.items.slice() : [];
      go('invoiceForm');
    });
  });
  document.querySelectorAll('[data-action="delInvoice"]').forEach(function(el){
    el.addEventListener('click', function(e){
      e.stopPropagation();
      var id = el.getAttribute('data-id');
      var inv = DB.invoices.find(function(i){return i.id===id;});
      var label = inv ? (inv.number + ' — ' + (inv.client||'')) : 'វិក្កយបត្រនេះ';
      if (!confirm('តើអ្នកប្រាកដថាចង់លុប "' + label + '" មែនទេ?')) return;
      DB.invoices = DB.invoices.filter(function(i){return i.id!==id;});
      persist('invoices');
      toast('បានលុប');
      go('invoices');
    });
  });

  var addItemBtn = document.querySelector('[data-action="addInvItem"]');
  if (addItemBtn) addItemBtn.addEventListener('click', function(){
    var desc = document.getElementById('fItemDesc').value.trim();
    var qty = Number(document.getElementById('fItemQty').value) || 0;
    var price = Number(document.getElementById('fItemPrice').value) || 0;
    if (!desc) { toast('សូមបញ្ចូលការពិពណ៌នា'); return; }
    state.invoiceDraftItems.push({desc:desc, qty:qty, price:price});
    render();
  });
  document.querySelectorAll('[data-action="delInvItem"]').forEach(function(el){
    el.addEventListener('click', function(){
      state.invoiceDraftItems.splice(Number(el.getAttribute('data-idx')), 1);
      render();
    });
  });
  var saveInvBtn = document.querySelector('[data-action="saveInvoice"]');
  if (saveInvBtn) saveInvBtn.addEventListener('click', function(){
    var client = document.getElementById('fClient').value.trim();
    var number = document.getElementById('fNumber').value.trim();
    if (!number) { toast('សូមបញ្ចូលលេខវិក្កយបត្រ'); return; }
    var payload = {
      client: client, number: number,
      date: document.getElementById('fDate').value || todayStr(),
      status: document.getElementById('fStatus').value,
      discount: Number(document.getElementById('fDiscount').value) || 0,
      vat: Number(document.getElementById('fVat').value) || 0,
      items: state.invoiceDraftItems.slice()
    };
    if (state.editingInvoiceId){
      var idx = DB.invoices.findIndex(function(i){return i.id===state.editingInvoiceId;});
      DB.invoices[idx] = Object.assign({id:state.editingInvoiceId}, payload);
    } else {
      payload.id = uid('inv');
      DB.invoices.push(payload);
    }
    persist('invoices');
    toast('បានរក្សាទុក');
    go('invoices');
  });

  // live grand-total preview on invoice form
  ['fDiscount','fVat'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', updateInvoicePreview);
  });
  updateInvoicePreview();

  // Inventory
  var addInv = document.querySelector('[data-action="addInventory"]');
  if (addInv) addInv.addEventListener('click', function(){
    var name = document.getElementById('pName').value.trim();
    if (!name) { toast('សូមបញ្ចូលឈ្មោះទំនិញ'); return; }
    DB.inventory.push({ id: uid('inv2'), name:name, unit: document.getElementById('pUnit').value || 'pcs',
      qty: Number(document.getElementById('pQty').value)||0, price: Number(document.getElementById('pPrice').value)||0 });
    persist('inventory'); render();
  });
  document.querySelectorAll('[data-action="delInventory"]').forEach(function(el){
    el.addEventListener('click', function(){
      DB.inventory = DB.inventory.filter(function(p){return p.id!==el.getAttribute('data-id');});
      persist('inventory'); render();
    });
  });

  // Projects
  var addProj = document.querySelector('[data-action="addProject"]');
  if (addProj) addProj.addEventListener('click', function(){
    var name = document.getElementById('prName').value.trim();
    if (!name) { toast('សូមបញ្ចូលឈ្មោះគម្រោង'); return; }
    DB.projects.push({ id: uid('prj'), name:name, location: document.getElementById('prLocation').value,
      budget: Number(document.getElementById('prBudget').value)||0, spent: Number(document.getElementById('prSpent').value)||0,
      status: document.getElementById('prStatus').value, dueDate: document.getElementById('prDue').value });
    persist('projects'); render();
  });
  document.querySelectorAll('[data-action="delProject"]').forEach(function(el){
    el.addEventListener('click', function(){
      DB.projects = DB.projects.filter(function(p){return p.id!==el.getAttribute('data-id');});
      persist('projects'); render();
    });
  });

  // Scan
  var openCamBtn = document.querySelector('[data-action="openCamera"]');
  if (openCamBtn) openCamBtn.addEventListener('click', openCamera);
  var capBtn = document.querySelector('[data-action="captureShot"]');
  if (capBtn) capBtn.addEventListener('click', captureShot);
  var fileInput = document.getElementById('fileUpload');
  if (fileInput) fileInput.addEventListener('change', handleFileUpload);
  document.querySelectorAll('[data-action="delScan"]').forEach(function(el){
    el.addEventListener('click', function(){
      DB.scans = DB.scans.filter(function(s){return s.id!==el.getAttribute('data-id');});
      persist('scans'); render();
    });
  });

  renderCharts();
}

function updateInvoicePreview(){
  var prevEl = document.getElementById('fGrandPreview');
  if (!prevEl) return;
  var subtotal = state.invoiceDraftItems.reduce(function(a,it){return a+(Number(it.qty)||0)*(Number(it.price)||0);},0);
  var discount = Number((document.getElementById('fDiscount')||{}).value) || 0;
  var vat = Number((document.getElementById('fVat')||{}).value) || 0;
  var afterDiscount = subtotal - (subtotal*discount/100);
  var withVat = afterDiscount + (afterDiscount*vat/100);
  prevEl.textContent = '$' + fmt(withVat);
}

function openCamera(){
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ toast('កាមេរ៉ាមិនអាចប្រើនៅទីនេះទេ'); return; }
  navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } }).then(function(stream){
    scanStream = stream;
    var video = document.getElementById('scanVideo');
    var placeholder = document.getElementById('scanPlaceholder');
    if (video){ video.srcObject = stream; video.style.display='block'; }
    if (placeholder) placeholder.style.display = 'none';
    var capBtn = document.getElementById('captureBtn');
    if (capBtn) capBtn.style.display = 'inline-flex';
  }).catch(function(){ toast('មិនអាចបើកកាមេរ៉ាបានទេ (សូមអនុញ្ញាត Permission)'); });
}
function stopCamera(){
  if (scanStream){ scanStream.getTracks().forEach(function(t){t.stop();}); scanStream = null; }
}
function captureShot(){
  var video = document.getElementById('scanVideo');
  if (!video) return;
  var canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 480; canvas.height = video.videoHeight || 640;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  var dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  DB.scans.push({ id: uid('scan'), dataUrl: dataUrl, name: 'Scan ' + new Date().toLocaleString(), date: todayStr() });
  persist('scans');
  stopCamera();
  toast('បានថតរូបជោគជ័យ');
  render();
}
function handleFileUpload(e){
  var file = e.target.files && e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(){
    DB.scans.push({ id: uid('scan'), dataUrl: reader.result, name: file.name, date: todayStr() });
    persist('scans');
    toast('បានផ្ទុករូបភាពជោគជ័យ');
    render();
  };
  reader.readAsDataURL(file);
}

// ---------- boot ----------
render();
})();
