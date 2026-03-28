import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD3O-qi_RcBlRcwzXY5bzDBuNSrVP3hkbc",
  authDomain: "tradinggo-f4308.firebaseapp.com",
  projectId: "tradinggo-f4308",
  storageBucket: "tradinggo-f4308.firebasestorage.app",
  messagingSenderId: "70997887436",
  appId: "1:70997887436:web:bc0c861f16be2419cbb569",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
