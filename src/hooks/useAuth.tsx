import React, { useState, useEffect, createContext, useContext } from 'react';
import { doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
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

  const login = async (username: string, password: string) => {
    console.log("Attempting login for:", username);
    
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

    // 2. Check against admin_config collection (legacy/admin fallback)
    const q = query(collection(db, 'admin_config'), where('username', '==', username), where('password', '==', password));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      console.log("Found admin credentials in DB");
      const adminProfile: UserProfile = {
        uid: 'admin-id',
        email: 'admin@lexmanage.local',
        displayName: 'Administrador',
        role: 'admin'
      };
      setProfile(adminProfile);
      localStorage.setItem('lex_session', JSON.stringify(adminProfile));
    } else {
      console.log("No credentials in DB, checking fallback");
      // Fallback for first time or if DB is empty
      if (username === 'admin' && password === 'admin123') {
        console.log("Fallback matched, creating admin_config");
        const adminProfile: UserProfile = {
          uid: 'admin-id',
          email: 'admin@lexmanage.local',
          displayName: 'Administrador',
          role: 'admin'
        };
        // Create the config, profile and credentials in DB for future use
        try {
          await setDoc(doc(db, 'admin_config', 'primary'), {
            username: 'admin',
            password: 'admin123'
          });
          
          // Also ensure they exist in the main collections for management
          await setDoc(doc(db, 'users', 'admin-id'), {
            email: 'admin@lexmanage.local',
            displayName: 'Administrador',
            role: 'admin',
            createdAt: new Date().toISOString()
          }, { merge: true });

          await setDoc(doc(db, 'credentials', 'admin-cred'), {
            username: 'admin',
            password: 'admin123',
            userId: 'admin-id'
          }, { merge: true });

          console.log("admin_config, profile and credentials created successfully");
        } catch (err) {
          console.error("Error creating admin setup:", err);
        }
        setProfile(adminProfile);
        localStorage.setItem('lex_session', JSON.stringify(adminProfile));
      } else {
        console.log("Login failed: Invalid credentials");
        throw new Error('Credenciales incorrectas');
      }
    }
  };

  const logout = () => {
    setProfile(null);
    localStorage.removeItem('lex_session');
  };

  const value = {
    user: profile ? { uid: profile.uid, displayName: profile.displayName || '' } : null,
    profile,
    loading,
    isAdmin: profile?.role === 'admin',
    isLawyer: profile?.role === 'lawyer',
    isAssistant: profile?.role === 'assistant',
    login,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
