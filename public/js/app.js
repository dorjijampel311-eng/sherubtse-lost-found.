const state = { user: null, items: [], kind: 'all' };

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function message(text, success = false) {
  const element = document.querySelector('#form-message');
  if (!element) return;
  element.textContent = text;
  element.classList.toggle('success', success);
}

async function loadAccount() {
  try { state.user = (await api('/api/auth/me')).user; } catch { state.user = null; }
  const target = document.querySelector('[data-account]');
  if (target) {
    target.innerHTML = state.user
      ? `<a class="account-name" href="profile.html">${escapeHtml(state.user.name)}</a><a class="account-action" href="profile.html">Profile</a><a class="account-action" href="#" data-logout>Log out</a>`
      : '<a class="account-action" href="login.html">Log in</a><a class="account-action" href="signup.html">Join</a>';
    target.querySelector('[data-logout]')?.addEventListener('click', async event => {
      event.preventDefault();
      try { await api('/api/auth/logout', { method: 'POST' }); location.href = 'index.html'; }
      catch (error) { alert(error.message); }
    });
  }
  document.querySelectorAll('[data-auth-link]').forEach(link => { link.hidden = !state.user; });
}

function formattedDate(value) {
  if (!value) return '';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function card(item, manageable = false) {
  const kindLabel = item.kind === 'lost' ? 'Lost' : 'Found';
  const badge = item.status === 'returned' ? 'Returned' : kindLabel;
  const statusClass = item.status === 'returned' ? 'status-returned' : `status-${item.kind}`;
  const photo = item.hasPhoto
    ? `<img class="item-photo" src="/api/items/${encodeURIComponent(item.id)}/photo" alt="Photo of ${escapeHtml(item.title)}" loading="lazy">`
    : '<div class="item-photo-placeholder" aria-hidden="true">⌕</div>';
  const phone = item.phonePublic && item.phone ? `<a class="item-contact" href="tel:${encodeURIComponent(item.phone)}">Call ${escapeHtml(item.phone)}</a>` : '';
  const tools = manageable && item.status !== 'returned'
    ? `<div class="item-actions"><button class="button button-small button-navy" data-return="${escapeHtml(item.id)}">Mark returned</button><button class="button button-small button-danger" data-delete="${escapeHtml(item.id)}">Delete post</button></div>`
    : manageable ? `<div class="item-actions"><button class="button button-small button-danger" data-delete="${escapeHtml(item.id)}">Delete post</button></div>` : '';
  return `<article class="item-card" id="item-${escapeHtml(item.id)}">${photo}<div class="item-card-body"><div class="item-topline"><span class="status-badge ${statusClass}">${badge}</span><span class="category-badge">${escapeHtml(item.category)}</span></div><h3>${escapeHtml(item.title)}</h3><p class="item-description">${escapeHtml(item.description || 'No additional description was provided.')}</p><div class="item-meta"><span><b>Location</b> ${escapeHtml(item.location)}</span><span><b>Date</b> ${escapeHtml(formattedDate(item.itemDate))}</span><span><b>Posted by</b> ${escapeHtml(item.name)} · ${escapeHtml(item.course)}</span></div>${item.email ? `<a class="item-contact" href="mailto:${escapeHtml(item.email)}">Email poster</a>` : `<span class="muted">Sign in to see the poster&#39;s college email.</span>`}${phone}${tools}</div></article>`;
}

async function fetchItems(mine = false) {
  return (await api(`/api/items${mine ? '?mine=1' : (new URLSearchParams(location.search).get('id') ? '?id=' + encodeURIComponent(new URLSearchParams(location.search).get('id')) : '')}`)).items;
}

async function initBrowse() {
  const container = document.querySelector('#items-list');
  if (!container) return;
  const label = document.querySelector('#results-label');
  const empty = document.querySelector('#items-empty');
  try { state.items = await fetchItems(); renderBrowse(); }
  catch (error) { label.textContent = error.message; }
  document.querySelector('#item-search')?.addEventListener('input', renderBrowse);
  document.querySelector('#category-filter')?.addEventListener('change', renderBrowse);
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(item => item.classList.toggle('active', item === button));
    state.kind = button.dataset.filter;
    renderBrowse();
  }));
  function renderBrowse() {
    const query = (document.querySelector('#item-search')?.value || '').trim().toLowerCase();
    const category = document.querySelector('#category-filter')?.value || '';
    const matching = state.items.filter(item => (state.kind === 'all' || item.kind === state.kind)
      && (!category || item.category === category)
      && (!query || [item.title, item.category, item.location, item.description, item.course].join(' ').toLowerCase().includes(query)));
    label.textContent = `${matching.length} ${matching.length === 1 ? 'listing' : 'listings'}`;
    container.innerHTML = matching.map(item => card(item)).join('');
    empty.hidden = matching.length !== 0;
  }
}

