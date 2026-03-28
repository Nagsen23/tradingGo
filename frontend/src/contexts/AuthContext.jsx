import { createContext, useContext, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "../firebase";
import {
  createUserProfile,
  getUserProfile,
  updateLastLogin,
} from "../services/firestoreService";

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  /**
   * Signup — creates Firebase Auth user + Firestore profile doc.
   */
  async function signup(email, password) {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    // Create Firestore user document immediately after signup
    const profile = await createUserProfile(credential.user);
    setUserProfile(profile);
    return credential;
  }

  /**
   * Login — authenticates and updates lastLoginAt in Firestore.
   */
  async function login(email, password) {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    // Update last login timestamp
    await updateLastLogin(credential.user.uid);
    // Fetch fresh profile
    const profile = await getUserProfile(credential.user.uid);
    setUserProfile(profile);
    return credential;
  }

  /**
   * Logout — clears Firestore profile from state.
   */
  async function logout() {
    setUserProfile(null);
    return signOut(auth);
  }

  /**
   * Listen for auth state changes.
   * When a user is detected (e.g. page refresh), fetch their Firestore profile.
   */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        try {
          const profile = await getUserProfile(user.uid);
          setUserProfile(profile);
        } catch (err) {
          console.warn("Could not fetch user profile:", err.message);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userProfile,
    signup,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
