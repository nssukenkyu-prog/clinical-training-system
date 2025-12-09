# Firebase Setup Instructions

To complete the migration, you need to set up a Firebase project and provide the configuration keys.

## 1. Create a Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Click **"Add project"** and follow the steps (name it `clinical-training-system` or similar).
3. Disable Google Analytics (optional, keeps it simpler).

## 2. Enable Authentication
1. In the left sidebar, click **Build** -> **Authentication**.
2. Click **Get started**.
3. Select **Email/Password** provider.
4. Enable **Email/Password** and click **Save**.

## 3. Enable Firestore Database
1. In the left sidebar, click **Build** -> **Firestore Database**.
2. Click **Create database**.
3. Choose a location (e.g., `asia-northeast1` for Tokyo).
4. Start in **Test mode** (we will secure it later).

## 4. Get Configuration Keys
1. Click the **Gear icon** (Project settings) next to "Project Overview".
2. Scroll down to "Your apps" and click the **Web icon (`</>`)**.
3. Register the app (nickname: `Web App`).
4. You will see a `firebaseConfig` object.

## 5. Update Environment Variables
Create or update your `.env` file in the project root with the values from the `firebaseConfig` object:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

## 6. Initial Data Setup (Manual)
Since we are starting fresh with Firestore, you will need to create the initial Admin user manually in the Firebase Console or we can create a script for it.

1. Go to **Authentication** -> **Users** -> **Add user**.
2. Create an admin user (e.g., `admin@example.com`).
3. Go to **Firestore Database**.
4. Start a collection named `admins`.
5. Add a document (Auto-ID is fine, or use the User UID from Auth).
6. Add field `email` with value `admin@example.com`.
