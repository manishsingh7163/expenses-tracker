// ============================================================
// CONFIG — Replace with your own Google Cloud OAuth Client ID
// ============================================================
const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
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
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: handleTokenResponse,
    });

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}

// ============================================================
// AUTH
// ============================================================
function handleSignIn() {
    tokenClient.requestAccessToken();
}

function handleTokenResponse(response) {
    if (response.error) {
        showToast('Sign-in failed. Please try again.', 'error');
        return;
    }
    accessToken = response.access_token;
    fetchUserInfo();
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
                if (resp.error) { reject(new Error('Auth refresh failed')); return; }
                accessToken = resp.access_token;
                tokenClient.callback = handleTokenResponse;
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
        const transactions = rows.map(row => ({
            date: row[0] || '',
            type: row[1] || 'EXPENSE',
            category: row[2] || '',
            amount: parseFloat(row[3]) || 0,
            description: row[4] || ''
        })).reverse();

        renderTransactions(transactions);
        renderSummary(transactions);
    } catch (_) {
        renderTransactions([]);
        renderSummary([]);
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
        txList.innerHTML = '<div class="empty-state">No transactions yet. Tap + to add one.</div>';
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
