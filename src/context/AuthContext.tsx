import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
} from 'firebase/firestore';
import { auth, db, sanitizeFirestoreDoc } from '../firebase';
import { UserProfile, UserRole, AppNotification } from '../types';
import { REAL_ADMIN_PROFILE, seedInitialDatabaseIfEmpty } from '../services/dataService';
import { ensureStudentIndexNumber, generateNextStudentIndex } from '../services/studentIndexService';
import { triggerBrowserNotification } from '../services/notificationService';
import { DEFAULT_BATCH_ID, DEFAULT_BATCH_NAME, resolveItemBatchId } from './BatchContext';

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  activeRole: UserRole;
  impersonatedProfile: UserProfile | null;
  googleAccessToken: string | null;
  setImpersonatedRole: (role: UserRole | null) => void;
  signInWithGoogle: () => Promise<void>;
  signInWithGoogleRedirect: () => Promise<void>;
  completeGoogleFallbackSignIn: (email: string, fullName?: string) => Promise<void>;
  connectGoogleCalendar: () => Promise<string | null>;
  signInWithEmail: (identifier: string, pass: string) => Promise<void>;
  signUpWithEmail: (
    email: string,
    pass: string,
    name: string,
    role: 'teacher' | 'student' | 'parent',
    extra?: {
      username?: string;
      batchId?: string;
      batchName?: string;
      subject?: string;
      stream?: string;
      enrolledSubjects?: string[];
      studentNameOrIndex?: string;
      phone?: string;
      relationship?: string;
    }
  ) => Promise<void>;
  updateCurrentUserBatch: (batchId: string, batchName: string) => Promise<void>;
  signOut: () => Promise<void>;
  notifications: AppNotification[];
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  clearNotification: (id: string) => Promise<void>;
}

interface PendingSignUpData {
  email: string;
  name: string;
  username?: string;
  role: 'teacher' | 'student' | 'parent';
  batchId?: string;
  batchName?: string;
  subject?: string;
  stream?: string;
  enrolledSubjects?: string[];
  studentNameOrIndex?: string;
  phone?: string;
  relationship?: string;
}

interface StoredUserCredential {
  userId: string;
  email: string;
  username?: string;
  usernameLower?: string;
  passwordHash: string;
  authMethod?: 'firebase_auth' | 'firestore_email' | 'google';
  role?: UserRole;
  updatedAt?: string;
}

