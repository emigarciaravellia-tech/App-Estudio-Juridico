import React, { useState, useEffect, createContext, useContext } from 'react';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { signInAnonymously, signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: { uid: string; displayName: string } | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isLawyer: boolean;
  isAssistant: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshSession: (updates: Partial<UserProfile>) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isLawyer: false,
  isAssistant: false,
  login: async () => {},
  logout: () => {},
  refreshSession: () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedSession = localStorage.getItem('lex_session');
    if (savedSession) {
      try {
        const sessionData = JSON.parse(savedSession);
        setProfile(sessionData);
        // Ensure Firebase Auth is also signed in for Storage/Firestore rules
        if (!auth.currentUser) {
          signInAnonymously(auth).catch(err => console.error("Error signing in anonymously:", err));
        }
      } catch (e) {
        localStorage.removeItem('lex_session');
      }
    }
    setLoading(false);
  }, []);

  const refreshSession = (updates: Partial<UserProfile>) => {
    setProfile(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      localStorage.setItem('lex_session', JSON.stringify(updated));
      return updated;
    });
  };

  const login = async (username: string, password: string) => {
    
    // Sign in anonymously to Firebase Auth to satisfy rules for Storage/Firestore
    try {
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }
    } catch (err) {
      console.error("Error signing in anonymously during login:", err);
    }
    
    // 1. Check against credentials collection
    const credsQuery = query(collection(db, 'credentials'), where('username', '==', username), where('password', '==', password));
    const credsSnapshot = await getDocs(credsQuery);

    if (!credsSnapshot.empty) {
      console.log("Found credentials in DB");
      const credData = credsSnapshot.docs[0].data();
      const userId = credData.userId;
      
      // Fetch profile from users collection
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const userProfile = { uid: userDoc.id, ...userDoc.data() } as UserProfile;
        setProfile(userProfile);
        localStorage.setItem('lex_session', JSON.stringify(userProfile));
        return;
      } else {
        console.error("User profile not found for userId:", userId);
        throw new Error('Perfil de usuario no encontrado');
      }
    }

    console.log("Login failed: Invalid credentials");
    throw new Error('Credenciales incorrectas');
  };

  const logout = () => {
    setProfile(null);
    localStorage.removeItem('lex_session');
    signOut(auth).catch(err => console.error("Error signing out:", err));
  };

  const value = {
    user: profile ? { uid: profile.uid, displayName: profile.displayName || '' } : null,
    profile,
    loading,
    isAdmin: profile?.role === 'admin',
    isLawyer: profile?.role === 'lawyer',
    isAssistant: profile?.role === 'assistant',
    login,
    logout,
    refreshSession
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
