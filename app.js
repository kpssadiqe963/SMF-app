const byId = id => document.getElementById(id);
const ADMIN_USERNAME = 'SWABAHSMF';
const APP_LINK = 'https://kpssadiqe963.github.io/SMF-app/';
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
const endpoint = window.SMF_CONFIG?.apiUrl || '';
let currentMember = null;
let adminTransactions = [];
let showAllPayments = false;

async function api(action, params = {}) {
  if (!endpoint || endpoint.includes('PASTE_YOUR')) throw new Error('The SMF data service has not been connected yet.');
  const url = new URL(endpoint);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not connect to the SMF data service.');
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.message || 'Unable to load data.');
  return payload.data;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}
function setLoginMessage(message = '') { byId('loginMessage').textContent = message; }
function showOnly(screenId) { ['loginScreen', 'memberScreen', 'adminScreen'].forEach(id => byId(id).classList.toggle('hidden', id !== screenId)); }

async function signIn(value) {
  const login = value.trim().toUpperCase();
  if (!login) return;
  setLoginMessage(login === ADMIN_USERNAME ? 'Loading admin transactions…' : 'Checking Membership ID…');
  try {
    if (login === ADMIN_USERNAME) {
      adminTransactions = (await api('admin', { username: login })).transactions;
      sessionStorage.setItem('smfAdmin', login);
      renderAdminTransactions();
      showOnly('adminScreen');
      return;
    }
    currentMember = await api('member', { memberId: login });
    localStorage.setItem('smfMemberId', login);
    showMember();
  } catch (error) { setLoginMessage(error.message); }
}

function showMember() {
  const { member, summary, payments, announcements } = currentMember;
  byId('memberName').textContent = member.name;
  byId('memberIdText').textContent = member.id;
  byId('updatedText').textContent = `Last updated: ${summary.lastUpdated || 'Not available'}`;
  byId('totalPaid').textContent = money(summary.totalPaid);
  byId('monthsPaid').textContent = `${summary.monthsPaid || 0} months paid`;
  byId('ssfTotal').textContent = money(summary.ssfTotal);
  byId('sifTotal').textContent = money(summary.sifTotal);

  const monthlyBalance = Number(summary.monthlyBalance || 0);
  const withdrawn = Number(summary.withdrawn || 0);
  const withdrawalBalance = Number(summary.balanceToPay || 0);
  const hasWithdrawal = withdrawn > 0;
  byId('monthlyBalanceBox').classList.toggle('hidden', monthlyBalance <= 0);
  byId('balanceAmount').textContent = money(monthlyBalance);
  byId('withdrawalSummary').classList.toggle('hidden', !hasWithdrawal);
  if (hasWithdrawal) {
    byId('withdrawnAmount').textContent = money(withdrawn);
    byId('withdrawalBalanceToPay').textContent = money(Math.abs(withdrawalBalance));
  }
  byId('paymentStatus').textContent = monthlyBalance > 0 ? 'Monthly payment due' : 'Up to date';

  showAllPayments = false;
  renderPayments(payments);
  byId('announcementsList').innerHTML = announcements.length ? announcements.map(a => `<article class="announcement"><strong>${escapeHtml(a.title)}</strong><p>${escapeHtml(a.message)}</p></article>`).join('') : '<p class="muted-copy">No current announcements.</p>';
  showOnly('memberScreen');
  loadInvestment(currentMember.investment, Number(summary.sifTotal || 0));
}

function renderPayments(payments) {
  const visiblePayments = showAllPayments ? payments : payments.slice(0, 3);
  byId('paymentsList').innerHTML = payments.length ? visiblePayments.map(p => `<article class="payment"><div><p>${escapeHtml(p.month)} ${escapeHtml(p.year)}</p><span>${escapeHtml(p.date || 'Date not recorded')}</span></div><strong>${money(p.totalAmount)}</strong></article>`).join('') : '<p class="muted-copy">No contribution payments have been recorded yet.</p>';
  byId('paymentsToggle').classList.toggle('hidden', payments.length <= 3);
  byId('paymentsToggle').textContent = showAllPayments ? 'Show less' : 'View all';
}

async function loadInvestment(investment, memberSifTotal) {
  const empty = memberSifTotal <= 0;
  byId('noInvestment').classList.toggle('hidden', !empty);
  byId('investmentContent').classList.toggle('hidden', empty);
  if (empty) return;
  const hasPersonalSummary = investment && Number(investment.totalInvested || 0) > 0;
  if (hasPersonalSummary) {
    const profitLoss = Number(investment.profitLoss);
    byId('fundValue').textContent = money(investment.currentValue);
    byId('fundDate').textContent = `Updated ${investment.lastUpdated || 'Not available'}`;
    byId('investedAmount').textContent = money(investment.totalInvested);
    byId('profitLoss').textContent = `${profitLoss < 0 ? '−' : '+'}${money(Math.abs(profitLoss))}`;
    byId('returnPercent').textContent = `${Number(investment.returnPercent) < 0 ? '' : '+'}${(Number(investment.returnPercent) * 100).toFixed(2)}%`;
    byId('investmentStatus').textContent = profitLoss < 0 ? 'Loss' : 'Profit';
    byId('profitCard').className = `profit-card ${profitLoss < 0 ? 'loss' : 'profit'}`;
  }
  try { renderInvestment(await api('investment')); } catch (error) { byId('investmentContent').innerHTML = `<div class="empty-state"><div class="empty-icon">!</div><h3>Investment data unavailable</h3><p>${escapeHtml(error.message)}</p></div>`; }
}

