import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
  collection,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

/* ========================
   USERS COLLECTION
   ======================== */

/**
 * Create a user profile document in Firestore.
 * Called automatically on signup.
 * Uses the Firebase Auth UID as the document ID.
 */
export async function createUserProfile(user) {
  const userRef = doc(db, "users", user.uid);

  // Check if doc already exists (prevents overwriting on re-auth)
  const snapshot = await getDoc(userRef);
  if (snapshot.exists()) {
    return snapshot.data();
  }

  const profileData = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || "",
    photoURL: user.photoURL || "",
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    role: "free",          // free | pro | admin
    preferences: {
      theme: "dark",
      currency: "USD",
    },
  };

  await setDoc(userRef, profileData);
  return profileData;
}

/**
 * Fetch the current user's Firestore profile.
 */
export async function getUserProfile(uid) {
  const userRef = doc(db, "users", uid);
  const snapshot = await getDoc(userRef);

  if (snapshot.exists()) {
    return { id: snapshot.id, ...snapshot.data() };
  }
  return null;
}

/**
 * Update the lastLoginAt timestamp when a user logs in.
 */
export async function updateLastLogin(uid) {
  const userRef = doc(db, "users", uid);
  const snapshot = await getDoc(userRef);

  if (snapshot.exists()) {
    await setDoc(userRef, { lastLoginAt: serverTimestamp() }, { merge: true });
  }
}

/* ========================
   STRATEGIES COLLECTION
   ======================== */

/**
 * Fetch all strategies belonging to a specific user.
 * Returns an array of strategy objects.
 */
export async function getUserStrategies(uid) {
  try {
    const strategiesRef = collection(db, "strategies");
    const q = query(
      strategiesRef,
      where("userId", "==", uid)
    );
    const snapshot = await getDocs(q);

    // Sort client-side (avoids composite index requirement)
    const results = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    results.sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });
    return results;
  } catch (error) {
    console.warn("Error fetching strategies:", error.message);
    return [];
  }
}

/**
 * Save a new strategy to Firestore.
 *
 * @param {string} uid          - User's Firebase Auth UID.
 * @param {object} strategyData - Strategy fields (name, ticker, type, etc.).
 * @returns {string}            - The new document ID.
 */
export async function saveStrategy(uid, strategyData) {
  const docRef = await addDoc(collection(db, "strategies"), {
    userId: uid,
    name: strategyData.name,
    ticker: strategyData.ticker,
    type: strategyData.type || "sma_crossover",
    shortWindow: strategyData.shortWindow || 10,
    longWindow: strategyData.longWindow || 30,
    initialCapital: strategyData.initialCapital || 10000,
    status: strategyData.status || "draft",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Update an existing strategy in Firestore.
 *
 * @param {string} strategyId   - Firestore document ID.
 * @param {object} updates      - Fields to update.
 */
export async function updateStrategy(strategyId, updates) {
  const stratRef = doc(db, "strategies", strategyId);
  await updateDoc(stratRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Update only the status of a strategy (e.g. "draft" → "active").
 */
export async function updateStrategyStatus(strategyId, status) {
  await updateStrategy(strategyId, { status });
}

/**
 * Delete a strategy from Firestore.
 *
 * @param {string} strategyId - Firestore document ID.
 */
export async function deleteStrategy(strategyId) {
  const stratRef = doc(db, "strategies", strategyId);
  await deleteDoc(stratRef);
}

/**
 * Fetch total count of all strategies (across all users).
 */
export async function getAllStrategiesCount() {
  try {
    const snapshot = await getDocs(collection(db, "strategies"));
    return snapshot.size;
  } catch {
    return 0;
  }
}

/* ========================
   BACKTEST_RUNS COLLECTION
   ======================== */

/**
 * Fetch backtest runs belonging to a specific user.
 * Returns an array, most recent first.
 */
export async function getUserBacktests(uid) {
  try {
    const backtestsRef = collection(db, "backtest_runs");
    const q = query(
      backtestsRef,
      where("userId", "==", uid)
    );
    const snapshot = await getDocs(q);

    // Sort client-side and limit to 10 (avoids composite index requirement)
    const results = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    results.sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });
    return results.slice(0, 10);
  } catch (error) {
    console.warn("Error fetching backtests:", error.message);
    return [];
  }
}

/**
 * Fetch total count of all backtest runs (across all users).
 */
export async function getAllBacktestsCount() {
  try {
    const snapshot = await getDocs(collection(db, "backtest_runs"));
    return snapshot.size;
  } catch {
    return 0;
  }
}

/**
 * Save a backtest run result to Firestore.
 * Called after the FastAPI backend returns backtest results.
 *
 * @param {string} uid          - User's Firebase Auth UID.
 * @param {object} backtestData - Object with ticker, strategy, metrics, etc.
 * @returns {string}            - The new document ID.
 */
export async function saveBacktestRun(uid, backtestData) {
  const docRef = await addDoc(collection(db, "backtest_runs"), {
    userId: uid,
    ticker: backtestData.ticker,
    strategyName: backtestData.strategy || "SMA Crossover",
    returnPct: backtestData.metrics.total_return_pct,
    numTrades: backtestData.metrics.num_trades,
    winRate: backtestData.metrics.win_rate,
    maxDrawdown: backtestData.metrics.max_drawdown_pct,
    initialCapital: backtestData.metrics.initial_capital,
    finalEquity: backtestData.metrics.final_equity,
    avgWin: backtestData.metrics.avg_win,
    avgLoss: backtestData.metrics.avg_loss,
    shortWindow: backtestData.short_window,
    longWindow: backtestData.long_window,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Fetch a single backtest run by its Firestore document ID.
 *
 * @param {string} backtestId - Firestore document ID.
 * @returns {object|null}     - Backtest data or null if not found.
 */
export async function getBacktestById(backtestId) {
  const docRef = doc(db, "backtest_runs", backtestId);
  const snapshot = await getDoc(docRef);

  if (snapshot.exists()) {
    return { id: snapshot.id, ...snapshot.data() };
  }
  return null;
}
