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

function card(item) {
  const manageable = Boolean(state.user && item.ownerId != null && String(item.ownerId) === String(state.user.id));
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
  return `<article class="item-card" id="item-${escapeHtml(item.id)}">${photo}<div class="item-card-body"><div class="item-topline"><span class="status-badge ${statusClass}">${badge}</span><span class="category-badge">${escapeHtml(item.category)}</span></div><h3>${escapeHtml(item.title)}</h3><p class="item-description">${escapeHtml(item.description || 'No additional description was provided.')}</p><div class="item-meta"><span><b>Location</b> ${escapeHtml(item.location)}</span><span><b>Date</b> ${escapeHtml(formattedDate(item.itemDate))}</span><span><b>Posted by</b> ${escapeHtml(item.name)} · ${escapeHtml(item.course)}</span></div>${item.email ? `<a class="item-contact" href="mailto:${escapeHtml(item.email)}">Email poster</a>` : `<span class="muted">Sign in to see the poster&#39;s college email.</span>`}${phone}${tools}${item.status === 'returned' && item.deleteAfter ? `<p class="return-expiry">Scheduled for automatic deletion after ${escapeHtml(new Date(item.deleteAfter).toLocaleString())}, including comments and photo.</p>` : ''}${commentSection(item)}</div></article>`;
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
  bindListingActions(container, async () => { state.items = await fetchItems(); renderBrowse(); });
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
  const loginForm = document.querySelector('#login-form');
  const loginNotice = sessionStorage.getItem('loginNotice');
  if (loginForm && loginNotice) {
    loginForm.elements.email.value = sessionStorage.getItem('authEmail') || '';
    message(loginNotice, true);
    sessionStorage.removeItem('loginNotice');
  }
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
    if (!form.elements.phonePublic.checked) return message('Phone sharing is required. Confirm that your number will be shown publicly on this listing.');
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
    container.innerHTML = items.map(item => card(item)).join('');
    empty.hidden = items.length !== 0;
    bindListingActions(container, initMyItems);
  } catch (error) { container.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; }
}

async function initHome() {
  if (!document.querySelector('#recent-items')) return;
  try {
    const [items, stats] = await Promise.all([fetchItems(), api('/api/stats')]);
    document.querySelector('#stat-lost').textContent = stats.lost;
    document.querySelector('#stat-found').textContent = stats.found;
    document.querySelector('#stat-returned').textContent = stats.returned;    const latest = items.slice(0, 3);
    bindListingActions(document.querySelector('#recent-items'), initHome);
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
  initPasswordToggles();
  initDateFields();
  initMobileMenu();
  await loadAccount();
  initComments();
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
  if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 30 * 1024 * 1024)) {
    message('Choose a JPG, PNG or WebP photo, up to 30 MB.'); return false;
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
      if (form.dataset.codeForm === 'verify') {
        sessionStorage.setItem('authEmail', values.email.trim().toLowerCase());
        sessionStorage.setItem('loginNotice', 'Email verified successfully. Sign in to continue.');
        location.replace('/login');
        return;
      }
      if (form.elements.password) { form.elements.password.value = ''; form.elements.confirmPassword.value = ''; }
      document.querySelector('#auth-complete').hidden = false;
    } catch (error) { message(error.message); }
    finally { setBusy(false); }
  });
}