function renderInvestment(history) {
  if (!history.length) return;
  const latest = history.at(-1), profitLoss = Number(latest.profitLoss), color = profitLoss < 0 ? '#c83a3a' : '#137547';
  byId('chartLegend').textContent = profitLoss < 0 ? 'Loss' : 'Profit';
  document.querySelector('.legend i').style.background = color;
  const values = history.map(row => Number(row.currentTotalValue));
  const invested = history.map(row => Number(row.totalSifInvested));
  const allValues = [...values, ...invested], rawMin = Math.min(...allValues), rawMax = Math.max(...allValues), padding = Math.max((rawMax - rawMin) * 0.1, 1000);
  const min = Math.floor((rawMin - padding) / 1000) * 1000, max = Math.ceil((rawMax + padding) / 1000) * 1000, span = max - min || 1;
  const x = index => (index / Math.max(history.length - 1, 1)) * 100;
  const y = value => 100 - ((value - min) / span) * 88 - 6;
  const points = list => list.map((value, index) => `${x(index)},${y(value)}`).join(' ');
  byId('chart').innerHTML = `<div class="chart-y-labels"><span>₹${max.toLocaleString('en-IN')}</span><span>₹${Math.round((min + max) / 2).toLocaleString('en-IN')}</span><span>₹${min.toLocaleString('en-IN')}</span></div><span class="zero-profit-label" style="top:${y(invested.at(-1))}%">₹0 profit/loss</span><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${points(invested)}" fill="none" stroke="#889692" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/><polyline points="${points(values)}" fill="none" stroke="${color}" stroke-width="2.3" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const count = Math.min(history.length, 4), indexes = [...new Set(Array.from({ length: count }, (_, index) => Math.round(index * (history.length - 1) / Math.max(count - 1, 1))))];
  byId('chartLabels').innerHTML = indexes.map(index => `<span style="left:${x(index)}%">${escapeHtml(history[index].date)}</span>`).join('');
}

function renderAdminTransactions() {
  const search = byId('adminSearch').value.trim().toLowerCase();
  const filtered = adminTransactions.filter(transaction => `${transaction.name} ${transaction.memberId}`.toLowerCase().includes(search));
  byId('adminCount').textContent = `${filtered.length} transaction${filtered.length === 1 ? '' : 's'} shown`;
  byId('adminTransactions').innerHTML = filtered.length ? filtered.map(t => `<article class="transaction-card"><div class="transaction-top"><div><strong>${escapeHtml(t.name)}</strong><span>${escapeHtml(t.memberId)}</span></div><strong>${money(t.totalAmount)}</strong></div><div class="transaction-detail"><span>${escapeHtml(t.month)} ${escapeHtml(t.year)} · ${escapeHtml(t.date)}</span><span>SSF ${money(t.ssfAmount)} · SIF ${money(t.sifAmount)}</span></div>${t.sendReport ? `<button class="report-button" data-transaction-index="${adminTransactions.indexOf(t)}" ${t.whatsAppNumber ? '' : 'disabled'}>${t.whatsAppNumber ? 'Send report' : 'No WhatsApp number'}</button>` : ''}</article>`).join('') : '<p class="muted-copy">No matching transactions.</p>';
}

function sendReport(transaction) {
  const digits = String(transaction.whatsAppNumber || '').replace(/\D/g, '');
  const phone = digits.length === 10 ? `91${digits}` : digits;
  if (phone.length < 11) return alert('This member does not have a valid WhatsApp Number in the Members sheet.');
  const message = transaction.isInvestmentAdjustment
    ? `Dear ${transaction.name},\n\nYour SMF contribution of ${money(transaction.totalAmount)} dated ${transaction.date} has been recorded.\n\nThis payment relates to an investment amount adjusted from a previous month’s contribution. Please make future contributions on time to maintain SIP investment discipline. Late payments affect investment planning; if delays continue, SMF may need to review or pause investment on your behalf.\n\nYou can check your contribution history, balance amount and investment details here:\n${APP_LINK}\n\nThank you for your cooperation.\n— Swabah Marriage Fund`
    : `Dear ${transaction.name},\n\nYour SMF contribution of ${money(transaction.totalAmount)} for ${transaction.month} ${transaction.year}, dated ${transaction.date}, has been successfully received and recorded.\n\nYou can check your contribution history, balance amount and investment details here:\n${APP_LINK}\n\nThank you for your timely contribution.\n— Swabah Marriage Fund`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
}

byId('loginForm').addEventListener('submit', event => { event.preventDefault(); signIn(byId('memberId').value); });
byId('logoutButton').addEventListener('click', logout);
byId('adminLogoutButton').addEventListener('click', logout);
byId('paymentsToggle').addEventListener('click', () => { showAllPayments = !showAllPayments; renderPayments(currentMember.payments); });
byId('adminSearch').addEventListener('input', renderAdminTransactions);
byId('adminTransactions').addEventListener('click', event => { const index = event.target.dataset.transactionIndex; if (index !== undefined) sendReport(adminTransactions[Number(index)]); });
document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab === button)); byId('generalPanel').classList.toggle('hidden', button.dataset.tab !== 'general'); byId('investmentPanel').classList.toggle('hidden', button.dataset.tab !== 'investment'); }));

function logout() { localStorage.removeItem('smfMemberId'); sessionStorage.removeItem('smfAdmin'); currentMember = null; adminTransactions = []; byId('memberId').value = ''; setLoginMessage(''); showOnly('loginScreen'); }
const savedMemberId = localStorage.getItem('smfMemberId'); if (savedMemberId) signIn(savedMemberId);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');
