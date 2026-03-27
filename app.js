// ============================================================
// CONFIG — Replace with your own Google Cloud OAuth Client ID
// ============================================================
const CLIENT_ID = '1054094870440-s489ff70g89l7e9tbb5numvlu6diduin.apps.googleusercontent.com';
const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email'
].join(' ');
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

// ============================================================
// STATE
// ============================================================
let tokenClient = null;
let accessToken = null;
let spreadsheetId = localStorage.getItem('spreadsheet_id');
let currentType = 'EXPENSE';
let userInfo = null;
let allTransactions = [];
let currentPeriod = 'month';
let currentDate = new Date();

const CATEGORIES = {
    EXPENSE: ['Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Education', 'Other'],
    INCOME: ['Salary', 'Freelance', 'Business', 'Investment', 'Gift', 'Other']
};

const CATEGORY_ICONS = {
    Food: '🍔', Transport: '🚗', Shopping: '🛍️', Bills: '📄',
    Entertainment: '🎬', Health: '💊', Education: '📚', Other: '📦',
    Salary: '💰', Freelance: '💻', Business: '📈', Investment: '📊', Gift: '🎁'
};

// ============================================================
// DOM REFS
// ============================================================
const $  = id => document.getElementById(id);
const loginScreen   = $('login-screen');
const mainScreen    = $('main-screen');
const addModal      = $('add-modal');
const loadingEl     = $('loading');
const toastEl       = $('toast');
const txList        = $('transactions-list');
const categorySelect = $('category');

// ============================================================
// INIT
// ============================================================
window.addEventListener('load', () => {
    waitForGsi();
});

function waitForGsi() {
    if (typeof google !== 'undefined' && google.accounts) {
        initAuth();
    } else {
        setTimeout(waitForGsi, 100);
    }
}

function initAuth() {
    const savedEmail = getSavedEmail();

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: handleTokenResponse,
        hint: savedEmail || '',
    });

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    tryRestoreSession();
}

// ============================================================
// AUTH
// ============================================================
function handleSignIn() {
    tokenClient.requestAccessToken();
}

function handleTokenResponse(response) {
    if (response.error) {
        if (!isSilentAuth) {
            showToast('Sign-in failed. Please try again.', 'error');
        }
        isSilentAuth = false;
        return;
    }
    isSilentAuth = false;
    accessToken = response.access_token;
    saveToken(accessToken, response.expires_in);
    fetchUserInfo();
}

let isSilentAuth = false;

function tryRestoreSession() {
    const savedToken = localStorage.getItem('access_token');
    const savedExpiry = parseInt(localStorage.getItem('token_expiry') || '0');
    const savedUser = localStorage.getItem('user_info');

    if (savedUser && savedToken && Date.now() < savedExpiry) {
        accessToken = savedToken;
        userInfo = JSON.parse(savedUser);
        spreadsheetId = localStorage.getItem('spreadsheet_id');
        showMainScreen();
        loadOrCreateSpreadsheet();
        return;
    }

    if (savedUser) {
        userInfo = JSON.parse(savedUser);
        isSilentAuth = true;
        tokenClient.requestAccessToken({ prompt: '' });
        return;
    }
}

function saveToken(token, expiresIn) {
    localStorage.setItem('access_token', token);
    localStorage.setItem('token_expiry', String(Date.now() + (expiresIn || 3600) * 1000));
}

function getSavedEmail() {
    try {
        const saved = localStorage.getItem('user_info');
        return saved ? JSON.parse(saved).email || '' : '';
    } catch (_) {
        return '';
    }
}

async function fetchUserInfo() {
    showLoading(true);
    try {
        const res = await apiFetch('https://www.googleapis.com/oauth2/v3/userinfo');
        userInfo = res;
        localStorage.setItem('user_info', JSON.stringify(userInfo));
        showMainScreen();
        await loadOrCreateSpreadsheet();
    } catch (e) {
        showToast('Failed to get user info.', 'error');
    } finally {
        showLoading(false);
    }
}

