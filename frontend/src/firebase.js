// src/firebase.js – initialize Firebase app
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBOfQquE8JcyxC4tohcbI4RZS3RJmScPv8",
  authDomain: "interdist-dashboard.firebaseapp.com",
  projectId: "interdist-dashboard",
  storageBucket: "interdist-dashboard.firebasestorage.app",
  messagingSenderId: "731138599083",
  appId: "1:731138599083:web:25c9e1bf691bdcc50bafee",
  measurementId: "G-ZRC7213DBR",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;
