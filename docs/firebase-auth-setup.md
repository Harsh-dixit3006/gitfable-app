# Firebase Authentication Setup

GitFable uses **Firebase Authentication** for user management, which provides:

- Email/Password authentication
- GitHub OAuth (and 20+ other providers)
- Social login (Google, Twitter, etc.)
- Anonymous authentication
- Phone authentication
- Email verification
- Password reset
- Token refresh
- Multi-factor authentication (optional)

## Setup Instructions

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create Project"
3. Enter project name (e.g., "gitfable")
4. Enable Google Analytics (optional)
5. Click "Create Project"

### 2. Enable Authentication

1. In Firebase Console, go to "Authentication" → "Get Started"
2. Enable the sign-in methods you want:

#### GitHub Authentication (Recommended)
1. Click "GitHub" in the sign-in providers list
2. Enable it
3. You'll need to create a GitHub OAuth App:
   - Go to https://github.com/settings/developers
   - Click "New OAuth App"
   - **Application name**: GitFable
   - **Homepage URL**: Your app URL (e.g., http://localhost:3000)
   - **Authorization callback URL**: Get this from Firebase (looks like `https://your-project.firebaseapp.com/__/auth/handler`)
   - Click "Register Application"
4. Copy the **Client ID** and **Client Secret** from GitHub
5. Paste them into Firebase GitHub settings
6. Click "Save"

#### Email/Password (Optional)
1. Click "Email/Password"
2. Enable it
3. Optionally enable "Email link (passwordless sign-in)"
4. Click "Save"

#### Google (Optional)
1. Click "Google"
2. Enable it
3. Select support email
4. Click "Save"

### 3. Get Service Account Credentials

The backend needs Firebase Admin SDK credentials to verify tokens.

1. In Firebase Console, click the ⚙️ (settings) icon → "Project settings"
2. Go to "Service accounts" tab
3. Click "Generate new private key"
4. Click "Generate key"
5. A JSON file will download

**Option A: Use JSON file directly**
```bash
# Move the downloaded file to your project
cp /path/to/downloaded-service-account.json backend/firebase-service-account.json

# Set in .env
FIREBASE_SERVICE_ACCOUNT_PATH=firebase-service-account.json
```

**Option B: Use environment variables (Better for production)**

Extract values from the JSON file:

```bash
# View the JSON file
cat /path/to/downloaded-service-account.json

# Copy these values to your .env:
# - project_id
# - private_key_id
# - private_key (keep the \n characters)
# - client_email
# - client_id
# - auth_uri
# - token_uri
# - auth_provider_x509_cert_url
# - client_x509_cert_url
```

### 4. Configure Frontend

Install Firebase in your frontend:

```bash
cd frontend
npm install firebase
```

Create Firebase config file (`src/firebase.js`):

```javascript
import { initializeApp } from 'firebase/app';
import { getAuth, GithubAuthProvider, signInWithPopup } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const githubProvider = new GithubAuthProvider();

// Add GitHub scope for accessing user's email
githubProvider.addScope('user:email');
```

### 5. Frontend Authentication Flow

Example React component:

```javascript
import { signInWithPopup, onAuthStateChanged } from 'firebase/auth';
import { auth, githubProvider } from './firebase';

function LoginButton() {
  const handleLogin = async () => {
    try {
      // Sign in with Firebase
      const result = await signInWithPopup(auth, githubProvider);
      const user = result.user;
      
      // Get Firebase ID token
      const idToken = await user.getIdToken();
      
      // Check if user exists in our database
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      if (response.status === 404) {
        // User doesn't exist, create account
        await fetch('/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            firebase_uid: user.uid,
            email: user.email,
            username: user.displayName?.toLowerCase().replace(/\s+/g, '-') || user.uid.slice(0, 8),
            display_name: user.displayName,
            photo_url: user.photoURL
          })
        });
      }
      
      // Store token for future requests
      localStorage.setItem('token', idToken);
      
    } catch (error) {
      console.error('Login failed:', error);
    }
  };
  
  return <button onClick={handleLogin}>Sign in with GitHub</button>;
}
```

### 6. Making Authenticated Requests

```javascript
// Get the token (it auto-refreshes)
const idToken = await auth.currentUser.getIdToken();

// Make authenticated request
const response = await fetch('/api/draws/draw', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({})
});
```

## Backend Authentication Flow

1. Frontend authenticates with Firebase (GitHub OAuth, Email/Password, etc.)
2. Frontend receives Firebase ID token
3. Frontend sends ID token in `Authorization: Bearer <token>` header
4. Backend verifies token using Firebase Admin SDK
5. Backend looks up user in MongoDB by `firebase_uid`
6. If user doesn't exist, frontend calls `/api/auth/register`
7. Backend creates user document linked to Firebase UID

## Environment Variables

```bash
# Firebase Admin SDK (Option 1: JSON file)
FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/serviceAccountKey.json

# OR (Option 2: Individual values)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id
# ... (see .env.example for all)
```

## Security Notes

- **Never** commit service account credentials to version control
- Firebase ID tokens expire after 1 hour and auto-refresh
- The backend only verifies tokens, it doesn't handle OAuth flows
- All user data is stored in MongoDB, Firebase is just for authentication
- You can disable users in Firebase Console if needed

## Testing

Test the authentication flow:

1. Start backend: `make dev-backend`
2. Start frontend: `make dev-frontend`
3. Click "Sign in with GitHub"
4. Authorize the app
5. Check that user is created in MongoDB
6. Make authenticated requests

## Troubleshooting

### "Firebase credentials not configured"
- Check that all required Firebase environment variables are set
- Verify the service account JSON file exists at the specified path

### "Invalid Firebase ID token"
- Token may have expired - frontend should auto-refresh
- Check that frontend is sending the correct token format
- Verify Firebase project ID matches between frontend and backend

### "User not found in database"
- Normal for first login - frontend should call `/api/auth/register`
- Check that registration request includes correct firebase_uid

### CORS errors
- Ensure `CORS_ORIGINS` includes your frontend URL
- Check that credentials are being sent with requests
