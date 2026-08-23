(function () {
  "use strict";

  /* =========================================================
     CONFIG
     ========================================================= */
  var STORAGE_KEY = "ledger.transactions.v1";

  var EXPENSE_CATEGORIES = [
    { id: "food", label: "Food", icon: "🍔" },
    { id: "transportation", label: "Transportation", icon: "🚌" },
    { id: "education", label: "Education", icon: "📚" },
    { id: "shopping", label: "Shopping", icon: "🛒" },
    { id: "entertainment", label: "Entertainment", icon: "🎮" },
    { id: "bills", label: "Bills", icon: "💡" },
    { id: "health", label: "Health", icon: "🏥" },
    { id: "subscriptions", label: "Subscriptions", icon: "📱" },
    { id: "others", label: "Others", icon: "📦" }
  ];

  var INCOME_CATEGORIES = [
    { id: "allowance", label: "Allowance", icon: "💰" },
    { id: "salary", label: "Salary", icon: "🧾" },
    { id: "gift", label: "Gift", icon: "🎁" },
    { id: "other_income", label: "Other Income", icon: "📥" }
  ];

  var ALL_CATEGORIES = EXPENSE_CATEGORIES.concat(INCOME_CATEGORIES);

  function categoryById(id) {
    for (var i = 0; i < ALL_CATEGORIES.length; i++) {
      if (ALL_CATEGORIES[i].id === id) return ALL_CATEGORIES[i];
    }
    return { id: id, label: id, icon: "📦" };
  }

  /* =========================================================
     STATE / STORAGE
     ========================================================= */
  var state = {
    transactions: [],
    view: "dashboard",
    editingId: null,
    historySearch: "",
    historyCategory: "all"
  };

  function loadTransactions() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      state.transactions = raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Failed to load transactions", e);
      state.transactions = [];
    }
  }

  function saveTransactions() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.transactions));
    } catch (e) {
      console.error("Failed to save transactions", e);
      showToast("Couldn't save — storage may be full");
    }
  }

  /* =========================================================
     HELPERS
     ========================================================= */
  function formatCurrency(amount) {
    var sign = amount < 0 ? "-" : "";
    var abs = Math.abs(amount);
    return sign + "₱" + abs.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(isoDate) {
    var d = new Date(isoDate + "T00:00:00");
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  }

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function uid() {
    return "tx_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function showToast(message) {
    var el = document.getElementById("toast");
    el.textContent = message;
    el.hidden = false;
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(function () {
      el.hidden = true;
    }, 2200);
  }

  /* =========================================================
     DERIVED DATA
     ========================================================= */
  function computeTotals() {
    var income = 0, expenses = 0;
    state.transactions.forEach(function (t) {
      if (t.type === "income") income += t.amount;
      else expenses += t.amount;
    });
    return { income: income, expenses: expenses, balance: income - expenses };
  }

  function sortedTransactions() {
    return state.transactions.slice().sort(function (a, b) {
      if (a.date === b.date) return b.createdAt - a.createdAt;
      return a.date < b.date ? 1 : -1;
    });
  }

  function categoryTotals() {
    var totals = {};
    state.transactions.forEach(function (t) {
      if (t.type !== "expense") return;
      totals[t.category] = (totals[t.category] || 0) + t.amount;
    });
    return totals;
  }

  /* =========================================================
     RENDERING — DASHBOARD
     ========================================================= */
  function renderDashboard() {
    var totals = computeTotals();
    document.getElementById("statBalance").textContent = formatCurrency(totals.balance);
    document.getElementById("statIncome").textContent = formatCurrency(totals.income);
    document.getElementById("statExpenses").textContent = formatCurrency(totals.expenses);

    var recent = sortedTransactions().slice(0, 5);
    var list = document.getElementById("recentList");
    var empty = document.getElementById("recentEmpty");
    list.innerHTML = "";
    empty.hidden = recent.length !== 0;
    recent.forEach(function (t) {
      list.appendChild(buildLedgerRow(t));
    });

    renderCategoryBreakdown();
  }

  function renderCategoryBreakdown() {
    var totals = categoryTotals();
    var entries = Object.keys(totals).map(function (catId) {
      return { catId: catId, amount: totals[catId] };
    }).sort(function (a, b) { return b.amount - a.amount; });

    var container = document.getElementById("categoryBreakdown");
    var empty = document.getElementById("categoryEmpty");
    container.innerHTML = "";
    empty.hidden = entries.length !== 0;

    var max = entries.length ? entries[0].amount : 0;
    entries.slice(0, 6).forEach(function (entry) {
      var cat = categoryById(entry.catId);
      var row = document.createElement("div");
      row.className = "category-bar";

      var pct = max > 0 ? Math.max(6, Math.round((entry.amount / max) * 100)) : 0;

      row.innerHTML =
        '<span class="category-bar__label">' + cat.icon + " " + escapeHTML(cat.label) + "</span>" +
        '<span class="category-bar__track"><span class="category-bar__fill" style="width:' + pct + '%"></span></span>' +
        '<span class="category-bar__amount">' + formatCurrency(entry.amount) + "</span>";
      container.appendChild(row);
    });
  }

  /* =========================================================
     RENDERING — HISTORY
     ========================================================= */
  function renderHistory() {
    var list = document.getElementById("historyList");
    var empty = document.getElementById("historyEmpty");
    list.innerHTML = "";

    var search = state.historySearch.trim().toLowerCase();
    var items = sortedTransactions().filter(function (t) {
      var cat = categoryById(t.category);
      var matchesCategory = state.historyCategory === "all" || t.category === state.historyCategory;
      var haystack = ((t.description || "") + " " + cat.label).toLowerCase();
      var matchesSearch = search === "" || haystack.indexOf(search) !== -1;
      return matchesCategory && matchesSearch;
    });

    empty.hidden = items.length !== 0;
    items.forEach(function (t) {
      list.appendChild(buildLedgerRow(t));
    });
  }

  function populateCategoryFilter() {
    var select = document.getElementById("filterCategory");
    ALL_CATEGORIES.forEach(function (cat) {
      var opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = cat.icon + " " + cat.label;
      select.appendChild(opt);
    });
  }

  /* =========================================================
     SHARED ROW BUILDER
     ========================================================= */
  function buildLedgerRow(t) {
    var cat = categoryById(t.category);
    var li = document.createElement("li");
    li.className = "ledger-row";
    li.setAttribute("data-id", t.id);
    li.setAttribute("role", "button");
    li.setAttribute("tabindex", "0");

    var signedAmount = t.type === "income" ? t.amount : -t.amount;

    li.innerHTML =
      '<span class="ledger-row__icon">' + cat.icon + "</span>" +
      '<span class="ledger-row__body">' +
        '<span class="ledger-row__desc">' + escapeHTML(t.description || cat.label) + "</span>" +
        '<span class="ledger-row__meta">' + escapeHTML(cat.label) + " · " + formatDate(t.date) + "</span>" +
      "</span>" +
      '<span class="ledger-row__amount ' + (t.type === "income" ? "ledger-row__amount--in" : "ledger-row__amount--out") + '">' +
        formatCurrency(signedAmount) +
      "</span>";

    li.addEventListener("click", function () { openSheet(t.id); });
    li.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSheet(t.id); }
    });

    return li;
  }

  function escapeHTML(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* =========================================================
     NAVIGATION
     ========================================================= */
  function goToView(name) {
    state.view = name;
    document.querySelectorAll(".view").forEach(function (el) {
      el.classList.toggle("view--active", el.id === "view-" + name);
    });
    document.querySelectorAll(".bottom-nav__item").forEach(function (btn) {
      btn.classList.toggle("bottom-nav__item--active", btn.getAttribute("data-nav") === name);
    });
    if (name === "dashboard") renderDashboard();
    if (name === "history") renderHistory();
  }

  /* =========================================================
     ADD / EDIT SHEET
     ========================================================= */
  var currentType = "expense";

  function populateCategorySelect(type) {
    var select = document.getElementById("txCategory");
    var list = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    select.innerHTML = "";
    list.forEach(function (cat) {
      var opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = cat.icon + " " + cat.label;
      select.appendChild(opt);
    });
  }

  function setType(type) {
    currentType = type;
    document.getElementById("typeExpenseBtn").classList.toggle("type-toggle__btn--active", type === "expense");
    document.getElementById("typeIncomeBtn").classList.toggle("type-toggle__btn--active", type === "income");
    var currentCategory = document.getElementById("txCategory").value;
    populateCategorySelect(type);
    // keep selection if same category id still valid for new type, else default to first
    var list = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    var stillValid = list.some(function (c) { return c.id === currentCategory; });
    if (stillValid) document.getElementById("txCategory").value = currentCategory;
  }

  function openSheet(editId) {
    state.editingId = editId || null;
    var backdrop = document.getElementById("sheetBackdrop");
    var sheet = document.getElementById("sheet");
    var deleteBtn = document.getElementById("deleteTxBtn");

    if (editId) {
      var tx = state.transactions.find(function (t) { return t.id === editId; });
      if (!tx) return;
      document.getElementById("sheetTitle").textContent = "Edit Entry";
      document.getElementById("txId").value = tx.id;
      setType(tx.type);
      document.getElementById("txAmount").value = tx.amount;
      document.getElementById("txCategory").value = tx.category;
      document.getElementById("txDescription").value = tx.description || "";
      document.getElementById("txDate").value = tx.date;
      deleteBtn.hidden = false;
    } else {
      document.getElementById("sheetTitle").textContent = "Add Entry";
      document.getElementById("txId").value = "";
      setType("expense");
      document.getElementById("txAmount").value = "";
      document.getElementById("txDescription").value = "";
      document.getElementById("txDate").value = todayISO();
      deleteBtn.hidden = true;
    }

    backdrop.hidden = false;
    sheet.hidden = false;
    window.setTimeout(function () { document.getElementById("txAmount").focus(); }, 50);
  }

  function closeSheet() {
    document.getElementById("sheetBackdrop").hidden = true;
    document.getElementById("sheet").hidden = true;
    state.editingId = null;
  }

  function handleSheetSubmit(e) {
    e.preventDefault();
    var amount = parseFloat(document.getElementById("txAmount").value);
    if (!amount || amount <= 0) {
      showToast("Enter an amount greater than 0");
      return;
    }

    var payload = {
      type: currentType,
      amount: amount,
      category: document.getElementById("txCategory").value,
      description: document.getElementById("txDescription").value.trim(),
      date: document.getElementById("txDate").value || todayISO()
    };

    var editId = document.getElementById("txId").value;

    if (editId) {
      var idx = state.transactions.findIndex(function (t) { return t.id === editId; });
      if (idx !== -1) {
        state.transactions[idx] = Object.assign({}, state.transactions[idx], payload);
      }
      showToast("Entry updated");
    } else {
      state.transactions.push(Object.assign({
        id: uid(),
        createdAt: Date.now()
      }, payload));
      showToast("Entry saved");
    }

    saveTransactions();
    closeSheet();
    refreshCurrentView();
  }

  function handleDelete() {
    var editId = document.getElementById("txId").value;
    if (!editId) return;
    if (!window.confirm("Delete this entry? This can't be undone.")) return;
    state.transactions = state.transactions.filter(function (t) { return t.id !== editId; });
    saveTransactions();
    closeSheet();
    showToast("Entry deleted");
    refreshCurrentView();
  }

  function refreshCurrentView() {
    if (state.view === "dashboard") renderDashboard();
    else renderHistory();
  }

  /* =========================================================
     CLEAR ALL DATA
     ========================================================= */
  function handleClearAll() {
    if (state.transactions.length === 0) {
      showToast("Nothing to clear");
      return;
    }
    if (!window.confirm("Clear ALL transactions? This can't be undone.")) return;
    state.transactions = [];
    saveTransactions();
    refreshCurrentView();
    showToast("All data cleared");
  }

  /* =========================================================
     INIT
     ========================================================= */
  function init() {
    loadTransactions();
    populateCategoryFilter();
    populateCategorySelect("expense");

    document.querySelectorAll("[data-nav]").forEach(function (el) {
      el.addEventListener("click", function () { goToView(el.getAttribute("data-nav")); });
    });

    document.getElementById("addFab").addEventListener("click", function () { openSheet(null); });
    document.getElementById("sheetClose").addEventListener("click", closeSheet);
    document.getElementById("sheetBackdrop").addEventListener("click", closeSheet);
    document.getElementById("sheet").addEventListener("submit", handleSheetSubmit);
    document.getElementById("deleteTxBtn").addEventListener("click", handleDelete);
    document.getElementById("clearAllBtn").addEventListener("click", handleClearAll);

    document.getElementById("typeExpenseBtn").addEventListener("click", function () { setType("expense"); });
    document.getElementById("typeIncomeBtn").addEventListener("click", function () { setType("income"); });

    document.getElementById("searchInput").addEventListener("input", function (e) {
      state.historySearch = e.target.value;
      renderHistory();
    });
    document.getElementById("filterCategory").addEventListener("change", function (e) {
      state.historyCategory = e.target.value;
      renderHistory();
    });

    // Android hardware back button (Capacitor) closes the sheet if open, else no-op
    document.addEventListener("backbutton", function () {
      if (!document.getElementById("sheet").hidden) closeSheet();
    });

    goToView("dashboard");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
