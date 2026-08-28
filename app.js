const byId = id => document.getElementById(id);
const money = value =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(Number(value || 0));

const endpoint = window.SMF_CONFIG?.apiUrl || '';
let currentMember = null;
let showAllPayments = false;

async function api(action, params = {}) {
  if (!endpoint || endpoint.includes('PASTE_YOUR')) {
    throw new Error('The SMF data service has not been connected yet.');
  }

  const url = new URL(endpoint);
  url.searchParams.set('action', action);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Could not connect to the SMF data service.');
  }

  const payload = await response.json();

  if (!payload.ok) {
    throw new Error(payload.message || 'Your Membership ID could not be found.');
  }

  return payload.data;
}

function setLoginMessage(message = '') {
  byId('loginMessage').textContent = message;
}

async function signIn(memberId) {
  const id = memberId.trim().toUpperCase();
  if (!id) return;

  setLoginMessage('Checking Membership ID…');

  try {
    currentMember = await api('member', { memberId: id });
    localStorage.setItem('smfMemberId', id);
    showMember();
  } catch (error) {
    setLoginMessage(error.message);
  }
}

function showMember() {
  const { member, summary, payments, announcements } = currentMember;

  byId('memberName').textContent = member.name;
  byId('memberIdText').textContent = member.id;
  byId('updatedText').textContent =
    `Last updated: ${summary.lastUpdated || 'Not available'}`;

  byId('totalPaid').textContent = money(summary.totalPaid);
  byId('monthsPaid').textContent = `${summary.monthsPaid || 0} months paid`;
  byId('ssfTotal').textContent = money(summary.ssfTotal);
  byId('sifTotal').textContent = money(summary.sifTotal);

  const hasWithdrawal = Number(summary.withdrawn || 0) > 0;

  byId('withdrawalSummary').classList.toggle('hidden', !hasWithdrawal);

  if (hasWithdrawal) {
  byId('withdrawnAmount').textContent = money(summary.withdrawn);

  // Sheet stores payable balance as a negative amount.
  // App shows the amount due without the minus sign.
  byId('balanceToPay').textContent =
    money(Math.abs(Number(summary.balanceToPay || 0)));
}

byId('paymentStatus').textContent =
  hasWithdrawal && Number(summary.balanceToPay || 0) < 0
    ? 'Balance payment due'
    : 'Up to date';

  showAllPayments = false;
  renderPayments(payments);

  byId('announcementsList').innerHTML = announcements.length
    ? announcements.map(a => `
        <article class="announcement">
          <strong>${a.title}</strong>
          <p>${a.message}</p>
        </article>
      `).join('')
    : '<p class="muted-copy">No current announcements.</p>';

  byId('loginScreen').classList.add('hidden');
  byId('memberScreen').classList.remove('hidden');

  loadInvestment(currentMember.investment, Number(summary.sifTotal || 0));
}

function renderPayments(payments) {
  const visiblePayments = showAllPayments ? payments : payments.slice(0, 3);

  byId('paymentsList').innerHTML = payments.length
    ? visiblePayments.map(p => `
        <article class="payment">
          <div>
            <p>${p.month} ${p.year}</p>
            <span>${p.date || 'Date not recorded'}</span>
          </div>
          <strong>${money(p.totalAmount)}</strong>
        </article>
      `).join('')
    : '<p class="muted-copy">No contribution payments have been recorded yet.</p>';

  byId('paymentsToggle').classList.toggle('hidden', payments.length <= 3);
  byId('paymentsToggle').textContent =
    showAllPayments ? 'Show less' : 'View all';
}