function handleSignOut() {
    if (accessToken) {
        google.accounts.oauth2.revoke(accessToken);
    }
    accessToken = null;
    userInfo = null;
    spreadsheetId = null;
    localStorage.removeItem('user_info');
    localStorage.removeItem('spreadsheet_id');
    localStorage.removeItem('access_token');
    localStorage.removeItem('token_expiry');
    $('connected-banner').classList.add('hidden');
    showLoginScreen();
    closeMenu();
}

// ============================================================
// SCREENS
// ============================================================
function showLoginScreen() {
    loginScreen.classList.remove('hidden');
    mainScreen.classList.add('hidden');
}

function showMainScreen() {
    loginScreen.classList.add('hidden');
    mainScreen.classList.remove('hidden');

    const avatar = $('user-avatar');
    if (userInfo?.picture) {
        avatar.src = userInfo.picture;
        avatar.alt = userInfo.name || '';
    } else {
        avatar.src = 'data:image/svg+xml,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#1565C0"/><text x="20" y="26" text-anchor="middle" fill="#fff" font-size="18" font-family="sans-serif">' +
            (userInfo?.name?.[0] || '?') + '</text></svg>'
        );
    }
    $('user-name').textContent = userInfo?.name || '';
    $('user-email').textContent = userInfo?.email || '';
}

// ============================================================
// SHEETS API
// ============================================================
async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });

    if (res.status === 401) {
        return new Promise((resolve, reject) => {
            tokenClient.callback = (resp) => {
                tokenClient.callback = handleTokenResponse;
                if (resp.error) { reject(new Error('Auth refresh failed')); return; }
                accessToken = resp.access_token;
                saveToken(accessToken, resp.expires_in);
                apiFetch(url, options).then(resolve).catch(reject);
            };
            tokenClient.requestAccessToken({ prompt: '' });
        });
    }

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `API error ${res.status}`);
    }

    return res.json();
}

async function loadOrCreateSpreadsheet() {
    showLoading(true);
    try {
        if (spreadsheetId) {
            try {
                await apiFetch(`${SHEETS_API}/${spreadsheetId}?fields=spreadsheetId`);
                showConnectedBanner();
                await fetchTransactions();
                return;
            } catch (_) {
                spreadsheetId = null;
                localStorage.removeItem('spreadsheet_id');
            }
        }
        showToast('Creating your personal expense sheet...', 'success');
        await createSpreadsheet();
        showConnectedBanner();
        await fetchTransactions();
    } catch (e) {
        showToast(e.message || 'Failed to load spreadsheet.', 'error');
    } finally {
        showLoading(false);
    }
}

function showConnectedBanner() {
    const banner = $('connected-banner');
    const text = $('connected-text');
    banner.classList.remove('hidden');
    const email = userInfo?.email || 'your account';
    text.textContent = `Saving to ${email}'s Google Drive`;
}

async function createSpreadsheet() {
    const data = await apiFetch(SHEETS_API, {
        method: 'POST',
        body: JSON.stringify({
            properties: { title: 'Expenses Tracker' },
            sheets: [{ properties: { title: 'Transactions' } }]
        })
    });

    spreadsheetId = data.spreadsheetId;
    localStorage.setItem('spreadsheet_id', spreadsheetId);

    await apiFetch(
        `${SHEETS_API}/${spreadsheetId}/values/Transactions!A1:E1?valueInputOption=RAW`,
        {
            method: 'PUT',
            body: JSON.stringify({
                values: [['Date', 'Type', 'Category', 'Amount', 'Description']]
            })
        }
    );

    await apiFetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({
            requests: [{
                repeatCell: {
                    range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
                    cell: {
                        userEnteredFormat: {
                            textFormat: { bold: true },
                            backgroundColor: { red: 0.9, green: 0.9, blue: 0.95 }
                        }
                    },
                    fields: 'userEnteredFormat(textFormat,backgroundColor)'
                }
            }, {
                updateSheetProperties: {
                    properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } },
                    fields: 'gridProperties.frozenRowCount'
                }
            }]
        })
    });
}