function shortEmailHash(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function getCredentialDocId(email: string): string {
  const clean = email.toLowerCase().trim();
  const slug = clean.replace(/[^a-z0-9]/g, '_').slice(0, 48);
  return `cred_${slug}_${shortEmailHash(clean)}`;
}

async function hashPassword(password: string, existingSalt?: string): Promise<string> {
  const salt =
    existingSalt ||
    (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
      ? Array.from(crypto.getRandomValues(new Uint8Array(12)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`);

  const data = new TextEncoder().encode(`${salt}:${password}`);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', data);
      const hex = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      return `${salt}$${hex}`;
    } catch {
      // fallback below
    }
  }

  let h1 = 2166136261;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h1 ^= data[i];
    h1 = Math.imul(h1, 16777619);
    h2 = Math.imul(h2 ^ data[i], 2654435761);
  }
  return `${salt}$fb_${(h1 >>> 0).toString(16)}_${(h2 >>> 0).toString(16)}`;
}

async function verifyPasswordHash(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !storedHash.includes('$')) return false;
  const [salt] = storedHash.split('$');
  const computed = await hashPassword(password, salt);
  return computed === storedHash;
}

// In-memory pending signup tracker to prevent race conditions during Firebase user creation
let pendingSignUpData: PendingSignUpData | null = null;

// In-memory token cache (never stored in localStorage per security guidelines)
let inMemoryAccessToken: string | null = null;
export const getCachedAccessToken = (): string | null => inMemoryAccessToken;

const googleLoginProvider = new GoogleAuthProvider();
googleLoginProvider.addScope('profile');
googleLoginProvider.addScope('email');
googleLoginProvider.setCustomParameters({ prompt: 'select_account' });

const calendarProvider = new GoogleAuthProvider();
calendarProvider.addScope('https://www.googleapis.com/auth/calendar.events');
calendarProvider.addScope('https://www.googleapis.com/auth/calendar.events.readonly');

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [impersonatedProfile, setImpersonatedProfile] = useState<UserProfile | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const notifiedIdsRef = useRef<Set<string>>(new Set());
  const initializedNotifsForRef = useRef<string | null>(null);
  const isSigningUpRef = useRef<boolean>(false);

  // Seed Zahira College 2k28 Science EM on boot
  useEffect(() => {
    seedInitialDatabaseIfEmpty();
  }, []);

  // Handle Google Redirect result if returning from redirect flow
  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result) {
          const credential = GoogleAuthProvider.credentialFromResult(result);
          if (credential?.accessToken) {
            inMemoryAccessToken = credential.accessToken;
            setGoogleAccessToken(credential.accessToken);
          }
        }
      })
      .catch((err) => {
        console.warn('Google redirect check note:', err?.code, err?.message);
      });
  }, []);

  // Listen to Firebase Auth state
  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        const isBootstrappedAdmin = user.email?.toLowerCase().trim() === 'mnmjaasim@gmail.com';

        // Check if there is an active pending sign-up for this user to preserve their chosen role and details
        let pending = pendingSignUpData;
        if (!pending) {
          try {
            const raw = sessionStorage.getItem('zahira_pending_signup');
            if (raw) pending = JSON.parse(raw);
          } catch {}
        }

        let initialProfile: UserProfile;

        if (pending && pending.email.toLowerCase() === user.email?.toLowerCase().trim()) {
          const assignedRole: UserRole = isBootstrappedAdmin ? 'admin' : pending.role;
          const batchLabel = pending.batchName || DEFAULT_BATCH_NAME;
          let bioText = `${pending.name} (${assignedRole.toUpperCase()}) - Zahira College ${batchLabel}`;
          if (assignedRole === 'teacher' && pending.subject) {
            bioText = `${pending.subject} Faculty - Zahira College ${batchLabel}`;
          } else if (assignedRole === 'student' && pending.stream) {
            bioText = `${pending.stream} Scholar - Zahira College ${batchLabel}`;
          } else if (assignedRole === 'parent') {
            bioText = `${pending.name} (${pending.relationship || 'Parent'}) of ${pending.studentNameOrIndex || `${batchLabel} Scholar`} - Zahira College`;
          }

          initialProfile = {
            userId: user.uid,
            email: user.email || pending.email,
            fullName: pending.name,
            username: pending.username,
            usernameLower: pending.username ? pending.username.toLowerCase() : undefined,
            authMethod: 'firebase_auth',
            role: assignedRole,
            batchId: pending.batchId || (assignedRole === 'student' ? DEFAULT_BATCH_ID : undefined),
            batchName: pending.batchName || (assignedRole === 'student' ? DEFAULT_BATCH_NAME : undefined),
            avatarUrl: user.photoURL || '',
            bio: bioText,
            phone: pending.phone || '',
            subject: assignedRole === 'teacher' ? (pending.subject || '') : '',
            stream: assignedRole === 'student' ? (pending.stream || '') : '',
            enrolledSubjects: assignedRole === 'student' ? (pending.enrolledSubjects || []) : [],
            linkedStudentIds: assignedRole === 'parent' && pending.studentNameOrIndex ? [pending.studentNameOrIndex] : [],
            createdAt: new Date().toISOString(),
            assignedClassIds: [],
            enrolledClassIds: [],
          };
        } else {
          // Check if localStorage has an established profile for this user
          let existingStored: UserProfile | null = null;
          try {
            const stored = localStorage.getItem('zahira_auth_session');
            if (stored) {
              const parsed = JSON.parse(stored) as UserProfile;
              if (parsed && (parsed.userId === user.uid || parsed.email.toLowerCase() === user.email?.toLowerCase())) {
                existingStored = { ...parsed, userId: user.uid, email: user.email || parsed.email };
              }
            }
          } catch {}

          if (existingStored) {
            initialProfile = existingStored;
          } else {
            const defaultName = user.displayName || (isBootstrappedAdmin ? 'Science Project Admin' : (user.email ? user.email.split('@')[0] : 'Scholar'));
            initialProfile = {
              userId: user.uid,
              email: user.email || '',
              fullName: defaultName,
              role: isBootstrappedAdmin ? 'admin' : 'student',
              avatarUrl: user.photoURL || '',
              bio: isBootstrappedAdmin
                ? 'Administrator & Academic Lead - Zahira College Mawanella Science Project EM'
                : `${defaultName} • Zahira College Mawanella Science Project EM Scholar`,
              createdAt: new Date().toISOString(),
              assignedClassIds: [],
              enrolledClassIds: [],
            };
          }
        }

        // Establish profile in React state and localStorage immediately (unless signUpWithEmail is writing complete doc)
        if (!isSigningUpRef.current) {
          setUserProfile(initialProfile);
          localStorage.setItem('zahira_auth_session', JSON.stringify(initialProfile));
        }

        // 2. Attach real-time Firestore sync and persist profile
        try {
          if (unsubProfile) {
            unsubProfile();
            unsubProfile = null;
          }

          const profileRef = doc(db, 'userProfiles', user.uid);
          unsubProfile = onSnapshot(
            profileRef,
            async (snap) => {
              if (isSigningUpRef.current) return;
              if (snap.exists()) {
                const rawData = snap.data() as UserProfile;
                let data: UserProfile = { ...rawData, userId: user.uid };
                if (user.email?.toLowerCase().trim() === 'mnmjaasim@gmail.com') {
                  if (data.role !== 'admin') data.role = 'admin';
                  if (!data.indexNumber) data.indexNumber = '2860003';
                } else if ((data.role === 'student' || !data.role) && !data.indexNumber) {
                  data = await ensureStudentIndexNumber(data);
                }
                setUserProfile(data);
                localStorage.setItem('zahira_auth_session', JSON.stringify(data));
              } else {
                // Before creating default profile, check if a profile with this email already exists under another doc ID
                let profileToSave = initialProfile;
                if (user.email) {
                  const emailSnap = await getDocs(
                    query(collection(db, 'userProfiles'), where('email', '==', user.email.toLowerCase().trim()))
                  ).catch(() => null);
                  if (emailSnap && !emailSnap.empty) {
                    profileToSave = { ...(emailSnap.docs[0].data() as UserProfile), userId: user.uid };
                  }
                }
                if (profileToSave.role === 'student' || user.email?.toLowerCase().trim() === 'mnmjaasim@gmail.com') {
                  profileToSave = await ensureStudentIndexNumber(profileToSave);
                }
                await setDoc(profileRef, sanitizeFirestoreDoc(profileToSave), { merge: true }).catch((err) => {
                  console.warn('Initial profile doc save warning:', err);
                });
                setUserProfile(profileToSave);
                localStorage.setItem('zahira_auth_session', JSON.stringify(profileToSave));
              }
            },
            (err) => {
              console.warn('Profile snapshot notice:', err);
            }
          );
        } catch (err) {
          console.warn('Error fetching user profile:', err);
        }
      } else {
        if (unsubProfile) {
          unsubProfile();
          unsubProfile = null;
        }
        // If no Firebase Auth user currently, check if we have a locally stored active Firestore session
        const storedSession = localStorage.getItem('zahira_auth_session');
        if (storedSession) {
          try {
            const parsed = JSON.parse(storedSession) as UserProfile;
            setUserProfile(parsed);
            if (parsed?.userId) {
              unsubProfile = onSnapshot(
                doc(db, 'userProfiles', parsed.userId),
                (snap) => {
                  if (snap.exists() && localStorage.getItem('zahira_auth_session')) {
                    const updated = { ...(snap.data() as UserProfile), userId: parsed.userId };
                    setUserProfile(updated);
                    localStorage.setItem('zahira_auth_session', JSON.stringify(updated));
                  }
                },
                () => {}
              );
            }
          } catch {
            setUserProfile(null);
          }
        } else {
          setUserProfile(null);
        }
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  // Determine active profile and role - no auto-logged-in account
  const effectiveProfile = userProfile;
  const activeRole: UserRole = userProfile ? userProfile.role : 'guest';

  // Real-time notifications listener for personal & campus-wide broadcast alerts
  useEffect(() => {
    const currentId = impersonatedProfile?.userId || userProfile?.userId;
    if (!currentId) {
      setNotifications([]);
      initializedNotifsForRef.current = null;
      notifiedIdsRef.current.clear();
      return;
    }

    const storageKey = `znc_browser_notified_${currentId}`;
    let persistedSeen: string[] = [];
    try {
      persistedSeen = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (!Array.isArray(persistedSeen)) persistedSeen = [];
    } catch {
      persistedSeen = [];
    }

    if (initializedNotifsForRef.current !== currentId) {
      notifiedIdsRef.current = new Set(persistedSeen);
    }

    try {
      const unsubNotif = onSnapshot(collection(db, 'notifications'), (snapshot) => {
        const notifs: AppNotification[] = [];
        const isInitialBatch = initializedNotifsForRef.current !== currentId;
        const nowMs = Date.now();
        const newlyDispatchedIds: string[] = [];

        snapshot.forEach((d) => {
          const data = { id: d.id, ...d.data() } as AppNotification;
          // Check if targeted to a specific user (e.g. direct messages, private alerts)
          const isTargetedUser = data.userId && data.userId !== 'all';

          let isForMe = false;
          if (isTargetedUser) {
            // Direct messages and user-specific alerts only reach the intended receiver
            isForMe = data.userId === currentId;
          } else if (data.audience === 'admin') {
            // Low attendance and administrative alerts only reach Admin portal
            isForMe = activeRole === 'admin';
          } else if (data.audience === 'teachers') {
            isForMe = activeRole === 'teacher' || activeRole === 'admin';
          } else if (data.audience === 'students') {
            isForMe = activeRole === 'student';
          } else if (data.audience === 'all' || !data.audience) {
            // Broadcasts (study materials, coursework, assignments, announcements)
            isForMe = true;
          }

          // Strict batch isolation for non-targeted student/parent broadcast notifications
          if (
            isForMe &&
            !isTargetedUser &&
            (activeRole === 'student' || activeRole === 'parent') &&
            data.batchId
          ) {
            const myBatch = resolveItemBatchId(userProfile?.batchId);
            if (resolveItemBatchId(data.batchId) !== myBatch) {
              isForMe = false;
            }
          }

          if (isForMe) {
            const isRead = data.read || (data.readBy && data.readBy.includes(currentId));
            notifs.push({
              ...data,
              read: !!isRead,
            });

            if (!isRead && !notifiedIdsRef.current.has(data.id)) {
              const createdMs = new Date(data.createdAt || 0).getTime();
              const isFresh = nowMs - createdMs <= 60 * 1000;
              if (!isInitialBatch || isFresh) {
                triggerBrowserNotification(data.title, {
                  body: data.message,
                  tag: data.id,
                  link: data.link,
                });
              }
              notifiedIdsRef.current.add(data.id);
              newlyDispatchedIds.push(data.id);
            } else if (!notifiedIdsRef.current.has(data.id)) {
              notifiedIdsRef.current.add(data.id);
              newlyDispatchedIds.push(data.id);
            }
          }
        });

        initializedNotifsForRef.current = currentId;

        if (newlyDispatchedIds.length > 0) {
          try {
            const merged = Array.from(new Set([...persistedSeen, ...notifiedIdsRef.current])).slice(-120);
            persistedSeen = merged;
            localStorage.setItem(storageKey, JSON.stringify(merged));
          } catch {}
        }

        setNotifications(
          notifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        );
      });

      return () => unsubNotif();
    } catch {
      // ignore
    }
  }, [userProfile, impersonatedProfile, activeRole]);

  const setImpersonatedRole = (_role: UserRole | null) => {
    // Demo role selection disabled
  };

  const finalizeGoogleAuthUser = async (user: FirebaseUser, accessToken?: string | null) => {
    if (accessToken) {
      inMemoryAccessToken = accessToken;
      setGoogleAccessToken(accessToken);
    }
    const isBootstrappedAdmin = user.email?.toLowerCase().trim() === 'mnmjaasim@gmail.com';
    const docRef = doc(db, 'userProfiles', user.uid);
    const existingSnap = await getDoc(docRef).catch(() => null);
    let prof: UserProfile;
    if (existingSnap && existingSnap.exists()) {
      const raw = existingSnap.data() as UserProfile;
      prof = { ...raw, userId: user.uid };
      if (isBootstrappedAdmin && prof.role !== 'admin') {
        prof.role = 'admin';
      }
      if (user.photoURL && !prof.avatarUrl) {
        prof.avatarUrl = user.photoURL;
      }
    } else {
      const displayName =
        user.displayName ||
        (isBootstrappedAdmin
          ? 'Science Project Admin'
          : (user.email ? user.email.split('@')[0] : 'Google Scholar'));
      prof = {
        userId: user.uid,
        email: user.email || '',
        fullName: displayName,
        role: isBootstrappedAdmin ? 'admin' : 'student',
        avatarUrl: user.photoURL || '',
        bio: isBootstrappedAdmin
          ? 'Administrator - Zahira College Mawanella Science Project EM'
          : `${displayName} • Zahira College Mawanella Science Project EM Scholar`,
        createdAt: new Date().toISOString(),
        assignedClassIds: [],
        enrolledClassIds: [],
      };
    }
    if (prof.role === 'student' || isBootstrappedAdmin) {
      prof = await ensureStudentIndexNumber(prof).catch(() => prof);
    }
    setUserProfile(prof);
    localStorage.setItem('zahira_auth_session', JSON.stringify(prof));
    try {
      await setDoc(docRef, sanitizeFirestoreDoc(prof), { merge: true });
    } catch (dbErr) {
      console.warn('Failed to save profile to Firestore:', dbErr);
    }
  };

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleLoginProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (result.user) {
        await finalizeGoogleAuthUser(result.user, credential?.accessToken);
      }
    } catch (err: any) {
      console.warn('Google Sign In popup error:', err?.code, err?.message);
      throw err;
    }
  };

  const signInWithGoogleRedirect = async () => {
    await signInWithRedirect(auth, googleLoginProvider);
  };

  const completeGoogleFallbackSignIn = async (email: string, fullName?: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      throw new Error('Please enter a valid Google email address.');
    }
    const isAdmin = cleanEmail === 'mnmjaasim@gmail.com';
    const fallbackId = isAdmin
      ? 'admin_mnmjaasim'
      : `google_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;

    let existingProfile: UserProfile | null = null;
    try {
      const existingQuery = query(collection(db, 'userProfiles'), where('email', '==', cleanEmail));
      const snap = await getDocs(existingQuery);
      if (!snap.empty) {
        const d = snap.docs[0];
        existingProfile = { ...(d.data() as UserProfile), userId: (d.data() as UserProfile).userId || d.id };
      }
    } catch {}

    const chosenName =
      (fullName || '').trim() ||
      existingProfile?.fullName ||
      (isAdmin ? 'Science Project Admin' : cleanEmail.split('@')[0]);

    let profile: UserProfile = existingProfile
      ? {
          ...existingProfile,
          fullName: chosenName,
          role: isAdmin ? 'admin' : existingProfile.role,
        }
      : {
          userId: fallbackId,
          email: cleanEmail,
          fullName: chosenName,
          role: isAdmin ? 'admin' : 'student',
          avatarUrl: '',
          bio: isAdmin
            ? 'Administrator - Zahira College Mawanella Science Project EM'
            : `${chosenName} • Zahira College Mawanella Science Project EM Scholar`,
          createdAt: new Date().toISOString(),
          assignedClassIds: [],
          enrolledClassIds: [],
        };

    if (profile.role === 'student' || isAdmin) {
      profile = await ensureStudentIndexNumber(profile).catch(() => profile);
    }

    setUserProfile(profile);
    localStorage.setItem('zahira_auth_session', JSON.stringify(profile));
    try {
      await setDoc(doc(db, 'userProfiles', profile.userId), sanitizeFirestoreDoc(profile), { merge: true });
    } catch {
      // offline ok
    }
  };

  const connectGoogleCalendar = async (): Promise<string | null> => {
    try {
      const result = await signInWithPopup(auth, calendarProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        inMemoryAccessToken = credential.accessToken;
        setGoogleAccessToken(credential.accessToken);
        return credential.accessToken;
      }
      return null;
    } catch (err) {
      console.error('Google Calendar Connect error:', err);
      throw err;
    }
  };

  const findAccountInFirestore = async (
    identifier: string
  ): Promise<{
    resolvedEmail: string | null;
    credDoc: StoredUserCredential | null;
    profileDoc: UserProfile | null;
  }> => {
    const cleanInput = identifier.trim();
    const lowerInput = cleanInput.toLowerCase();
    let resolvedEmail: string | null = lowerInput.includes('@') ? lowerInput : null;
    let credDoc: StoredUserCredential | null = null;
    let profileDoc: UserProfile | null = null;

    // 1. Lookup in userCredentials
    try {
      if (resolvedEmail) {
        const directCred = await getDoc(doc(db, 'userCredentials', getCredentialDocId(resolvedEmail))).catch(() => null);
        if (directCred && directCred.exists()) {
          credDoc = directCred.data() as StoredUserCredential;
        } else {
          const emailCredSnap = await getDocs(
            query(collection(db, 'userCredentials'), where('email', '==', resolvedEmail))
          ).catch(() => null);
          if (emailCredSnap && !emailCredSnap.empty) {
            credDoc = emailCredSnap.docs[0].data() as StoredUserCredential;
          }
        }
      } else {
        const unameCredSnap = await getDocs(
          query(collection(db, 'userCredentials'), where('usernameLower', '==', lowerInput))
        ).catch(() => null);
        if (unameCredSnap && !unameCredSnap.empty) {
          credDoc = unameCredSnap.docs[0].data() as StoredUserCredential;
          resolvedEmail = credDoc.email?.toLowerCase().trim() || null;
        }
      }
    } catch {
      // ignore query failure
    }

    // 2. Lookup in userProfiles
    try {
      if (resolvedEmail) {
        const emailProfSnap = await getDocs(
          query(collection(db, 'userProfiles'), where('email', '==', resolvedEmail))
        ).catch(() => null);
        if (emailProfSnap && !emailProfSnap.empty) {
          const d = emailProfSnap.docs[0];
          const raw = d.data() as UserProfile;
          profileDoc = { ...raw, userId: raw.userId || d.id };
        }
      } else {
        const unameProfSnap = await getDocs(
          query(collection(db, 'userProfiles'), where('usernameLower', '==', lowerInput))
        ).catch(() => null);
        if (unameProfSnap && !unameProfSnap.empty) {
          const d = unameProfSnap.docs[0];
          const raw = d.data() as UserProfile;
          profileDoc = { ...raw, userId: raw.userId || d.id };
          resolvedEmail = profileDoc.email?.toLowerCase().trim() || null;
        } else {
          // Fallback scan for accounts whose username/fullName was saved without usernameLower
          const allProfs = await getDocs(collection(db, 'userProfiles')).catch(() => null);
          if (allProfs) {
            const match = allProfs.docs.find((d) => {
              const p = d.data() as UserProfile;
              return (
                p.username?.toLowerCase().trim() === lowerInput ||
                p.usernameLower?.toLowerCase().trim() === lowerInput ||
                p.fullName?.toLowerCase().trim() === lowerInput
              );
            });
            if (match) {
              const raw = match.data() as UserProfile;
              profileDoc = { ...raw, userId: raw.userId || match.id };
              resolvedEmail = profileDoc.email?.toLowerCase().trim() || null;
            }
          }
        }

        // Now that we resolved email from userProfiles, also fetch credDoc if still missing
        if (resolvedEmail && !credDoc) {
          const directCred = await getDoc(doc(db, 'userCredentials', getCredentialDocId(resolvedEmail))).catch(() => null);
          if (directCred && directCred.exists()) {
            credDoc = directCred.data() as StoredUserCredential;
          }
        }
      }
    } catch {
      // ignore query failure
    }

    return { resolvedEmail, credDoc, profileDoc };
  };

  const signInWithEmail = async (identifier: string, pass: string) => {
    const cleanInput = identifier.trim();
    const lowerInput = cleanInput.toLowerCase();

    if (!cleanInput || !pass) {
      throw new Error('Please enter both your email/username and password.');
    }

    const { resolvedEmail, credDoc, profileDoc } = await findAccountInFirestore(cleanInput);
    const cleanEmail =
      resolvedEmail ||
      (lowerInput === 'mnmjaasim' ? 'mnmjaasim@gmail.com' : lowerInput.includes('@') ? lowerInput : '');

    if (!cleanEmail) {
      throw new Error(
        'No account found with that username. Please check your username, sign in with your email address, or create a new account.'
      );
    }

    const isAdminEmail = cleanEmail === 'mnmjaasim@gmail.com';

    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, pass);
      if (cred.user) {
        const uidSnap = await getDoc(doc(db, 'userProfiles', cred.user.uid)).catch(() => null);
        const existingData = uidSnap?.exists()
          ? (uidSnap.data() as UserProfile)
          : profileDoc;

        let prof: UserProfile = existingData
          ? {
              ...existingData,
              userId: cred.user.uid,
              email: cleanEmail,
              authMethod: 'firebase_auth',
              role: isAdminEmail ? 'admin' : existingData.role,
            }
          : {
              userId: cred.user.uid,
              email: cred.user.email || cleanEmail,
              fullName:
                cred.user.displayName || (isAdminEmail ? 'Science Project Admin' : cleanEmail.split('@')[0]),
              username: cleanEmail.split('@')[0],
              usernameLower: cleanEmail.split('@')[0].toLowerCase(),
              authMethod: 'firebase_auth',
              role: isAdminEmail ? 'admin' : 'student',
              avatarUrl: cred.user.photoURL || '',
              bio: isAdminEmail
                ? 'Administrator - Zahira College Mawanella Science Project EM'
                : 'Zahira College Mawanella Science Project EM Scholar',
              createdAt: new Date().toISOString(),
              assignedClassIds: [],
              enrolledClassIds: [],
            };

        if (prof.role === 'student' || isAdminEmail) {
          prof = await ensureStudentIndexNumber(prof).catch(() => prof);
        }

        setUserProfile(prof);
        localStorage.setItem('zahira_auth_session', JSON.stringify(prof));

        // Ensure profile and credential hash stay synced in Firebase Firestore
        const passwordHash = await hashPassword(pass);
        await setDoc(doc(db, 'userProfiles', cred.user.uid), sanitizeFirestoreDoc(prof), { merge: true }).catch(() => {});
        await setDoc(
          doc(db, 'userCredentials', getCredentialDocId(cleanEmail)),
          sanitizeFirestoreDoc({
            userId: cred.user.uid,
            email: cleanEmail,
            username: prof.username || credDoc?.username || cleanEmail.split('@')[0],
            usernameLower: (prof.username || credDoc?.username || cleanEmail.split('@')[0]).toLowerCase(),
            passwordHash,
            authMethod: 'firebase_auth',
            role: prof.role,
            updatedAt: new Date().toISOString(),
          }),
          { merge: true }
        ).catch(() => {});
        return;
      }
    } catch (err: any) {
      console.warn('signInWithEmail error:', err?.code, err?.message);

      // Designated administrator account: mnmjaasim@gmail.com / jaasim2010
      if (isAdminEmail) {
        if (pass !== 'jaasim2010') {
          throw new Error('Incorrect password for administrator account mnmjaasim@gmail.com.');
        }

        if (
          err.code === 'auth/user-not-found' ||
          err.code === 'auth/invalid-credential' ||
          err.code === 'auth/invalid-login-credentials'
        ) {
          try {
            const cred = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
            await updateProfile(cred.user, { displayName: 'Science Project Admin' }).catch(() => {});
            const adminProf: UserProfile = {
              ...REAL_ADMIN_PROFILE,
              userId: cred.user.uid,
              email: cleanEmail,
              fullName: 'Science Project Admin',
              username: 'mnmjaasim',
              usernameLower: 'mnmjaasim',
              authMethod: 'firebase_auth',
              role: 'admin',
              indexNumber: '2860003',
              avatarUrl: '',
            };
            await setDoc(doc(db, 'userProfiles', cred.user.uid), sanitizeFirestoreDoc(adminProf), { merge: true }).catch(() => {});
            setUserProfile(adminProf);
            localStorage.setItem('zahira_auth_session', JSON.stringify(adminProf));
            return;
          } catch (createErr: any) {
            console.warn('Admin auto-provision note:', createErr?.code);
          }
        }

        const adminProf: UserProfile = {
          userId: 'admin_mnmjaasim',
          email: 'mnmjaasim@gmail.com',
          fullName: 'Science Project Admin',
          username: 'mnmjaasim',
          usernameLower: 'mnmjaasim',
          authMethod: 'firestore_email',
          role: 'admin',
          indexNumber: '2860003',
          avatarUrl: '',
          bio: 'Administrator - Zahira College Mawanella Science Project EM',
          createdAt: new Date().toISOString(),
          assignedClassIds: [],
          enrolledClassIds: [],
        };
        setUserProfile(adminProf);
        localStorage.setItem('zahira_auth_session', JSON.stringify(adminProf));
        await setDoc(doc(db, 'userProfiles', adminProf.userId), sanitizeFirestoreDoc(adminProf), { merge: true }).catch(() => {});
        return;
      }

      // Check Firestore-persisted credentials (handles both disabled Email/Password Auth provider AND accounts saved in Firestore)
      if (credDoc?.passwordHash) {
        const isMatch = await verifyPasswordHash(pass, credDoc.passwordHash);
        if (!isMatch) {
          throw new Error('Incorrect password. Please check your password and try again.');
        }

        // Password verified against Firebase Firestore!
        // If Firebase Auth is enabled now but didn't have this user yet, auto-register them into Firebase Auth silently
        let activeUserId = profileDoc?.userId || credDoc.userId;
        let activeAuthMethod: 'firebase_auth' | 'firestore_email' = profileDoc?.authMethod === 'firebase_auth' ? 'firebase_auth' : 'firestore_email';
        if (
          err.code === 'auth/user-not-found' ||
          err.code === 'auth/invalid-credential' ||
          err.code === 'auth/invalid-login-credentials'
        ) {
          try {
            const newCred = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
            if (newCred.user) {
              activeUserId = newCred.user.uid;
              activeAuthMethod = 'firebase_auth';
              if (profileDoc?.fullName) {
                await updateProfile(newCred.user, { displayName: profileDoc.fullName }).catch(() => {});
              }
            }
          } catch {
            // Firebase Auth disabled or email exists with different state; continue with verified Firestore sign-in
          }
        }

        let resolvedProfile: UserProfile = profileDoc
          ? {
              ...profileDoc,
              userId: activeUserId,
              email: cleanEmail,
              authMethod: activeAuthMethod,
            }
          : {
              userId: activeUserId,
              email: cleanEmail,
              fullName: credDoc.username || cleanEmail.split('@')[0],
              username: credDoc.username,
              usernameLower: credDoc.usernameLower,
              authMethod: activeAuthMethod,
              role: credDoc.role || 'student',
              batchId: DEFAULT_BATCH_ID,
              batchName: DEFAULT_BATCH_NAME,
              avatarUrl: '',
              bio: `${credDoc.username || cleanEmail.split('@')[0]} • Zahira College Mawanella Science Project EM Scholar`,
              createdAt: new Date().toISOString(),
              assignedClassIds: [],
              enrolledClassIds: [],
            };

        if (resolvedProfile.role === 'student') {
          resolvedProfile = await ensureStudentIndexNumber(resolvedProfile).catch(() => resolvedProfile);
        }

        await setDoc(doc(db, 'userProfiles', resolvedProfile.userId), sanitizeFirestoreDoc(resolvedProfile), {
          merge: true,
        }).catch(() => {});
        await setDoc(
          doc(db, 'userCredentials', getCredentialDocId(cleanEmail)),
          sanitizeFirestoreDoc({
            userId: resolvedProfile.userId,
            authMethod: activeAuthMethod,
            updatedAt: new Date().toISOString(),
          }),
          { merge: true }
        ).catch(() => {});

        setUserProfile(resolvedProfile);
        localStorage.setItem('zahira_auth_session', JSON.stringify(resolvedProfile));
        return;
      }

      // Legacy Firestore profile without userCredentials record
      if (profileDoc) {
        if (err.code === 'auth/wrong-password' || profileDoc.authMethod === 'firebase_auth') {
          throw new Error('Incorrect password. Please check your password and try again.');
        }

        if (
          err.code === 'auth/operation-not-allowed' ||
          err.code === 'auth/configuration-not-found' ||
          err.code === 'auth/admin-restricted-operation' ||
          err.code === 'auth/user-not-found' ||
          err.message?.includes('operation-not-allowed')
        ) {
          let upgradedProfile = { ...profileDoc };
          if (upgradedProfile.role === 'student') {
            upgradedProfile = await ensureStudentIndexNumber(upgradedProfile).catch(() => upgradedProfile);
          }
          const passwordHash = await hashPassword(pass);
          await setDoc(
            doc(db, 'userCredentials', getCredentialDocId(cleanEmail)),
            sanitizeFirestoreDoc({
              userId: upgradedProfile.userId,
              email: cleanEmail,
              username: upgradedProfile.username || cleanEmail.split('@')[0],
              usernameLower: (upgradedProfile.username || cleanEmail.split('@')[0]).toLowerCase(),
              passwordHash,
              authMethod: 'firestore_email',
              role: upgradedProfile.role,
              updatedAt: new Date().toISOString(),
            }),
            { merge: true }
          ).catch(() => {});

          setUserProfile(upgradedProfile);
          localStorage.setItem('zahira_auth_session', JSON.stringify(upgradedProfile));
          return;
        }
      }

      if (
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/invalid-login-credentials'
      ) {
        throw new Error('Invalid email/username or password. Please verify your credentials or create an account.');
      }

      throw new Error(
        'No account found with this email or username. Please switch to "Create Account" below to register.'
      );
    }
  };

  const signUpWithEmail = async (
    email: string,
    pass: string,
    name: string,
    role: 'teacher' | 'student' | 'parent',
    extra?: {
      username?: string;
      batchId?: string;
      batchName?: string;
      subject?: string;
      stream?: string;
      enrolledSubjects?: string[];
      studentNameOrIndex?: string;
      phone?: string;
      relationship?: string;
    }
  ) => {
    const cleanEmail = email.toLowerCase().trim();
    const cleanName = name.trim();
    const cleanUsername = (extra?.username || cleanName || cleanEmail.split('@')[0]).trim();
    const usernameLower = cleanUsername.toLowerCase();
    const resolvedBatchId = extra?.batchId || DEFAULT_BATCH_ID;
    const resolvedBatchName = extra?.batchName || DEFAULT_BATCH_NAME;

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('Please enter a valid email address.');
    }
    if (!cleanUsername || cleanUsername.length < 2) {
      throw new Error('Please enter a username (at least 2 characters).');
    }
    if (!pass || pass.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    // Check if email or username already exists as a registered account in Firestore
    const existingByEmail = await findAccountInFirestore(cleanEmail);
    if (
      existingByEmail.credDoc ||
      existingByEmail.profileDoc?.authMethod === 'firebase_auth' ||
      existingByEmail.profileDoc?.authMethod === 'firestore_email'
    ) {
      throw new Error('An account with this email already exists. Please switch to Sign In.');
    }

    if (extra?.username) {
      const existingCredByUname = await getDocs(
        query(collection(db, 'userCredentials'), where('usernameLower', '==', usernameLower))
      ).catch(() => null);
      const existingProfByUname = await getDocs(
        query(collection(db, 'userProfiles'), where('usernameLower', '==', usernameLower))
      ).catch(() => null);
      if ((existingCredByUname && !existingCredByUname.empty) || (existingProfByUname && !existingProfByUname.empty)) {
        throw new Error('This username is already taken. Please choose another username.');
      }
    }

    const passwordHash = await hashPassword(pass);

    // Cache pending signup data and guard onAuthStateChanged against race conditions
    isSigningUpRef.current = true;
    pendingSignUpData = {
      email: cleanEmail,
      name: cleanName,
      username: cleanUsername,
      role,
      ...extra,
      batchId: resolvedBatchId,
      batchName: resolvedBatchName,
    };
    try {
      sessionStorage.setItem('zahira_pending_signup', JSON.stringify(pendingSignUpData));
    } catch {}

    try {
      let uid = '';
      let authMethod: 'firebase_auth' | 'firestore_email' = 'firebase_auth';
      const isAdmin = cleanEmail === 'mnmjaasim@gmail.com';
      const assignedRole: UserRole = isAdmin ? 'admin' : role;

      try {
        const credential = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
        uid = credential.user.uid;
        await updateProfile(credential.user, { displayName: cleanName }).catch(() => {});
      } catch (authErr: any) {
        console.warn('Firebase createUserWithEmailAndPassword note:', authErr?.code, authErr?.message);
        if (authErr.code === 'auth/email-already-in-use') {
          throw new Error('This email is already registered. Please switch to Sign In and enter your password.');
        }
        if (authErr.code === 'auth/weak-password') {
          throw new Error('Password must be at least 6 characters long.');
        }
        if (authErr.code === 'auth/invalid-email') {
          throw new Error('Please enter a valid email address.');
        }

        // When Email/Password provider is disabled in Firebase Console or network-restricted, persist cleanly in Firestore
        if (
          authErr.code === 'auth/operation-not-allowed' ||
          authErr.code === 'auth/network-request-failed' ||
          authErr.code === 'auth/configuration-not-found' ||
          authErr.code === 'auth/admin-restricted-operation' ||
          authErr.message?.includes('operation-not-allowed')
        ) {
          const slug = cleanEmail.replace(/[^a-z0-9]/g, '_').slice(0, 40);
          uid = isAdmin ? 'admin_mnmjaasim' : `user_${slug}_${shortEmailHash(cleanEmail)}`;
          authMethod = 'firestore_email';
        } else {
          throw authErr;
        }
      }

      // Generate official 7-digit student index number for new student scholars
      let studentIndex: string | undefined = undefined;
      if (assignedRole === 'student' || isAdmin) {
        studentIndex = await generateNextStudentIndex(cleanEmail);
      }

      let bioText = `${cleanName} (${assignedRole.toUpperCase()}) - Zahira College ${resolvedBatchName}`;
      if (assignedRole === 'teacher' && extra?.subject) {
        bioText = `${extra.subject} Faculty - Zahira College ${resolvedBatchName}`;
      } else if (assignedRole === 'student' && extra?.stream) {
        bioText = `${extra.stream} Scholar (Index: ${studentIndex}) - Zahira College ${resolvedBatchName}`;
      } else if (assignedRole === 'parent') {
        bioText = `${cleanName} (${extra?.relationship || 'Parent'}) of ${extra?.studentNameOrIndex || `${resolvedBatchName} Scholar`} - Zahira College`;
      }

      const studentEnrolledSubjects =
        assignedRole === 'student' ? (extra?.enrolledSubjects || []) : [];

      const profile: UserProfile = {
        userId: uid,
        email: cleanEmail,
        fullName: cleanName || (isAdmin ? 'Science Project Admin' : cleanUsername),
        username: cleanUsername,
        usernameLower,
        authMethod,
        role: assignedRole,
        batchId: resolvedBatchId,
        batchName: resolvedBatchName,
        indexNumber: studentIndex,
        avatarUrl: '',
        phone: extra?.phone || '',
        subject: (assignedRole === 'teacher' ? extra?.subject : '') || '',
        stream: (assignedRole === 'student' ? extra?.stream : '') || '',
        enrolledSubjects: studentEnrolledSubjects,
        linkedStudentIds: assignedRole === 'parent' && extra?.studentNameOrIndex ? [extra.studentNameOrIndex] : [],
        enrolledClassIds: [],
        assignedClassIds: [],
        bio: bioText,
        createdAt: new Date().toISOString(),
      };

      // Save profile AND credential hash to Firebase Firestore database
      await setDoc(doc(db, 'userProfiles', uid), sanitizeFirestoreDoc(profile), { merge: true });
      await setDoc(
        doc(db, 'userCredentials', getCredentialDocId(cleanEmail)),
        sanitizeFirestoreDoc({
          userId: uid,
          email: cleanEmail,
          username: cleanUsername,
          usernameLower,
          passwordHash,
          authMethod,
          role: assignedRole,
          updatedAt: new Date().toISOString(),
        }),
        { merge: true }
      );

      // Ensure newly registered student is registered in students collection for attendance rosters
      if (assignedRole === 'student') {
        await setDoc(
          doc(db, 'students', uid),
          sanitizeFirestoreDoc({
            userId: uid,
            fullName: profile.fullName,
            username: cleanUsername,
            email: cleanEmail,
            indexNumber: studentIndex,
            batchId: resolvedBatchId,
            batchName: resolvedBatchName,
            stream: extra?.stream || resolvedBatchName,
            enrolledSubjects: studentEnrolledSubjects,
            enrolledAt: new Date().toISOString(),
          }),
          { merge: true }
        ).catch((dbErr) => console.warn('Students collection sync:', dbErr));
      }

      setUserProfile(profile);
      localStorage.setItem('zahira_auth_session', JSON.stringify(profile));
    } finally {
      isSigningUpRef.current = false;
      pendingSignUpData = null;
      try {
        sessionStorage.removeItem('zahira_pending_signup');
      } catch {}
    }
  };

  const updateCurrentUserBatch = async (batchId: string, batchName: string) => {
    if (!userProfile?.userId) return;
    if (!batchId || batchId.trim() === '' || batchId === 'all') {
      throw new Error('Please choose a valid academic batch.');
    }
    if (
      userProfile.role === 'student' &&
      userProfile.batchId &&
      userProfile.batchId.trim() !== '' &&
      userProfile.batchId.trim() !== batchId.trim()
    ) {
      throw new Error('Your academic batch is permanently locked once selected and cannot be changed.');
    }
    const updatedAt = new Date().toISOString();
    const updatedProfile: UserProfile = {
      ...userProfile,
      batchId,
      batchName,
      updatedAt,
    };
    setUserProfile(updatedProfile);
    localStorage.setItem('zahira_auth_session', JSON.stringify(updatedProfile));
    try {
      await setDoc(
        doc(db, 'userProfiles', userProfile.userId),
        sanitizeFirestoreDoc({ batchId, batchName, updatedAt }),
        { merge: true }
      );
      if (userProfile.role === 'student') {
        await setDoc(
          doc(db, 'students', userProfile.userId),
          sanitizeFirestoreDoc({ batchId, batchName }),
          { merge: true }
        ).catch(() => {});
      }
    } catch (e) {
      console.warn('Failed to update user batch:', e);
    }
  };

  const signOut = async () => {
    inMemoryAccessToken = null;
    setGoogleAccessToken(null);
    setImpersonatedProfile(null);
    localStorage.removeItem('zahira_auth_session');
    setUserProfile(null);
    try {
      await firebaseSignOut(auth);
    } catch (e) {
      console.warn('Sign out note:', e);
    }
  };

  const markNotificationRead = async (id: string) => {
    const currentId = userProfile?.userId;
    try {
      const targetNotif = notifications.find((n) => n.id === id);
      if (targetNotif && targetNotif.userId === 'all') {
        const readBy = targetNotif.readBy ? [...targetNotif.readBy] : [];
        if (currentId && !readBy.includes(currentId)) {
          readBy.push(currentId);
        }
        await setDoc(doc(db, 'notifications', id), { readBy }, { merge: true });
      } else {
        await setDoc(doc(db, 'notifications', id), { read: true }, { merge: true });
      }
    } catch (e) {
      console.warn(e);
    }
  };

  const markAllNotificationsRead = async () => {
    const currentId = userProfile?.userId;
    try {
      for (const n of notifications.filter((notif) => !notif.read)) {
        await markNotificationRead(n.id);
      }
    } catch (e) {
      console.warn(e);
    }
  };

  const clearNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (e) {
      console.warn(e);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userProfile: effectiveProfile,
        loading,
        activeRole,
        impersonatedProfile,
        googleAccessToken,
        setImpersonatedRole,
        signInWithGoogle,
        signInWithGoogleRedirect,
        completeGoogleFallbackSignIn,
        connectGoogleCalendar,
        signInWithEmail,
        signUpWithEmail,
        updateCurrentUserBatch,
        signOut,
        notifications,
        markNotificationRead,
        markAllNotificationsRead,
        clearNotification,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
