# MailBlast

MailBlast is a production-ready bulk email sender web app built with Node.js + Express, Google OAuth, and Gmail API. Each user sends email from their own Gmail account using OAuth tokens stored in session.

## Features

- Google OAuth login with Passport
- Per-user Gmail API sending using OAuth `accessToken`
- Bulk send to individual recipients (no BCC)
- Multipart form API with multiple in-memory attachments
- Dark, responsive UI for login and compose/send flows
- Recipient-level send result reporting (`sent` / `failed`)
- MongoDB persistence for users, auth events, and send logs
- Built-in analytics endpoints for login/user/send insights

## Project Structure

```txt
mailblast/
├── server.js
├── .env
├── .gitignore
├── package.json
├── routes/
│   ├── auth.js
│   ├── email.js
│   └── analytics.js
├── middleware/
│   └── isAuth.js
├── config/
│   └── db.js
├── models/
│   ├── User.js
│   ├── AuthEvent.js
│   └── BulkEmailLog.js
├── services/
│   └── auditService.js
├── public/
│   ├── login.html
│   ├── index.html
│   ├── style.css
│   └── app.js
└── README.md
```

## Prerequisites

- Node.js 18+
- A Google Cloud project
- A Gmail account for testing sends

## Google Cloud Setup (OAuth + Gmail API)

1. Create a project in Google Cloud Console.
2. Enable **Gmail API** for that project.
3. Configure OAuth consent screen:
   - Set **App name** to `MailBlast` in **Google Auth Platform -> Branding**.
   - User type: External (or Internal if Workspace only)
   - Add scopes:
     - `.../auth/userinfo.profile`
     - `.../auth/userinfo.email`
     - `https://www.googleapis.com/auth/gmail.send`
   - Add test users if app is in testing mode.
4. Create OAuth 2.0 Client ID credentials:
   - Application type: Web application
   - Authorized redirect URI:
     - `http://localhost:3000/auth/google/callback`
5. Copy client ID and client secret to `.env`.

## Environment Variables

Create `mailblast/.env`:

```env
PORT=3000
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
SESSION_SECRET=some_random_secret_string
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/mailblast?retryWrites=true&w=majority
ENABLE_PERSISTENCE=true
```

## Install & Run

```bash
cd mailblast
npm install
npm run dev
```

Open:

- `http://localhost:3000/login`

## API Endpoints

### Auth

- `GET /login` -> login page
- `GET /auth/google` -> start Google OAuth
- `GET /auth/google/callback` -> OAuth callback
- `GET /logout` -> logout + session destroy
- `GET /privacy-policy` -> privacy page
- `GET /terms-and-conditions` -> terms page

### App

- `GET /` -> protected app page
- `GET /me` -> current user profile JSON

### Email

- `POST /send-bulk` (protected, multipart/form-data)

### Analytics (MongoDB required)

- `GET /analytics/overview` -> totals (users, logins, campaigns, sent/failed)
- `GET /analytics/users` -> user records with `createdAt` and `updatedAt`
- `GET /analytics/login-events` -> login/logout history
- `GET /analytics/email-logs` -> bulk-send history

Fields:

- `subject` (required)
- `text` (required if `html` missing)
- `html` (optional)
- `emails` (required JSON string array)
- `attachments` (optional multiple files)

Response:

```json
{
  "total": 3,
  "sent": 2,
  "failed": 1,
  "results": [
    { "email": "a@example.com", "status": "sent" },
    { "email": "b@example.com", "status": "failed", "error": "Invalid token" }
  ]
}
```

## Production Notes

- Replace default in-memory session store with Redis (recommended for multi-instance deployments).
- Use HTTPS and set `NODE_ENV=production` so secure cookies are enforced.
- Add rate limiting and job queues for high-volume workloads.
- Monitor Gmail API quota and sender reputation.

## Security Notes

- `.env` is gitignored.
- No Gmail password/app password is stored.
- Only minimal OAuth scopes are requested.
- App does not request mailbox read permissions.