async function fetchTransactions() {
    try {
        const data = await apiFetch(
            `${SHEETS_API}/${spreadsheetId}/values/Transactions!A2:E?majorDimension=ROWS`
        );

        const rows = data.values || [];
        allTransactions = rows.map(row => ({
            date: row[0] || '',
            type: row[1] || 'EXPENSE',
            category: row[2] || '',
            amount: parseFloat(row[3]) || 0,
            description: row[4] || ''
        })).reverse();

        applyFilter();
    } catch (_) {
        allTransactions = [];
        applyFilter();
    }
}

async function addTransaction(type, category, amount, description) {
    const date = new Date().toLocaleString('en-IN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
    });

    await apiFetch(
        `${SHEETS_API}/${spreadsheetId}/values/Transactions!A:E:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
            method: 'POST',
            body: JSON.stringify({
                values: [[date, type, category, amount.toString(), description]]
            })
        }
    );
}

// ============================================================
// PERIOD FILTER
// ============================================================
const MONTH_NAMES = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun',
    'Jul','Aug','Sep','Oct','Nov','Dec'];

function setPeriod(period) {
    currentPeriod = period;
    currentDate = new Date();
    document.querySelectorAll('.period-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.period === period);
    });
    const nav = document.querySelector('.period-nav');
    if (period === 'all') {
        nav.classList.add('hidden-nav');
    } else {
        nav.classList.remove('hidden-nav');
    }
    applyFilter();
}

function navigatePeriod(direction) {
    if (currentPeriod === 'day') {
        currentDate.setDate(currentDate.getDate() + direction);
    } else if (currentPeriod === 'month') {
        currentDate.setMonth(currentDate.getMonth() + direction);
    } else if (currentPeriod === 'year') {
        currentDate.setFullYear(currentDate.getFullYear() + direction);
    }
    applyFilter();
}

function getPeriodLabel() {
    if (currentPeriod === 'all') return 'All Time';
    if (currentPeriod === 'day') {
        const today = new Date();
        if (sameDay(currentDate, today)) return 'Today';
        const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
        if (sameDay(currentDate, yesterday)) return 'Yesterday';
        return `${currentDate.getDate()} ${MONTH_SHORT[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
    if (currentPeriod === 'month') {
        return `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
    if (currentPeriod === 'year') {
        return `${currentDate.getFullYear()}`;
    }
    return '';
}

function sameDay(a, b) {
    return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

function parseTxDate(dateStr) {
    if (!dateStr) return null;
    // Handle "DD/MM/YYYY, HH:MM" (en-IN locale format)
    const parts = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (parts) {
        return new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]));
    }
    // Handle "YYYY-MM-DD" or other standard formats
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

function filterTransactions(transactions) {
    if (currentPeriod === 'all') return transactions;

    return transactions.filter(tx => {
        const d = parseTxDate(tx.date);
        if (!d) return false;

        if (currentPeriod === 'day') {
            return sameDay(d, currentDate);
        }
        if (currentPeriod === 'month') {
            return d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear();
        }
        if (currentPeriod === 'year') {
            return d.getFullYear() === currentDate.getFullYear();
        }
        return true;
    });
}

function applyFilter() {
    const filtered = filterTransactions(allTransactions);
    $('period-label').textContent = getPeriodLabel();
    $('tx-count').textContent = filtered.length ? `${filtered.length} entries` : '';
    renderSummary(filtered);
    renderTransactions(filtered);
}

// ============================================================
// RENDER
// ============================================================
function renderSummary(transactions) {
    let income = 0, expense = 0;
    for (const tx of transactions) {
        if (tx.type === 'INCOME') income += tx.amount;
        else expense += tx.amount;
    }
    $('total-income').textContent = formatCurrency(income);
    $('total-expense').textContent = formatCurrency(expense);
    $('total-balance').textContent = formatCurrency(income - expense);
}

function renderTransactions(transactions) {
    if (!transactions.length) {
        const msg = allTransactions.length === 0
            ? 'No transactions yet. Tap + to add one.'
            : `No transactions for ${getPeriodLabel().toLowerCase()}.`;
        txList.innerHTML = `<div class="empty-state">${msg}</div>`;
        return;
    }

    txList.innerHTML = transactions.map(tx => `
        <div class="tx-item">
            <div class="tx-icon ${tx.type.toLowerCase()}">
                ${CATEGORY_ICONS[tx.category] || (tx.type === 'INCOME' ? '💰' : '📦')}
            </div>
            <div class="tx-details">
                <div class="tx-category">${escapeHtml(tx.category)}</div>
                <div class="tx-desc">${escapeHtml(tx.description || '—')}</div>
            </div>
            <div class="tx-right">
                <div class="tx-amount ${tx.type.toLowerCase()}">
                    ${tx.type === 'INCOME' ? '+' : '-'}${formatCurrency(tx.amount)}
                </div>
                <div class="tx-date">${escapeHtml(tx.date)}</div>
            </div>
        </div>
    `).join('');
}

function formatCurrency(amount) {
    return '₹' + Math.abs(amount).toLocaleString('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============================================================
// MODAL & FORM
// ============================================================
function openAddModal() {
    addModal.classList.remove('hidden');
    $('add-form').reset();
    setTransactionType('EXPENSE');
}

function closeAddModal() {
    addModal.classList.add('hidden');
}

function closeModalOnOverlay(e) {
    if (e.target === addModal) closeAddModal();
}

function setTransactionType(type) {
    currentType = type;
    document.querySelectorAll('.toggle').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
    populateCategories(type);
}

function populateCategories(type) {
    const cats = CATEGORIES[type] || [];
    categorySelect.innerHTML = '<option value="">Select category</option>' +
        cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

async function handleAddSubmit(e) {
    e.preventDefault();
    const category = categorySelect.value;
    const amount = parseFloat($('amount').value);
    const description = $('description').value.trim();

    if (!category || !amount || amount <= 0) {
        showToast('Please fill in category and a valid amount.', 'error');
        return;
    }

    showLoading(true);
    try {
        await addTransaction(currentType, category, amount, description);
        closeAddModal();
        showToast('Transaction added!', 'success');
        await fetchTransactions();
    } catch (e) {
        showToast(e.message || 'Failed to add transaction.', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================
// DATA REFRESH
// ============================================================
async function refreshData() {
    if (!spreadsheetId || !accessToken) return;
    showLoading(true);
    try {
        await fetchTransactions();
        showToast('Refreshed!', 'success');
    } catch (e) {
        showToast('Failed to refresh.', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================
// SHEET LINK
// ============================================================
function openSheetLink() {
    if (spreadsheetId) {
        window.open(`https://docs.google.com/spreadsheets/d/${spreadsheetId}`, '_blank');
    } else {
        showToast('No spreadsheet linked yet.', 'error');
    }
}

// ============================================================
// USER MENU
// ============================================================
function toggleMenu() {
    $('user-menu').classList.toggle('hidden');
}

function closeMenu() {
    $('user-menu').classList.add('hidden');
}

document.addEventListener('click', (e) => {
    const menu = $('user-menu');
    const avatar = $('user-avatar');
    if (!menu.contains(e.target) && e.target !== avatar) {
        menu.classList.add('hidden');
    }
});

// ============================================================
// TOAST & LOADING
// ============================================================
function showToast(message, type = 'success') {
    toastEl.textContent = message;
    toastEl.className = `toast ${type}`;
    setTimeout(() => { toastEl.classList.add('hidden'); }, 3000);
}

function showLoading(show) {
    loadingEl.classList.toggle('hidden', !show);
}
