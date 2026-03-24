# Expenses Tracker (PWA)

A simple Progressive Web App to track income and expenses. All data is stored in a Google Sheet in your own Google Drive.

## Features

- Google Sign-In (OAuth 2.0)
- Automatically creates an "Expenses Tracker" spreadsheet in your Google Drive
- Add income and expense transactions with categories
- View summary (total income, expenses, balance)
- View recent transactions
- Open the Google Sheet directly from the app
- Installable on your phone's home screen (PWA)
- Dark mode support

## Setup (One-time)

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Select a project"** → **"New Project"**
3. Name it `Expenses Tracker` and click **Create**

### 2. Enable APIs

1. In your project, go to **APIs & Services** → **Library**
2. Search for and enable:
   - **Google Sheets API**
   - **Google Drive API**

### 3. Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** and click **Create**
3. Fill in:
   - App name: `Expenses Tracker`
   - User support email: your email
   - Developer contact: your email
4. Click **Save and Continue** through the remaining steps
5. Under **Test users**, add your own Google email
6. Click **Save**

### 4. Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **"+ Create Credentials"** → **"OAuth client ID"**
3. Application type: **Web application**
4. Name: `Expenses Web`
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:8000` (for local testing)
   - Your deployed URL (e.g., `https://yourusername.github.io`)
6. Click **Create**
7. **Copy the Client ID** (looks like `xxxx.apps.googleusercontent.com`)

### 5. Add Your Client ID

Open `app.js` and replace the placeholder on line 4:

```js
const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
```

with your actual Client ID.

## Running Locally

You need a simple HTTP server (Google OAuth won't work with `file://`).

**Using Python:**
```bash
cd Expenses
python3 -m http.server 8000
```

**Using Node.js:**
```bash
npx serve .
```

Then open `http://localhost:8000` in your browser.

## Deploy to GitHub Pages (Free)

1. Create a new GitHub repository
2. Push the `Expenses` folder contents to the `main` branch
3. Go to repository **Settings** → **Pages**
4. Set source to **Deploy from a branch** → `main` → `/ (root)`
5. Your app will be live at `https://yourusername.github.io/repo-name/`
6. Add this URL to **Authorized JavaScript origins** in Google Cloud Console

## Install on Phone

1. Open the deployed URL in Chrome on your phone
2. Tap the browser menu (⋮) → **"Add to Home screen"** or **"Install app"**
3. The app will appear on your home screen like a native app

## How It Works

1. Sign in with your Google account
2. The app creates an "Expenses Tracker" spreadsheet in your Google Drive (first time only)
3. Add transactions using the + button
4. All data is read from and written to that Google Sheet
5. You can also open and edit the Google Sheet directly
