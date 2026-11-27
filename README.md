# Campus Ledger — College Event Management System

A complete, dependency-free college event management web app: students browse
and register for events, and admins publish events and view the registration
list. Built with plain Node.js (no npm install required) and vanilla HTML/CSS/JS.

## Features

- **Browse events** — search and filter by category, see date/time/venue/seats left
- **Register for an event** — name, email, roll number; blocks duplicate
  registrations and stops registration once an event is full
- **My Registrations** — students look up everything they've signed up for by email
- **Admin dashboard** — password-protected: create events, delete events, and
  view the full registration list per event
- Data is stored in `data.json` and persists between restarts

## Requirements

- Node.js 14+ (no other dependencies — nothing to `npm install`)

## Run it

```bash
git clone https://github.com/<your-username>/college-event-manager.git
cd college-event-manager
node server.js
```

Then open **http://localhost:3000** in your browser.

To use a different port:

```bash
PORT=4000 node server.js
```

## Admin login

The demo admin password is `admin123`. Change it any time by editing the
`"adminPassword"` field in `data.json`.

## Project structure

```
college-event-manager/
├── server.js        # HTTP server + REST API (built-in Node modules only)
├── data.json         # Persisted data: events, registrations, admin password
├── package.json
└── public/
    ├── index.html     # App shell (Browse / My Registrations / Admin tabs)
    ├── style.css       # "Campus Ledger" catalog-style design
    └── app.js           # Frontend logic (fetch calls to the API)
```

## API reference

| Method | Route                              | Auth  | Description                          |
|--------|-------------------------------------|-------|---------------------------------------|
| GET    | `/api/events`                       | —     | List all events with seat counts      |
| GET    | `/api/events/:id`                   | —     | Get one event                         |
| POST   | `/api/events`                       | Admin | Create an event                       |
| PUT    | `/api/events/:id`                   | Admin | Update an event                       |
| DELETE | `/api/events/:id`                   | Admin | Delete an event (and its registrations)|
| POST   | `/api/events/:id/register`          | —     | Register for an event                 |
| GET    | `/api/events/:id/registrations`     | Admin | List registrations for an event       |
| GET    | `/api/my-registrations?email=...`   | —     | Look up a student's registrations     |
| POST   | `/api/admin/login`                  | —     | Verify the admin password             |

Admin routes require an `X-Admin-Password` header matching the password in
`data.json`.

## Notes

- `data.json` ships with 3 sample events and no registrations. Registrations
  made while using the app are saved back into this file.
- The default admin password is for demo use only — change it before deploying
  anywhere public.
- Everything runs from a single Node process — no database server or build
  step needed, so it works the same on any machine with Node installed.
- All API input is validated server-side (required fields, email format,
  duplicate registrations, seat limits, malformed JSON) and returns clear
  JSON error messages with the correct HTTP status codes.

## License

MIT — see [LICENSE](LICENSE).
