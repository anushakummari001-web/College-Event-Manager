(function () {
  'use strict';

  // ---------- State ----------
  let allEvents = [];
  let adminPassword = sessionStorage.getItem('adminPassword') || null;

  // ---------- Utilities ----------

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function showToast(message, isError) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.toggle('error', !!isError);
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.hidden = true; }, 3200);
  }

  function formatDate(dateStr, timeStr) {
    try {
      const d = new Date(dateStr + 'T' + (timeStr || '00:00'));
      const dateFmt = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      const timeFmt = timeStr ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
      return timeFmt ? `${dateFmt} · ${timeFmt}` : dateFmt;
    } catch (e) {
      return `${dateStr} ${timeStr || ''}`.trim();
    }
  }

  function eventCode(ev) {
    const dept = (ev.department || 'GEN').replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'GEN';
    const num = ev.id.slice(0, 3).toUpperCase();
    return `${dept}-${num}`;
  }

  async function api(url, opts) {
    opts = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const res = await fetch(url, Object.assign({}, opts, { headers }));
    let payload = null;
    try { payload = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const message = (payload && payload.error) || `Request failed (${res.status})`;
      throw new Error(message);
    }
    return payload;
  }

  function adminHeaders() {
    return adminPassword ? { 'X-Admin-Password': adminPassword } : {};
  }

  // ---------- Tabs ----------

  function initTabs() {
    $all('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        $all('.tab-btn').forEach((b) => b.classList.remove('active'));
        $all('.tab-panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        $('#tab-' + btn.dataset.tab).classList.add('active');
        closeAllModals();
      });
    });
  }

  // ---------- Browse events ----------

  async function loadEvents() {
    try {
      const data = await api('/api/events');
      allEvents = data.events;
      populateCategoryFilter();
      renderEventList();
    } catch (err) {
      showToast('Could not load events: ' + err.message, true);
    }
  }

  function populateCategoryFilter() {
    const select = $('#categoryFilter');
    const current = select.value;
    const categories = Array.from(new Set(allEvents.map((e) => e.category).filter(Boolean))).sort();
    select.innerHTML = '<option value="">All categories</option>' +
      categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    select.value = current;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderEventList() {
    const search = ($('#searchInput').value || '').trim().toLowerCase();
    const category = $('#categoryFilter').value;

    const filtered = allEvents.filter((ev) => {
      const matchesSearch = !search ||
        ev.title.toLowerCase().includes(search) ||
        (ev.department || '').toLowerCase().includes(search);
      const matchesCategory = !category || ev.category === category;
      return matchesSearch && matchesCategory;
    });

    const list = $('#eventList');
    $('#browseEmpty').hidden = filtered.length !== 0;

    list.innerHTML = filtered.map((ev) => {
      const full = ev.seatsLeft <= 0;
      return `
        <article class="event-row">
          <div class="event-code"><strong>${eventCode(ev)}</strong>${escapeHtml(ev.category || 'General')}</div>
          <div class="event-main">
            <h3>${escapeHtml(ev.title)}</h3>
            ${ev.description ? `<p class="desc">${escapeHtml(ev.description)}</p>` : ''}
            <div class="event-meta">
              <span class="tag gold">${escapeHtml(ev.department || 'General')}</span>
              <span>${formatDate(ev.date, ev.time)}</span>
              <span>${escapeHtml(ev.venue)}</span>
            </div>
          </div>
          <div class="event-side">
            <span class="seats-left ${full ? 'full' : ''}">${full ? 'Fully booked' : ev.seatsLeft + ' seats left'}</span>
            <button class="btn btn-primary btn-small" data-register="${ev.id}" ${full ? 'disabled' : ''}>
              ${full ? 'Full' : 'Register'}
            </button>
          </div>
        </article>`;
    }).join('');

    $all('[data-register]', list).forEach((btn) => {
      btn.addEventListener('click', () => openRegisterModal(btn.dataset.register));
    });
  }

  // ---------- Register modal ----------

  function closeAllModals() {
    $('#registerModal').hidden = true;
    $('#regsModal').hidden = true;
  }

  function openRegisterModal(eventId) {
    const ev = allEvents.find((e) => e.id === eventId);
    if (!ev) return;
    closeAllModals();
    $('#modalEventTitle').textContent = ev.title;
    $('#modalEventMeta').textContent = `${formatDate(ev.date, ev.time)} · ${ev.venue}`;
    $('#registerForm').dataset.eventId = eventId;
    $('#registerForm').reset();
    $('#registerError').hidden = true;
    $('#registerModal').hidden = false;
  }

  function closeRegisterModal() {
    $('#registerModal').hidden = true;
  }

  async function handleRegisterSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const eventId = form.dataset.eventId;
    const fd = new FormData(form);
    const errorEl = $('#registerError');
    errorEl.hidden = true;

    try {
      await api(`/api/events/${eventId}/register`, {
        method: 'POST',
        body: JSON.stringify({
          name: fd.get('name'),
          email: fd.get('email'),
          rollNo: fd.get('rollNo'),
        }),
      });
      closeRegisterModal();
      showToast('You are registered for ' + (allEvents.find(x => x.id === eventId) || {}).title);
      loadEvents();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  }

  // ---------- My registrations ----------

  async function handleLookupSubmit(e) {
    e.preventDefault();
    const email = $('#lookupEmail').value.trim();
    const listEl = $('#myRegList');
    listEl.innerHTML = '';
    try {
      const data = await api('/api/my-registrations?email=' + encodeURIComponent(email));
      if (data.registrations.length === 0) {
        listEl.innerHTML = '<p class="empty-note">No registrations found for that email.</p>';
        return;
      }
      listEl.innerHTML = data.registrations.map((r) => {
        const ev = r.event;
        return `
          <div class="reg-card">
            <h4>${escapeHtml(ev ? ev.title : 'Event removed')}</h4>
            <p>${ev ? formatDate(ev.date, ev.time) + ' · ' + escapeHtml(ev.venue) : 'This event no longer exists.'}</p>
            <p>Registered as ${escapeHtml(r.name)} (${escapeHtml(r.rollNo)})</p>
          </div>`;
      }).join('');
    } catch (err) {
      listEl.innerHTML = `<p class="error-note">${escapeHtml(err.message)}</p>`;
    }
  }

  // ---------- Admin ----------

  async function handleAdminLogin(e) {
    e.preventDefault();
    const password = $('#adminPassword').value;
    const errorEl = $('#adminLoginError');
    errorEl.hidden = true;
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
      adminPassword = password;
      sessionStorage.setItem('adminPassword', password);
      showAdminPanel();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  }

  function showAdminPanel() {
    $('#adminLoginBlock').hidden = true;
    $('#adminPanel').hidden = false;
    renderAdminEventList();
  }

  function handleLogout() {
    adminPassword = null;
    sessionStorage.removeItem('adminPassword');
    $('#adminPanel').hidden = true;
    $('#adminLoginBlock').hidden = false;
    $('#adminPassword').value = '';
  }

  async function handleCreateEvent(e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const errorEl = $('#createEventError');
    errorEl.hidden = true;
    try {
      await api('/api/events', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          title: fd.get('title'),
          department: fd.get('department'),
          category: fd.get('category'),
          organizer: fd.get('organizer'),
          description: fd.get('description'),
          date: fd.get('date'),
          time: fd.get('time'),
          seats: fd.get('seats'),
          venue: fd.get('venue'),
        }),
      });
      form.reset();
      showToast('Event published.');
      await loadEvents();
      renderAdminEventList();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  }

  function renderAdminEventList() {
    const list = $('#adminEventList');
    list.innerHTML = allEvents.map((ev) => `
      <div class="admin-row">
        <div>
          <h4>${escapeHtml(ev.title)}</h4>
          <div class="meta">${eventCode(ev)} · ${formatDate(ev.date, ev.time)} · ${ev.registeredCount}/${ev.seats} registered</div>
        </div>
        <div class="actions">
          <button class="btn btn-ghost btn-small" data-view-regs="${ev.id}">View registrations</button>
          <button class="btn btn-ghost btn-small" data-delete="${ev.id}">Delete</button>
        </div>
      </div>`).join('') || '<p class="empty-note">No events yet — publish one above.</p>';

    $all('[data-delete]', list).forEach((btn) => {
      btn.addEventListener('click', () => handleDeleteEvent(btn.dataset.delete));
    });
    $all('[data-view-regs]', list).forEach((btn) => {
      btn.addEventListener('click', () => openRegsModal(btn.dataset.viewRegs));
    });
  }

  async function handleDeleteEvent(eventId) {
    const ev = allEvents.find((e) => e.id === eventId);
    if (!confirm(`Delete "${ev ? ev.title : 'this event'}"? This also removes its registrations.`)) return;
    try {
      await api(`/api/events/${eventId}`, { method: 'DELETE', headers: adminHeaders() });
      showToast('Event deleted.');
      await loadEvents();
      renderAdminEventList();
    } catch (err) {
      showToast('Could not delete: ' + err.message, true);
    }
  }

  async function openRegsModal(eventId) {
    closeAllModals();
    const ev = allEvents.find((e) => e.id === eventId);
    $('#regsModalTitle').textContent = ev ? ev.title : 'Event';
    const listEl = $('#regsModalList');
    listEl.innerHTML = '<p class="empty-note">Loading…</p>';
    $('#regsModal').hidden = false;
    try {
      const data = await api(`/api/events/${eventId}/registrations`, { headers: adminHeaders() });
      if (data.registrations.length === 0) {
        listEl.innerHTML = '<p class="empty-note">No one has registered yet.</p>';
        return;
      }
      listEl.innerHTML = '<div class="row head"><span>Name</span><span>Email</span><span>Roll No.</span></div>' +
        data.registrations.map((r) => `
          <div class="row">
            <span>${escapeHtml(r.name)}</span>
            <span>${escapeHtml(r.email)}</span>
            <span>${escapeHtml(r.rollNo)}</span>
          </div>`).join('');
    } catch (err) {
      listEl.innerHTML = `<p class="error-note">${escapeHtml(err.message)}</p>`;
    }
  }

  // ---------- Init ----------

  function init() {
    initTabs();
    loadEvents();

    $('#searchInput').addEventListener('input', renderEventList);
    $('#categoryFilter').addEventListener('change', renderEventList);

    $('#registerForm').addEventListener('submit', handleRegisterSubmit);
    $('#modalClose').addEventListener('click', closeRegisterModal);
    $('#registerModal').addEventListener('click', (e) => { if (e.target.id === 'registerModal') closeRegisterModal(); });

    $('#lookupForm').addEventListener('submit', handleLookupSubmit);

    $('#adminLoginForm').addEventListener('submit', handleAdminLogin);
    $('#logoutBtn').addEventListener('click', handleLogout);
    $('#createEventForm').addEventListener('submit', handleCreateEvent);

    $('#regsModalClose').addEventListener('click', () => { $('#regsModal').hidden = true; });
    $('#regsModal').addEventListener('click', (e) => { if (e.target.id === 'regsModal') $('#regsModal').hidden = true; });

    if (adminPassword) {
      // Verify the stored password is still valid before showing the panel.
      api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: adminPassword }) })
        .then(showAdminPanel)
        .catch(() => { adminPassword = null; sessionStorage.removeItem('adminPassword'); });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
