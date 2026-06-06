import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';

type UserRole = 'admin' | 'staff' | null;

interface AuthContextType {
    user: User | null;
    session: Session | null;
    role: UserRole;
    loading: boolean;
    signOut: () => Promise<void>;
    isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Se la query del ruolo non risponde entro questo tempo (rete del locale ballerina),
// procediamo comunque come 'staff' invece di restare bloccati sul loader (item 12).
const ROLE_FETCH_TIMEOUT_MS = 5000;

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [role, setRole] = useState<UserRole>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 1. Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchUserRole(session.user.id);
            } else {
                setLoading(false);
            }
        });

        // 2. Listen for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchUserRole(session.user.id);
            } else {
                setRole(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const fetchUserRole = async (userId: string) => {
        try {
            const query = supabase
                .from('profiles')
                .select('role')
                .eq('id', userId)
                .single();

            // Timeout di sicurezza: se la rete è lenta, non blocchiamo l'app.
            const timeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('role-timeout')), ROLE_FETCH_TIMEOUT_MS)
            );

            const { data, error } = await Promise.race([query, timeout]) as Awaited<typeof query>;

            if (error) {
                console.error('Error fetching role:', error);
                setRole('staff'); // Fallback degradato
            } else {
                setRole(data?.role as UserRole);
            }
        } catch (e) {
            console.error('Exception/timeout fetching role:', e);
            setRole('staff'); // Procedi come staff invece di restare bloccato
        } finally {
            setLoading(false);
        }
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        setRole(null);
        setUser(null);
        setSession(null);
    };

    const value = {
        user,
        session,
        role,
        loading,
        signOut,
        isAdmin: role === 'admin'
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