function bindAuthForms() {
  document.querySelector('#signup-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    if (!/^\d{8}$/.test(values.studentId) || values.email !== `${values.studentId}.sherubtse@rub.edu.bt`) return message('Use your 8-digit student number and its matching college email.');
    values.notificationsEnabled = values.notificationsEnabled === 'on';
    if (new TextEncoder().encode(values.password).length > 72) return message('Password must use at most 72 UTF-8 bytes.');
    if (values.password !== values.confirmPassword) return message('The passwords do not match.');
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    try {
      delete values.confirmPassword;
      await api('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      message('Account created. You are now logged in.', true);
      setTimeout(() => location.href = 'browse.html', 650);
    } catch (error) { message(error.message); button.disabled = false; }
  });
  document.querySelector('#login-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    try {
      await api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      message('You are logged in. Opening the listings…', true);
      const next = new URLSearchParams(location.search).get('next');
      const destination = ['report-lost.html', 'report-found.html'].includes(next) ? next : 'browse.html';
      setTimeout(() => location.href = destination, 500);
    } catch (error) { message(error.message); button.disabled = false; }
  });
}

function bindItemForm() {
  document.querySelector('#item-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!state.user) { location.href = `login.html?next=${encodeURIComponent(location.pathname.split('/').pop())}`; return; }
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    const values = new FormData(form);
    if (!validPhoto(form)) { button.disabled = false; return; }
    button.textContent = 'Saving post and checking notifications...';
    try {
      const result = await fetch('/api/items', { method: 'POST', credentials: 'same-origin', body: values });
      const data = await result.json().catch(() => ({}));
      if (!result.ok) throw new Error(data.error || 'Your report could not be posted.');
      message(data.notification?.message || 'Your item has been posted. You can manage it from My posts.', !data.notification || !['failed', 'unconfigured'].includes(data.notification.status));
      button.disabled = false; button.textContent = 'Post another item';
      form.reset();
      // Keep the notification result visible.
    } catch (error) { message(error.message); button.disabled = false; button.textContent = 'Post item'; }
  });
}

async function initMyItems() {
  const container = document.querySelector('#my-items-list');
  if (!container) return;
  const empty = document.querySelector('#my-items-empty');
  container.innerHTML = '<div class="empty-state">Loading your posts...</div>';
  if (!state.user) { container.innerHTML = '<div class="empty-state">Please <a href="login.html">log in</a> to see and manage your posts.</div>'; return; }
  try {
    const items = await fetchItems(true);
    container.innerHTML = items.map(item => card(item, true)).join('');
    empty.hidden = items.length !== 0;
    container.onclick = async event => {
      const remove = event.target.closest('[data-delete]');
      const returned = event.target.closest('[data-return]');
      if (!remove && !returned) return;
      const id = (remove || returned).dataset[remove ? 'delete' : 'return'];
      if (remove && !confirm('Delete this listing permanently?')) return;
      try {
        if (remove) await api(`/api/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
        else await api(`/api/items/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'returned' }) });
        await initMyItems();
      } catch (error) { alert(error.message); }
    };
  } catch (error) { container.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; }
}

async function initHome() {
  if (!document.querySelector('#recent-items')) return;
  try {
    const [items, stats] = await Promise.all([fetchItems(), api('/api/stats')]);
    document.querySelector('#stat-lost').textContent = stats.lost;
    document.querySelector('#stat-found').textContent = stats.found;
    document.querySelector('#stat-returned').textContent = stats.returned;
    const latest = items.slice(0, 3);
    document.querySelector('#recent-items').innerHTML = latest.length ? latest.map(item => card(item)).join('') : '<div class="empty-state">No reports have been posted yet. Be the first to <a href="report-lost.html">report an item</a>.</div>';
  } catch { document.querySelector('#recent-items').innerHTML = '<div class="empty-state">Listings will appear here when the service is connected.</div>'; }
}

function initMobileMenu() {
  const button = document.querySelector('.menu-toggle');
  const links = document.querySelector('.nav-links');
  button?.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initMobileMenu();
  await loadAccount();
  bindAuthForms();
  bindItemForm();
  initProfile();
  await Promise.all([initBrowse(), initMyItems(), initHome()]);
});

function validPhoto(form) {
  const file = form.querySelector('[name="photo"]')?.files[0];
  if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024)) {
    message('Choose a JPG, PNG or WebP photo, up to 2 MB.'); return false;
  }
  return true;
}
function initProfile() {
  const form = document.querySelector('#profile-form');
  if (!form) return;
  if (!state.user) { form.innerHTML = '<p>Please <a href="login.html">sign in</a> to edit your profile.</p>'; return; }
  for (const name of ['name', 'phone', 'course', 'year']) form.elements[name].value = state.user[name];
  document.querySelector('#profile-student').value = state.user.studentId;
  document.querySelector('#profile-email').value = state.user.email;
  form.elements.notificationsEnabled.checked = state.user.notificationsEnabled;
  const photo = document.querySelector('#profile-photo');
  if (state.user.hasPhoto) { photo.src = '/api/profile/photo'; photo.hidden = false; }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!validPhoto(form)) return;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true; button.textContent = 'Saving...';
    const values = new FormData(form);
    values.set('notificationsEnabled', String(form.elements.notificationsEnabled.checked));
    try {
      state.user = (await api('/api/profile', { method: 'PUT', body: values })).user;
      message('Profile saved.', true);
      if (state.user.hasPhoto) { photo.src = `/api/profile/photo?t=${Date.now()}`; photo.hidden = false; }
      await loadAccount();
    } catch (error) { message(error.message); }
    finally { button.disabled = false; button.textContent = 'Save profile'; }
  });
}