async function loadInvestment(investment, memberSifTotal) {
  const empty = memberSifTotal <= 0;

  byId('noInvestment').classList.toggle('hidden', !empty);
  byId('investmentContent').classList.toggle('hidden', empty);

  if (empty) return;

  const hasPersonalSummary =
    investment && Number(investment.totalInvested || 0) > 0;

  if (hasPersonalSummary) {
    byId('fundValue').textContent = money(investment.currentValue);
    byId('fundDate').textContent =
      `Updated ${investment.lastUpdated || 'Not available'}`;
    byId('investedAmount').textContent = money(investment.totalInvested);
    byId('profitLoss').textContent =
      `${Number(investment.profitLoss) < 0 ? '−' : '+'}${money(Math.abs(Number(investment.profitLoss)))}`;
    byId('returnPercent').textContent =
      `${Number(investment.returnPercent) < 0 ? '' : '+'}${(Number(investment.returnPercent) * 100).toFixed(2)}%`;
    byId('investmentStatus').textContent =
      Number(investment.profitLoss) < 0 ? 'Loss' : 'Profit';

    byId('profitCard').className =
      `profit-card ${Number(investment.profitLoss) < 0 ? 'loss' : 'profit'}`;
  }

  try {
    const history = await api('investment');

    if (!history.length) {
      throw new Error('Investment history is not available yet.');
    }

    renderInvestment(history);
  } catch (error) {
    byId('investmentContent').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">!</div>
        <h3>Investment data unavailable</h3>
        <p>${error.message}</p>
      </div>`;
  }
}

function renderInvestment(history) {
  const latest = history.at(-1);
  const profitLoss = Number(latest.profitLoss);
  const color = profitLoss < 0 ? '#c83a3a' : '#137547';

  byId('chartLegend').textContent =
    profitLoss < 0 ? 'Loss' : 'Profit';

  document.querySelector('.legend i').style.background = color;

  const values = history.map(row => Number(row.currentTotalValue));
  const investedValues = history.map(row => Number(row.totalSifInvested));

  const allValues = [...values, ...investedValues];
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const padding = Math.max((rawMax - rawMin) * 0.1, 1000);

  const minValue = Math.floor((rawMin - padding) / 1000) * 1000;
  const maxValue = Math.ceil((rawMax + padding) / 1000) * 1000;
  const range = maxValue - minValue || 1;

  const pointX = index =>
    (index / Math.max(history.length - 1, 1)) * 100;

  const pointY = value =>
    100 - ((value - minValue) / range) * 88 - 6;

  const currentPoints = values
    .map((value, index) => `${pointX(index)},${pointY(value)}`)
    .join(' ');

  const breakEvenPoints = investedValues
    .map((value, index) => `${pointX(index)},${pointY(value)}`)
    .join(' ');

  const middleValue = Math.round((minValue + maxValue) / 2);
  const zeroProfitY = pointY(investedValues.at(-1));

  const formatAxis = value =>
    `₹${Math.round(value).toLocaleString('en-IN')}`;

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
        points="${currentPoints}"
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
      (_, index) =>
        Math.round(index * (history.length - 1) / Math.max(tickCount - 1, 1))
    )
  )];

  byId('chartLabels').innerHTML = tickIndexes.map(index => `
    <span style="left:${pointX(index)}%">
      ${history[index].date}
    </span>
  `).join('');
}

byId('loginForm').addEventListener('submit', event => {
  event.preventDefault();
  signIn(byId('memberId').value);
});

byId('logoutButton').addEventListener('click', () => {
  localStorage.removeItem('smfMemberId');
  currentMember = null;
  byId('memberScreen').classList.add('hidden');
  byId('loginScreen').classList.remove('hidden');
  setLoginMessage('');
});

byId('paymentsToggle').addEventListener('click', () => {
  showAllPayments = !showAllPayments;
  renderPayments(currentMember.payments);
});

document.querySelectorAll('.tab').forEach(button =>
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(tab =>
      tab.classList.toggle('active', tab === button)
    );

    byId('generalPanel').classList.toggle(
      'hidden',
      button.dataset.tab !== 'general'
    );

    byId('investmentPanel').classList.toggle(
      'hidden',
      button.dataset.tab !== 'investment'
    );
  })
);

const savedMemberId = localStorage.getItem('smfMemberId');

if (savedMemberId) {
  signIn(savedMemberId);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js');
}
