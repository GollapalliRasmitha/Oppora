# Google setup for Oppora (step by step)

You'll create two things, both free:

1. **A Google Cloud OAuth client.** This lets you sign in to Oppora with Google and lets Oppora read your Gmail (read-only).
2. **A Gemini API key.** This is the free AI that reads opportunity emails.

It takes about 15 minutes. Use your own Gmail account for everything. You never type your Gmail password into Oppora. Google shows its own sign-in and permission screens.

> **Nothing here costs money** as long as you **don't add a billing account** or payment card. Google may ask about billing or free-trial credits at some point. You can skip or close those prompts, because everything below works without billing.

---

## Part A: Google Cloud project and OAuth client

### 1. Open Google Cloud Console
1. Go to <https://console.cloud.google.com/> and sign in with your Gmail.
2. If it asks you to accept the Terms of Service, read them and accept (that's your decision to make). You don't need a free trial or billing.

### 2. Create a project
1. Click the **project picker** at the top left (next to "Google Cloud"), then **New project**.
2. Project name: `Oppora`. Leave Location as "No organization".
3. Click **Create**, wait a few seconds, then select the new **Oppora** project in the project picker.

### 3. Turn on the Gmail API
1. In the search bar at the top, type **Gmail API** and open it (Marketplace / APIs & Services).
2. Click **Enable**.

### 4. Set up the consent screen (Google Auth Platform)
1. Open the menu (☰) → **Google Auth Platform** → **Branding**. If you see "Google Auth Platform not configured yet", click **Get started**.
2. **App information**
   - App name: `Oppora`
   - User support email: your Gmail
   - Click **Next**.
3. **Audience**: choose **External**, then **Next**. "External" just means a normal Gmail account can use it. While the app is in Testing mode, only the test users you list can sign in.
4. **Contact information**: your Gmail, then **Next**.
5. **Finish**: tick the box to agree to the Google API Services User Data Policy, click **Continue**, then **Create**.

### 5. Add yourself as a test user (Testing mode)
1. Go to **Google Auth Platform → Audience**.
2. Check that **Publishing status** says **Testing**. Leave it in Testing; don't click "Publish app".
3. Under **Test users**, click **Add users**, enter your own Gmail address, and **Save**.

### 6. Add only the Gmail read-only scope
1. Go to **Google Auth Platform → Data Access → Add or remove scopes**.
2. Tick these and nothing else:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`
   - `https://www.googleapis.com/auth/gmail.readonly`. If it's not in the list, paste it into **Manually add scopes** and click **Add to table**.
3. Click **Update**, then **Save**.

`gmail.readonly` is a *restricted* scope. That's fine in Testing mode. Publishing to everyone would need Google's verification and a security assessment (see CLAUDE.md).

### 7. Create the OAuth client
1. Go to **Google Auth Platform → Clients → Create client**.
2. Application type: **Web application**. Name: `Oppora local`.
3. **Authorized JavaScript origins** → **Add URI** → `http://localhost:3000`
4. **Authorized redirect URIs** → **Add URI** → `http://localhost:3000/api/auth/google/callback`
   It must be exactly this: `http`, `localhost`, port `3000`, and no slash at the end.
5. Click **Create**. A box shows the **Client ID** and **Client secret**. Copy them now. The secret is only shown in full once, though you can create a new one later.

### 8. Put them in `.env`
Open `.env` in the project root (it's never committed to Git) and fill in:

```
GOOGLE_CLIENT_ID=<your client id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your client secret>
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

Don't paste these into chats, screenshots or code files.

---

## Part B: Gemini API key (free tier)

1. Go to <https://aistudio.google.com/apikey> and sign in with the same Gmail.
2. Accept the terms if asked (your decision).
3. Click **Create API key**. Choose the **Oppora** project (or let it create one). Don't attach billing to it.
4. Copy the key into `.env`:

```
AI_PROVIDER=gemini
GEMINI_API_KEY=<your key>
GEMINI_MODEL=gemini-3.8-flash
```

5. Open <https://aistudio.google.com/rate-limit> to see your project's free-tier limits for the model. Set the two values in `.env` at or a little below them:

```
AI_REQUESTS_PER_MINUTE=9
AI_REQUESTS_PER_DAY=200
```

If the daily limit is too low for your inbox, `gemini-3.5-flash-lite` is a lighter Flash model, often with higher free limits. Change `GEMINI_MODEL` and restart.

**Privacy note.** On Gemini's free tier, Google may use the content you send to improve its products. Oppora sends only the subject, the sender and a trimmed plain-text body of emails that pass its opportunity pre-filter. It never sends attachments, and it never sends emails that don't look like opportunities. To avoid this entirely you'd need a paid tier (or `AI_PROVIDER=openai`, which is paid). Nothing paid is ever turned on without asking you.

---

## Part C: Start Oppora and sign in

1. Restart Oppora so it reads the new `.env`. Close the "Oppora backend" window, then run:
   ```
   powershell -ExecutionPolicy Bypass -File .\start-oppora.ps1
   ```
2. On the landing page, click **Sign in with Google**.
3. Google shows **"Google hasn't verified this app"**. That's expected for your own app in Testing mode. Click **Continue**.
4. On the permissions screen, **tick the Gmail box** ("Read your email messages and settings") and click **Continue**.
5. Oppora opens the dashboard and starts the first scan (the last 60 days). With the free tier's ~10 requests per minute, the AI reads about one email every 6–7 seconds, so a first scan can take a while. The sync card shows progress. If the daily limit is reached, the remaining emails stay queued and are processed on a later scan.

### Every 7 days: reconnect
In Testing mode, Google makes Oppora's access expire after **7 days**. When that happens, Settings shows **Needs reconnect**. Click **Reconnect Gmail** and approve again. Nothing is lost.

### Troubleshooting
| You see | Fix |
|---|---|
| `Error 400: redirect_uri_mismatch` | The redirect URI in step 7 must be exactly `http://localhost:3000/api/auth/google/callback`, and `GOOGLE_REDIRECT_URI` in `.env` must match it. |
| `Error 403: access_denied` / "has not completed the Google verification process" | Add your Gmail as a **test user** (step 5). |
| Settings says Oppora needs permission to read your Gmail | You left the Gmail box unticked. Click Reconnect Gmail and tick it. |
| The sync card says emails are queued | The AI's daily free limit was reached. They're processed on the next scan after the limit resets (midnight Pacific time). |
| Landing page: "Google sign-in isn't set up on this server yet" | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are empty in `.env`, or the backend wasn't restarted. |

### Turning it off
Settings → **Disconnect** revokes Oppora's access at Google and deletes the stored tokens. You can also remove access at <https://myaccount.google.com/permissions>.