function adminListingCard(item) {
  return `<article class="step-card"><span class="eyebrow eyebrow-dark">${escapeHtml(item.kind)} &middot; ${escapeHtml(item.status)} &middot; #${escapeHtml(item.id)}</span><h3><a href="/browse?id=${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a></h3>${item.hasPhoto ? `<img class="admin-listing-photo" src="/api/items/${encodeURIComponent(item.id)}/photo" alt="Photo of ${escapeHtml(item.title)}" loading="lazy">` : ''}<p>${escapeHtml(item.description)}</p><small>${escapeHtml(item.name)} &middot; ${escapeHtml(item.category)} &middot; ${escapeHtml(item.location)} &middot; ${escapeHtml(formattedDate(item.itemDate))}</small><div class="item-actions"><button type="button" class="button button-small button-navy" data-admin-edit="${escapeHtml(item.id)}">Edit listing</button><button type="button" class="button button-small button-danger" data-admin-delete="${escapeHtml(item.id)}">Delete listing</button></div></article>`;
}
async function initAdmin() {
  const overview = document.querySelector('#admin-overview');
  if (!overview) return;
  const message = document.querySelector('#admin-message');
  const listings = document.querySelector('#admin-listings');
  const more = document.querySelector('#admin-more');
  const search = document.querySelector('#admin-listing-search');
  const dialog = document.querySelector('#admin-edit-dialog');
  const form = document.querySelector('#admin-edit-form');
  const editorMessage = document.querySelector('#admin-edit-message');
  const close = document.querySelector('#admin-edit-close');
  let cursor = null, sequence = 0, editingId = null, saving = false;
  const feedback = document.querySelector('#admin-feedback');
  const notify = (text, success = false) => { message.textContent = text; message.classList.toggle('success', success); };
  const loadOverview = async () => {
    const counts = await api('/api/admin/overview');
    overview.innerHTML = [['students', 'Student accounts'], ['listings', 'Total listings'], ['feedback', 'Feedback received']].map(([key, title]) => `<div><strong>${escapeHtml(counts[key])}</strong><span>${title}</span></div>`).join('');
  };
  const loadListings = async (append = false) => {
    const request = ++sequence; more.disabled = true;
    try {
      const params = new URLSearchParams({ search: search.value.trim() });
      if (append && cursor) params.set('before', cursor);
      const result = await api('/api/admin/listings?' + params);
      if (request !== sequence) return;
      const html = result.items.map(adminListingCard).join('');
      if (append) listings.insertAdjacentHTML('beforeend', html);
      else listings.innerHTML = html || '<p class="empty-state">No matching listings.</p>';
      cursor = result.nextCursor; more.hidden = !result.hasMore; return true;
    } catch (error) { if (request === sequence) { notify(error.message); if (!append) listings.innerHTML = '<p class="empty-state">Unable to load listings. Search again to retry.</p>'; } return false; }
    finally { if (request === sequence) more.disabled = false; }
  };
  document.querySelector('#admin-search-form').addEventListener('submit', event => { event.preventDefault(); void loadListings(); });
  more.addEventListener('click', () => { void loadListings(true); });
  close.addEventListener('click', () => { if (!saving) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  listings.onclick = async event => {
    const edit = event.target.closest('[data-admin-edit]');
    const remove = event.target.closest('[data-admin-delete]');
    const button = edit || remove;
    if (!button || button.disabled) return;
    const id = button.dataset[edit ? 'adminEdit' : 'adminDelete'];
    if (remove && !confirm('Permanently delete this listing, all of its comments and its uploaded photo?')) return;
    button.disabled = true;
    try {
      if (remove) {
        await api(`/api/admin/listings/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed: true }) });
        const [refreshed] = await Promise.all([loadListings(), loadOverview()]); notify('Listing, comments and photo deleted.' + (refreshed ? '' : ' Refresh to reload the list.'), true);
      } else {
        notify('Loading listing...');
        const { item } = await api(`/api/admin/listings/${encodeURIComponent(id)}`);
        form.reset(); editingId = item.id;
        for (const name of ['title','description','category','location','kind']) form.elements[name].value = item[name];
        form.elements.itemDate.value = String(item.itemDate).slice(0,10);
        form.elements.itemDate.dispatchEvent(new Event('change', { bubbles: true }));
        const photo = document.querySelector('#admin-current-photo'); photo.hidden = !item.hasPhoto;
        if (item.hasPhoto) photo.src = `/api/items/${encodeURIComponent(item.id)}/photo?v=${Date.now()}`; else photo.removeAttribute('src');
        editorMessage.textContent = ''; notify(''); dialog.showModal();
      }
    } catch (error) { notify(error.message); }
    finally { button.disabled = false; }
  };
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (saving || !editingId) return;
    const file = form.elements.photo.files[0];
    if (file && (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>30*1024*1024)) { editorMessage.textContent = 'Choose a JPG, PNG or WebP photo, up to 30 MB.'; return; }
    if (file && form.elements.removePhoto.checked) { editorMessage.textContent = 'Choose either a replacement photo or remove photo, not both.'; return; }
    const button = form.querySelector('[type="submit"]'); saving = true; button.disabled = true; close.disabled = true; button.textContent = 'Saving...'; editorMessage.textContent = '';
    try {
      await api(`/api/admin/listings/${encodeURIComponent(editingId)}`, { method: 'PUT', body: new FormData(form) });
      dialog.close(); const [refreshed] = await Promise.all([loadListings(), loadOverview()]); notify('Listing updated.' + (refreshed ? '' : ' Refresh to reload the list.'), true);
    } catch (error) { editorMessage.textContent = error.message; }
    finally { saving = false; button.disabled = false; close.disabled = false; button.textContent = 'Save changes'; }
  });
  try {
    await Promise.all([loadOverview(), loadListings(), (async () => {
      const comments = await api('/api/admin/feedback');
      feedback.innerHTML = comments.feedback.length ? comments.feedback.map(item => `<article class="step-card"><span class="eyebrow eyebrow-dark">Rating ${escapeHtml(item.rating)} / 5</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.message)}</p><small>${escapeHtml(item.course)} &middot; ${escapeHtml(formattedDate(item.createdAt))}</small></article>`).join('') : '<p class="empty-state">No feedback has been submitted yet.</p>';
    })()]);
  } catch (error) { overview.textContent = ''; notify(error.message); feedback.textContent = 'Unable to load. Refresh to try again.'; }
}

function bindListingActions(container, refresh) {
  container.onclick = async event => {
    const remove = event.target.closest('[data-delete]');
    const returned = event.target.closest('[data-return]');
    const button = remove || returned;
    if (!button || button.disabled) return;
    const id = button.dataset[remove ? 'delete' : 'return'];
    if (remove && !confirm('Delete this listing permanently?')) return;
    if (returned && !confirm('Mark this item as returned? This post, its comments and photo will be deleted automatically after 7 days.')) return;
    const originalLabel = button.textContent;
    button.disabled = true; button.textContent = remove ? 'Deleting...' : 'Updating...';
    try {
      if (remove) await api(`/api/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
      else await api(`/api/items/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'returned', confirmed: true }) });
      await refresh();
    } catch (error) { alert(error.message); }
    finally { button.disabled = false; button.textContent = originalLabel; }
  };
}

function initPasswordToggles() {
  const eye = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const eyeOff = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m3 3 18 18M10.6 5.1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.1 3.8M6.2 6.2A22 22 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 5.1-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  let index = 0;
  document.querySelectorAll('input[type="password"]').forEach(input => {
    if (input.dataset.passwordToggle === 'true') return;
    input.dataset.passwordToggle = 'true';
    if (!input.id) {
      do { index++; } while (document.getElementById(`password-field-${index}`));
      input.id = `password-field-${index}`;
    }
    const wrapper = document.createElement('span'); wrapper.className = 'password-control';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'password-toggle';
    button.disabled = input.disabled;
    button.setAttribute('aria-controls', input.id);
    const field = input.name === 'confirmPassword' ? 'confirm password' : 'password';
    const update = visible => {
      input.type = visible ? 'text' : 'password';
      button.setAttribute('aria-label', `${visible ? 'Hide' : 'Show'} ${field}`);
      button.setAttribute('aria-pressed', String(visible));
      button.title = `${visible ? 'Hide' : 'Show'} ${field}`;
      button.innerHTML = visible ? eyeOff : eye;
    };
    update(false);
    button.addEventListener('click', event => { event.preventDefault(); update(input.type === 'password'); });
    input.form?.addEventListener('reset', () => update(false));
    input.before(wrapper); wrapper.append(input, button);
  });
}

function dateInputISO(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match || Number(match[3]) < 1) return '';
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(`${iso}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === iso ? iso : '';
}
function dateInputDisplay(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}
function initDateFields() {
  document.querySelectorAll('[data-date-format="dmy"]').forEach(control => {
    const display = control.querySelector('[data-date-display]');
    const picker = control.querySelector('input[type="date"]');
    const fromPicker = () => { display.value = dateInputDisplay(picker.value); display.setCustomValidity(''); };
    fromPicker();
    display.addEventListener('input', () => {
      picker.value = dateInputISO(display.value);
      display.setCustomValidity(display.value.trim() && !picker.value ? 'Enter a valid date as DD/MM/YYYY.' : '');
    });
    picker.addEventListener('input', fromPicker);
    picker.addEventListener('change', fromPicker);
    picker.addEventListener('click', event => {
      if (typeof picker.showPicker === 'function') {
        try { picker.showPicker(); event.preventDefault(); } catch { /* Native calendar remains the fallback. */ }
      }
    });
    picker.form?.addEventListener('reset', () => queueMicrotask(fromPicker));
  });
}

function commentSection(item) {
  return `<details class="item-comments" data-comments-item="${escapeHtml(item.id)}"><summary>Comments (<span data-comment-count>${escapeHtml(item.commentCount || 0)}</span>)</summary><div data-comments-body><p class="muted">Loading comments...</p></div></details>`;
}
function commentRows(comments) {
  return comments.map(comment => {
    const own = Boolean(state.user && comment.userId != null && String(comment.userId) === String(state.user.id));
    const remove = own ? `<button type="button" class="comment-delete" data-delete-comment="${escapeHtml(comment.id)}" aria-label="Delete your comment">Delete</button>` : '';
    return `<article class="comment-row"><div class="comment-topline"><button type="button" class="comment-author" aria-haspopup="dialog" data-commenter="${escapeHtml(comment.userId)}">${escapeHtml(comment.name)}</button><time datetime="${escapeHtml(comment.createdAt)}">${escapeHtml(new Date(comment.createdAt).toLocaleString())}</time>${remove}</div><p>${escapeHtml(comment.body)}</p></article>`;
  }).join('');
}
async function loadComments(details, notice = '') {
  const target = details.querySelector('[data-comments-body]');
  target.setAttribute('aria-busy','true');
  try {
    const result = await api(`/api/items/${encodeURIComponent(details.dataset.commentsItem)}/comments`);
    if (!details.isConnected) return;
    details.querySelector('[data-comment-count]').textContent = String(result.total);
    target.innerHTML = `<div data-comment-list>${result.comments.length ? commentRows(result.comments) : '<p class="muted" data-comments-empty>No comments yet. Start the conversation.</p>'}</div>${result.hasMore ? `<button type="button" class="comment-older" data-comments-before="${escapeHtml(result.nextCursor)}">Load earlier comments</button>` : ''}${state.user ? `<form class="comment-form"><label>Add a comment<textarea name="body" rows="2" maxlength="1000" required placeholder="Share an update or ask about this item"></textarea></label><p class="comment-privacy">Comments are public. Signed-in students can tap your name to view your phone, course and academic year.</p><button type="submit" class="button button-small button-navy">Post comment</button><p class="form-message${notice ? ' success' : ''}" data-comment-message role="status">${escapeHtml(notice)}</p></form>` : '<p class="comment-privacy"><a href="/login">Sign in</a> to leave a comment or view a commenter?s contact details.</p>'}`;
    details.dataset.commentsLoaded = 'true';
  } catch (error) { target.innerHTML = `<p class="form-message" role="alert">${escapeHtml(error.message)}</p><button type="button" class="button button-small button-navy" data-comments-retry>Retry</button>`; }
  finally { target.removeAttribute('aria-busy'); }
}
function initComments() {
  const dialog = document.createElement('dialog'); dialog.className = 'commenter-dialog';
  dialog.setAttribute('aria-labelledby','commenter-heading');
  dialog.innerHTML = '<button type="button" class="commenter-close" aria-label="Close student profile">&times;</button><h2 id="commenter-heading">Student profile</h2><div data-commenter-content aria-live="polite"></div>';
  document.body.append(dialog);
  let profileRequest = 0;
  dialog.addEventListener('close', () => { profileRequest++; });
  dialog.querySelector('.commenter-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.addEventListener('toggle', event => {
    const details = event.target;
    if (details.matches?.('[data-comments-item]') && details.open && details.dataset.commentsLoaded !== 'true') loadComments(details);
  }, true);
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!form.matches('.comment-form')) return;
    event.preventDefault();
    const details = form.closest('[data-comments-item]');
    const button = form.querySelector('[type="submit"]'); const message = form.querySelector('[data-comment-message]');
    const body = form.elements.body.value.trim();
    if (!body || body.length>1000) { message.textContent = 'Write between 1 and 1,000 characters.'; return; }
    if (button.disabled) return;
    button.disabled = true; button.textContent = 'Posting...'; message.textContent = '';
    try {
      await api(`/api/items/${encodeURIComponent(details.dataset.commentsItem)}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) });
      const count = details.querySelector('[data-comment-count]'); count.textContent = String(Number(count.textContent)+1);
      await loadComments(details, 'Comment posted.');
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; button.textContent = 'Post comment'; }
  });
  document.addEventListener('click', async event => {
    const removeComment = event.target.closest('[data-delete-comment]');
    if (removeComment) { await deleteOwnComment(removeComment); return; }
    const retry = event.target.closest('[data-comments-retry]');
    if (retry) { await loadComments(retry.closest('[data-comments-item]')); return; }
    const older = event.target.closest('[data-comments-before]');
    if (older && !older.disabled) {
      const details = older.closest('[data-comments-item]'); older.disabled = true;
      try {
        const result = await api(`/api/items/${encodeURIComponent(details.dataset.commentsItem)}/comments?before=${encodeURIComponent(older.dataset.commentsBefore)}`);
        details.querySelector('[data-comment-list]').insertAdjacentHTML('afterbegin', commentRows(result.comments));
        if (result.hasMore) older.dataset.commentsBefore = result.nextCursor; else older.remove();
      } catch (error) { alert(error.message); }
      finally { older.disabled = false; }
      return;
    }
    const author = event.target.closest('[data-commenter]');
    if (!author) return;
    const requestId = ++profileRequest;
    const content = dialog.querySelector('[data-commenter-content]');
    content.innerHTML = '<p class="muted">Loading profile...</p>'; dialog.showModal();
    if (!state.user) { content.innerHTML = '<p>Please <a href="/login">sign in</a> to view this student?s contact details.</p>'; return; }
    try {
      const details = author.closest('[data-comments-item]');
      const result = await api(`/api/items/${encodeURIComponent(details.dataset.commentsItem)}/commenters/${encodeURIComponent(author.dataset.commenter)}`);
      if (requestId !== profileRequest || !dialog.open) return;
      const user = result.user;
      content.innerHTML = `<h3>${escapeHtml(user.name)}</h3><dl><dt>Phone number</dt><dd><a href="tel:${encodeURIComponent(user.phone)}">${escapeHtml(user.phone)}</a></dd><dt>Course / programme</dt><dd>${escapeHtml(user.course)}</dd><dt>Academic year</dt><dd>${escapeHtml(user.year)}</dd></dl>`;
    } catch (error) { if (requestId === profileRequest && dialog.open) content.innerHTML = `<p class="form-message" role="alert">${escapeHtml(error.message)}</p>`; }
  });
}

async function deleteOwnComment(button) {
  if (button.disabled || !confirm('Delete your comment permanently?')) return;
  const details = button.closest('[data-comments-item]');
  const draft = details.querySelector('.comment-form textarea')?.value || '';
  button.disabled = true; button.textContent = 'Deleting...';
  try {
    await api(`/api/items/${encodeURIComponent(details.dataset.commentsItem)}/comments/${encodeURIComponent(button.dataset.deleteComment)}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed: true })
    });
    const count = details.querySelector('[data-comment-count]');
    if (count) count.textContent = String(Math.max(0, Number(count.textContent) - 1));
    await loadComments(details, 'Comment deleted.');
    const textarea = details.querySelector('.comment-form textarea');
    if (textarea) textarea.value = draft;
  } catch (error) {
    const message = details.querySelector('[data-comment-message]');
    if (message) { message.classList.remove('success'); message.textContent = error.message; }
    else alert(error.message);
  } finally { button.disabled = false; button.textContent = 'Delete'; }
}
