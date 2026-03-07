import { initializeApp } from 'firebase/app';
import { getAuth, GithubAuthProvider } from 'firebase/auth';

// Firebase configuration - these will be injected at build time from .env
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// GitHub Auth Provider
const githubProvider = new GithubAuthProvider();
// Request additional scopes if needed
githubProvider.addScope('read:user');
githubProvider.addScope('user:email');
// Allow user to select which GitHub account to use
githubProvider.setCustomParameters({ allow_signup: 'true', login: '' });

export { auth, githubProvider };
