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
  apiKey: "AIzaSyDW1OZW3Qvfyt-R-qualw8UW6723QQOXQU",
  authDomain: "live-online-exam1.firebaseapp.com",
  projectId: "live-online-exam1",
  databaseURL: "https://live-online-exam1-default-rtdb.europe-west1.firebasedatabase.app",
  storageBucket: "live-online-exam1.firebasestorage.app",
  messagingSenderId: "867407534345",
  appId: "1:867407534345:web:6ff7be969f025bf0305bd8"
};

// Initialize Firebase if the SDK is loaded (in both admin and take.html)
if (typeof firebase !== 'undefined' && firebase.apps.length === 0) {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
  } catch (e) {
    console.error("Firebase Initialization Error. Did you set up the config in js/firebase-config.js?", e);
  }
}
