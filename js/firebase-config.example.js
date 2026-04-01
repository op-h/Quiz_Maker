// ==========================================
// FIREBASE CONFIGURATION FOR LIVE EXAMS
// ==========================================
// IMPORTANT: You must replace this placeholder configuration with your
// actual Firebase Project settings to use the "Host Live Exam" feature.
// 1. Go to console.firebase.google.com
// 2. Create a Free Project
// 3. Add a Web App to get your config keys
// 4. Create a "Realtime Database" and set its rules to True for read/write.

const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.europe-west1.firebasedatabase.app",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase if the SDK is loaded (in both admin and take.html)
if (typeof firebase !== 'undefined' && firebase.apps.length === 0) {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
  } catch (e) {
    console.error("Firebase Initialization Error. Did you set up the config in js/firebase-config.js?", e);
  }
}
