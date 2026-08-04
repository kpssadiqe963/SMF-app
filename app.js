const byId = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
const endpoint = window.SMF_CONFIG?.apiUrl || '';
let currentMember = null;
let showAllPayments = false;

async function api(action, params = {}) {
  if (!endpoint || endpoint.includes('PASTE_YOUR')) throw new Error('The SMF data service has not been connected yet. Add your Google Apps Script web-app URL in config.js.');
  const url = new URL(endpoint);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not connect to the SMF data service.');
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.message || 'Your Membership ID could not be found.');
  return payload.data;
}

function setLoginMessage(message = '') { byId('loginMessage').textContent = message; }
async function signIn(memberId) {
  const id = memberId.trim().toUpperCase();
  if (!id) return;
  setLoginMessage('Checking Membership ID…');
  try {
    currentMember = await api('member', { memberId: id });
    localStorage.setItem('smfMemberId', id);
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
  byId('pendingMonths').textContent = `${summary.pendingMonths || 0} pending`;
  byId('paymentStatus').textContent = Number(summary.pendingMonths || 0) ? 'Payment due' : 'Up to date';
  showAllPayments = false;
  renderPayments(payments);
  byId('announcementsList').innerHTML = announcements.length ? announcements.map(a => `<article class="announcement"><strong>${a.title}</strong><p>${a.message}</p></article>`).join('') : '<p class="muted-copy">No current announcements.</p>';
  byId('loginScreen').classList.add('hidden');
  byId('memberScreen').classList.remove('hidden');
  loadInvestment(currentMember.investment, Number(summary.sifTotal || 0));
}

function renderPayments(payments) {
  const visiblePayments = showAllPayments ? payments : payments.slice(0, 3);
  byId('paymentsList').innerHTML = payments.length ? visiblePayments.map(p => `<article class="payment"><div><p>${p.month} ${p.year}</p><span>${p.date || 'Date not recorded'}</span></div><strong>${money(p.totalAmount)}</strong></article>`).join('') : '<p class="muted-copy">No contribution payments have been recorded yet.</p>';
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
    byId('fundValue').textContent = money(investment.currentValue);
    byId('fundDate').textContent = `Updated ${investment.lastUpdated || 'Not available'}`;
    byId('investedAmount').textContent = money(investment.totalInvested);
    byId('profitLoss').textContent = `${Number(investment.profitLoss) < 0 ? '−' : '+'}${money(Math.abs(Number(investment.profitLoss)))}`;
    byId('returnPercent').textContent = `${Number(investment.returnPercent) < 0 ? '' : '+'}${(Number(investment.returnPercent) * 100).toFixed(2)}%`;
    byId('investmentStatus').textContent = Number(investment.profitLoss) < 0 ? 'Loss' : 'Profit';
    byId('profitCard').className = `profit-card ${Number(investment.profitLoss) < 0 ? 'loss' : 'profit'}`;
  } else {
    byId('fundValue').textContent = 'Updating';
    byId('fundDate').textContent = 'Personal investment summary is being refreshed';
    byId('investedAmount').textContent = money(memberSifTotal);
    byId('profitLoss').textContent = 'Not available';
    byId('returnPercent').textContent = '—';
    byId('investmentStatus').textContent = 'Updating';
  }
  try {
    const history = await api('investment');
    if (!history.length) throw new Error('Investment history is not available yet.');
    renderInvestment(history);
  } catch (error) { byId('investmentContent').innerHTML = `<div class="empty-state"><div class="empty-icon">!</div><h3>Investment data unavailable</h3><p>${error.message}</p></div>`; }
}
function renderInvestment(history) {
  const latest = history.at(-1);
  const diff = Number(latest.profitLoss);
  const color = diff < 0 ? '#c83a3a' : '#137547';

  byId('chartLegend').textContent = diff < 0 ? 'Loss' : 'Profit';
  document.querySelector('.legend i').style.background = color;

  const values = history.map(row => Number(row.currentTotalValue));
  const breakEvenValues = history.map(row => Number(row.totalSifInvested));

  const allValues = [...values, ...breakEvenValues];
  const minValue = Math.floor(Math.min(...allValues) / 1000) * 1000;
  const maxValue = Math.ceil(Math.max(...allValues) / 1000) * 1000;
  const range = maxValue - minValue || 1;

  const pointY = value => 100 - ((value - minValue) / range) * 88 - 6;
  const pointX = index => (index / Math.max(history.length - 1, 1)) * 100;

  const valuePoints = values
    .map((value, index) => `${pointX(index)},${pointY(value)}`)
    .join(' ');

  const breakEvenPoints = breakEvenValues
    .map((value, index) => `${pointX(index)},${pointY(value)}`)
    .join(' ');

  const formatAxis = value =>
    `₹${Math.round(value).toLocaleString('en-IN')}`;

  const middleValue = Math.round((minValue + maxValue) / 2);
  const zeroProfitY = pointY(breakEvenValues.at(-1));

  byId('chart').innerHTML = `
    <div class="chart-y-labels">
      <span>${formatAxis(maxValue)}</span>
      <span>${formatAxis(middleValue)}</span>
      <span>${formatAxis(minValue)}</span>
    </div>

    <span class="zero-profit-label" style="top:${zeroProfitY}%">
      ₹0 profit/loss
    </span>

    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline
        points="${breakEvenPoints}"
        fill="none"
        stroke="#889692"
        stroke-width="1"
        stroke-dasharray="3 3"
        vector-effect="non-scaling-stroke"
      />
      <polyline
        points="${valuePoints}"
        fill="none"
        stroke="${color}"
        stroke-width="2.3"
        vector-effect="non-scaling-stroke"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>`;

  const tickCount = Math.min(history.length, 4);
  const tickIndexes = [...new Set(
    Array.from(
      { length: tickCount },
      (_, index) => Math.round(index * (history.length - 1) / (tickCount - 1 || 1))
    )
  )];

  byId('chartLabels').innerHTML = tickIndexes
    .map(index =>
      `<span style="left:${pointX(index)}%">${history[index].date}</span>`
    )
    .join('');
}
