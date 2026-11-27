/**
 * College Event Management System
 * Zero-dependency Node.js server (only built-in modules).
 * Run with: node server.js
 * Then open: http://localhost:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- Data helpers ----------

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    // If the file is missing or corrupt, start fresh rather than crash.
    console.error('Could not read data.json, starting with empty data:', err.message);
    return { events: [], registrations: [], adminPassword: 'admin123' };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function makeId() {
  return crypto.randomBytes(6).toString('hex');
}

// ---------- HTTP helpers ----------

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    const MAX_BYTES = 1024 * 1024; // 1MB safety cap
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (err) {
        reject(new Error('Invalid JSON in request body'));
      }
    });
    req.on('error', reject);
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  const resolved = path.normalize(path.join(PUBLIC_DIR, filePath));

  // Prevent path traversal outside the public directory.
  if (!resolved.startsWith(PUBLIC_DIR)) {
    return sendError(res, 403, 'Forbidden');
  }

  fs.readFile(resolved, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        return sendError(res, 404, 'Not found');
      }
      return sendError(res, 500, 'Server error reading file');
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// ---------- Validation helpers ----------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isValidEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function requireAdmin(req, data) {
  const header = req.headers['x-admin-password'];
  return typeof header === 'string' && header === data.adminPassword;
}

function eventWithCounts(event, registrations) {
  const regs = registrations.filter((r) => r.eventId === event.id);
  return {
    ...event,
    registeredCount: regs.length,
    seatsLeft: Math.max(0, (event.seats || 0) - regs.length),
  };
}

// ---------- Route handlers ----------

async function handleApi(req, res, pathname, query) {
  const data = loadData();

  // GET /api/events
  if (pathname === '/api/events' && req.method === 'GET') {
    const list = data.events
      .slice()
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .map((e) => eventWithCounts(e, data.registrations));
    return sendJson(res, 200, { events: list });
  }

  // GET /api/events/:id
  const singleEventMatch = pathname.match(/^\/api\/events\/([a-zA-Z0-9]+)$/);
  if (singleEventMatch && req.method === 'GET') {
    const ev = data.events.find((e) => e.id === singleEventMatch[1]);
    if (!ev) return sendError(res, 404, 'Event not found');
    return sendJson(res, 200, { event: eventWithCounts(ev, data.registrations) });
  }

  // POST /api/admin/login
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    const body = await readBody(req);
    if (!isNonEmptyString(body.password)) {
      return sendError(res, 400, 'Password is required');
    }
    if (body.password === data.adminPassword) {
      return sendJson(res, 200, { ok: true });
    }
    return sendError(res, 401, 'Incorrect admin password');
  }

  // POST /api/events  (admin only)
  if (pathname === '/api/events' && req.method === 'POST') {
    if (!requireAdmin(req, data)) return sendError(res, 401, 'Admin authentication required');
    const body = await readBody(req);
    const { title, department, category, description, date, time, venue, seats, organizer } = body;

    if (!isNonEmptyString(title)) return sendError(res, 400, 'Title is required');
    if (!isNonEmptyString(date)) return sendError(res, 400, 'Date is required');
    if (!isNonEmptyString(time)) return sendError(res, 400, 'Time is required');
    if (!isNonEmptyString(venue)) return sendError(res, 400, 'Venue is required');
    const seatsNum = Number(seats);
    if (!Number.isFinite(seatsNum) || seatsNum <= 0) {
      return sendError(res, 400, 'Seats must be a positive number');
    }

    const newEvent = {
      id: makeId(),
      title: title.trim(),
      department: isNonEmptyString(department) ? department.trim() : 'General',
      category: isNonEmptyString(category) ? category.trim() : 'General',
      description: isNonEmptyString(description) ? description.trim() : '',
      date: date.trim(),
      time: time.trim(),
      venue: venue.trim(),
      seats: Math.floor(seatsNum),
      organizer: isNonEmptyString(organizer) ? organizer.trim() : 'College Administration',
      createdAt: new Date().toISOString(),
    };

    data.events.push(newEvent);
    saveData(data);
    return sendJson(res, 201, { event: eventWithCounts(newEvent, data.registrations) });
  }

  // PUT /api/events/:id  (admin only)
  if (singleEventMatch && req.method === 'PUT') {
    if (!requireAdmin(req, data)) return sendError(res, 401, 'Admin authentication required');
    const ev = data.events.find((e) => e.id === singleEventMatch[1]);
    if (!ev) return sendError(res, 404, 'Event not found');
    const body = await readBody(req);

    if (body.title !== undefined) {
      if (!isNonEmptyString(body.title)) return sendError(res, 400, 'Title cannot be empty');
      ev.title = body.title.trim();
    }
    if (body.department !== undefined) ev.department = String(body.department).trim();
    if (body.category !== undefined) ev.category = String(body.category).trim();
    if (body.description !== undefined) ev.description = String(body.description).trim();
    if (body.date !== undefined) {
      if (!isNonEmptyString(body.date)) return sendError(res, 400, 'Date cannot be empty');
      ev.date = body.date.trim();
    }
    if (body.time !== undefined) {
      if (!isNonEmptyString(body.time)) return sendError(res, 400, 'Time cannot be empty');
      ev.time = body.time.trim();
    }
    if (body.venue !== undefined) {
      if (!isNonEmptyString(body.venue)) return sendError(res, 400, 'Venue cannot be empty');
      ev.venue = body.venue.trim();
    }
    if (body.organizer !== undefined) ev.organizer = String(body.organizer).trim();
    if (body.seats !== undefined) {
      const seatsNum = Number(body.seats);
      if (!Number.isFinite(seatsNum) || seatsNum <= 0) {
        return sendError(res, 400, 'Seats must be a positive number');
      }
      ev.seats = Math.floor(seatsNum);
    }

    saveData(data);
    return sendJson(res, 200, { event: eventWithCounts(ev, data.registrations) });
  }

  // DELETE /api/events/:id  (admin only)
  if (singleEventMatch && req.method === 'DELETE') {
    if (!requireAdmin(req, data)) return sendError(res, 401, 'Admin authentication required');
    const idx = data.events.findIndex((e) => e.id === singleEventMatch[1]);
    if (idx === -1) return sendError(res, 404, 'Event not found');
    data.events.splice(idx, 1);
    data.registrations = data.registrations.filter((r) => r.eventId !== singleEventMatch[1]);
    saveData(data);
    return sendJson(res, 200, { ok: true });
  }

  // POST /api/events/:id/register
  const registerMatch = pathname.match(/^\/api\/events\/([a-zA-Z0-9]+)\/register$/);
  if (registerMatch && req.method === 'POST') {
    const ev = data.events.find((e) => e.id === registerMatch[1]);
    if (!ev) return sendError(res, 404, 'Event not found');
    const body = await readBody(req);
    const { name, email, rollNo } = body;

    if (!isNonEmptyString(name)) return sendError(res, 400, 'Name is required');
    if (!isValidEmail(email)) return sendError(res, 400, 'A valid email is required');
    if (!isNonEmptyString(rollNo)) return sendError(res, 400, 'Roll number is required');

    const normalizedEmail = email.trim().toLowerCase();
    const alreadyRegistered = data.registrations.some(
      (r) => r.eventId === ev.id && r.email === normalizedEmail
    );
    if (alreadyRegistered) {
      return sendError(res, 409, 'This email is already registered for this event');
    }

    const currentCount = data.registrations.filter((r) => r.eventId === ev.id).length;
    if (currentCount >= ev.seats) {
      return sendError(res, 409, 'This event is fully booked');
    }

    const registration = {
      id: makeId(),
      eventId: ev.id,
      name: name.trim(),
      email: normalizedEmail,
      rollNo: rollNo.trim(),
      registeredAt: new Date().toISOString(),
    };
    data.registrations.push(registration);
    saveData(data);
    return sendJson(res, 201, {
      registration,
      event: eventWithCounts(ev, data.registrations),
    });
  }

  // GET /api/events/:id/registrations  (admin only)
  const eventRegsMatch = pathname.match(/^\/api\/events\/([a-zA-Z0-9]+)\/registrations$/);
  if (eventRegsMatch && req.method === 'GET') {
    if (!requireAdmin(req, data)) return sendError(res, 401, 'Admin authentication required');
    const ev = data.events.find((e) => e.id === eventRegsMatch[1]);
    if (!ev) return sendError(res, 404, 'Event not found');
    const regs = data.registrations
      .filter((r) => r.eventId === ev.id)
      .sort((a, b) => a.registeredAt.localeCompare(b.registeredAt));
    return sendJson(res, 200, { registrations: regs });
  }

  // GET /api/my-registrations?email=...
  if (pathname === '/api/my-registrations' && req.method === 'GET') {
    const email = (query.get('email') || '').trim().toLowerCase();
    if (!isValidEmail(email)) return sendError(res, 400, 'A valid email query param is required');
    const mine = data.registrations
      .filter((r) => r.email === email)
      .map((r) => {
        const ev = data.events.find((e) => e.id === r.eventId);
        return { ...r, event: ev || null };
      });
    return sendJson(res, 200, { registrations: mine });
  }

  return sendError(res, 404, 'API route not found');
}

// ---------- Server ----------

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname, parsedUrl.searchParams);
    } else {
      serveStatic(req, res, pathname);
    }
  } catch (err) {
    const badRequestMessages = ['Invalid JSON in request body', 'Request body too large'];
    if (!res.headersSent) {
      if (badRequestMessages.includes(err.message)) {
        sendError(res, 400, err.message);
      } else {
        console.error('Unhandled server error:', err);
        sendError(res, 500, 'Internal server error');
      }
    } else {
      res.end();
    }
  }
});

server.listen(PORT, () => {
  console.log(`College Event Management System running at http://localhost:${PORT}`);
  console.log(`Admin password (change in data.json): check the "adminPassword" field`);
});
