const state = { user: null, items: [], kind: 'all' };

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || 'Something went wrong. Please try again.'); error.data = data; throw error; }
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
      ? `<a class="account-name" href="/profile">${escapeHtml(state.user.name)}</a><a class="account-action" href="/profile">Profile</a>${state.user.role === 'admin' ? '<a class="account-action" href="/admin">Admin</a>' : ''}<a class="account-action" href="#" data-logout>Log out</a>`
      : '<a class="account-action" href="/login">Log in</a><a class="account-action" href="/signup">Join</a>';
    target.querySelector('[data-logout]')?.addEventListener('click', async event => {
      event.preventDefault();
      try { await api('/api/auth/logout', { method: 'POST' }); location.href = '/'; }
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
    if (!/[A-Z]/.test(values.password) || !/[0-9]/.test(values.password) || !/[^A-Za-z0-9\s]/.test(values.password)) return message('Include one uppercase letter, one digit, and one special character in your password.');
    if (new TextEncoder().encode(values.password).length > 72) return message('Password must use at most 72 UTF-8 bytes.');
    if (values.password !== values.confirmPassword) return message('The passwords do not match.');
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    try {
      delete values.confirmPassword;
      const result = await api('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      sessionStorage.setItem('authEmail', values.email);
      sessionStorage.setItem('verificationNotice', result.message);
      location.href = '/verify';
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
      const destination = next === 'admin' ? '/admin' : ['/report-lost', '/report-found', '/admin'].includes(next) ? next : '/browse';
      setTimeout(() => location.href = destination, 500);
    } catch (error) {
      if (error.data?.verificationRequired) {
        sessionStorage.setItem('authEmail', form.elements.email.value);
        sessionStorage.setItem('verificationNotice', 'Verify your college email to continue. Request a code below.');
        location.href = '/verify'; return;
      }
      message(error.message); button.disabled = false;
    }
  });
}

function bindItemForm() {
  document.querySelector('#item-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!state.user) { location.href = `/login?next=${encodeURIComponent(location.pathname)}`; return; }
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
  if (!state.user) { container.innerHTML = '<div class="empty-state">Please <a href="/login">log in</a> to see and manage your posts.</div>'; return; }
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
    document.querySelector('#recent-items').innerHTML = latest.length ? latest.map(item => card(item)).join('') : '<div class="empty-state">No reports have been posted yet. Be the first to <a href="/report-lost">report an item</a>.</div>';
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
  initCodeForms();
  bindItemForm();
  initProfile();
  initFeedback();
  initAdmin();
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
  if (!state.user) { form.innerHTML = '<p>Please <a href="/login">sign in</a> to edit your profile.</p>'; return; }
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

function initFeedback() {
  const form = document.querySelector('#feedback-form');
  if (!form) return;
  form.hidden = !state.user;
  document.querySelector('#feedback-signin').hidden = Boolean(state.user);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const target = document.querySelector('#feedback-message');
    const button = form.querySelector('[type="submit"]');
    const text = form.elements.message.value.trim();
    if (text.length < 10 || text.length > 2000) { target.textContent = 'Please write between 10 and 2,000 characters.'; return; }
    button.disabled = true; button.textContent = 'Saving...'; target.textContent = ''; target.classList.remove('success');
    try {
      const result = await api('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: Number(form.elements.rating.value), message: text }) });
      form.reset(); target.textContent = result.message; target.classList.add('success');
    } catch (error) { target.textContent = error.message; }
    finally { button.disabled = false; button.textContent = 'Share feedback'; }
  });
}

function initCodeForms() {
  const form = document.querySelector('[data-code-form]');
  if (!form) return;
  const notice = document.querySelector('#verification-notice');
  if (notice) {
    notice.textContent = sessionStorage.getItem('verificationNotice') || 'Request a verification code, then enter the latest code from your college inbox.';
    sessionStorage.removeItem('verificationNotice');
  }
  form.elements.email.value = sessionStorage.getItem('authEmail') || '';
  const send = document.querySelector('#request-code');
  let busy = false;
  const setBusy = value => {
    busy = value;
    form.querySelectorAll('button').forEach(button => { button.disabled = value; });
  };
  send?.addEventListener('click', async () => {
    if (busy || !form.elements.email.reportValidity()) return;
    setBusy(true); message('Requesting email...');
    try {
      const email = form.elements.email.value.trim();
      sessionStorage.setItem('authEmail', email);
      const result = await api(form.dataset.codeForm === 'verify' ? '/api/auth/resend-verification' : '/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email })
      });
      message(result.message, true);
    } catch (error) { message(error.message); }
    finally { setBusy(false); }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    const values = Object.fromEntries(new FormData(form));
    if (values.password !== undefined && (values.password !== values.confirmPassword || new TextEncoder().encode(values.password).length > 72)) {
      return message('Passwords must match and use at most 72 UTF-8 bytes.');
    }
    setBusy(true); message('Checking code...');
    try {
      delete values.confirmPassword;
      const result = await api(form.dataset.codeForm === 'verify' ? '/api/auth/verify-email' : '/api/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values)
      });
      message(result.message, true);
      form.elements.code.value = '';
      if (form.elements.password) { form.elements.password.value = ''; form.elements.confirmPassword.value = ''; }
      document.querySelector('#auth-complete').hidden = false;
    } catch (error) { message(error.message); }
    finally { setBusy(false); }
  });
}

async function initAdmin() {
  const overview = document.querySelector('#admin-overview');
  if (!overview) return;
  const message = document.querySelector('#admin-message');
  try {
    const [counts, reports, comments] = await Promise.all([api('/api/admin/overview'), api('/api/admin/listings'), api('/api/admin/feedback')]);
    overview.innerHTML = [['students', 'Student accounts'], ['listings', 'Total listings'], ['feedback', 'Feedback received']].map(([key, title]) => `<div><strong>${escapeHtml(counts[key])}</strong><span>${title}</span></div>`).join('');
    document.querySelector('#admin-feedback').innerHTML = comments.feedback.length ? comments.feedback.map(item => `<article class="step-card"><span class="eyebrow eyebrow-dark">Rating ${escapeHtml(item.rating)} / 5</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.message)}</p><small>${escapeHtml(item.course)} &middot; ${escapeHtml(formattedDate(item.createdAt))}</small></article>`).join('') : '<p class="empty-state">No feedback has been submitted yet.</p>';
    document.querySelector('#admin-listings').innerHTML = reports.items.length ? reports.items.map(item => `<article class="step-card"><span class="eyebrow eyebrow-dark">${escapeHtml(item.kind)} &middot; ${escapeHtml(item.status)}</span><h3><a href="/browse?id=${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a></h3><p>${escapeHtml(item.description)}</p><small>${escapeHtml(item.name)} &middot; ${escapeHtml(item.category)} &middot; ${escapeHtml(item.location)}</small></article>`).join('') : '<p class="empty-state">No listings have been posted yet.</p>';
  } catch (error) {
    overview.textContent = ''; message.textContent = error.message;
    document.querySelectorAll('#admin-feedback, #admin-listings').forEach(target => { target.textContent = 'Unable to load. Refresh to try again.'; });
  }
}
