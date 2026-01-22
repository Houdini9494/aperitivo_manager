import { useState } from 'react';
import { supabase } from '../services/supabase';

export function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (error) throw error;
        } catch (err: any) {
            console.error("Auth error:", err);
            setError('Credenziali non valide o errore di connessione.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            backgroundColor: 'var(--color-bg)',
            color: 'var(--color-primary)',
            padding: '20px' // Ensure breathing room on mobile
        }}>
            <div style={{
                backgroundColor: 'var(--color-surface)',
                padding: '2.5rem 2rem', // More spacious padding
                borderRadius: '24px', // Softer corners
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', // Deeper shadow
                width: '100%',
                maxWidth: '380px', // Nice compact width
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center', // Center everything horizontally
                position: 'relative'
            }}>
                <div style={{
                    marginBottom: '1.5rem',
                    position: 'relative',
                    display: 'flex',
                    justifyContent: 'center'
                }}>
                    <img
                        src="/logo.jpg"
                        alt="Logo"
                        style={{
                            width: '90px',
                            height: '90px',
                            borderRadius: '50%',
                            border: '3px solid var(--color-brand-gold)',
                            objectFit: 'contain',
                            backgroundColor: 'white' // Ensure visibility against any bg
                        }}
                    />
                </div>

                <h1 style={{
                    marginBottom: '2rem',
                    fontSize: '1.75rem',
                    fontWeight: 800,
                    color: 'var(--color-brand-dark)',
                    textAlign: 'center'
                }}>
                    Aperitivo Manager
                </h1>

                <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ width: '100%' }}>
                        <input
                            type="email"
                            placeholder="Email Staff"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            style={{
                                width: '100%',
                                padding: '14px 16px',
                                borderRadius: '12px',
                                border: '1px solid #e5e7eb',
                                fontSize: '1rem',
                                backgroundColor: '#f9fafb',
                                outline: 'none',
                                transition: 'border-color 0.2s, box-shadow 0.2s',
                                boxSizing: 'border-box'
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = 'var(--color-brand-gold)';
                                e.target.style.boxShadow = '0 0 0 3px rgba(253, 184, 51, 0.2)';
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = '#e5e7eb';
                                e.target.style.boxShadow = 'none';
                            }}
                        />
                    </div>

                    <div style={{ width: '100%' }}>
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            style={{
                                width: '100%',
                                padding: '14px 16px',
                                borderRadius: '12px',
                                border: '1px solid #e5e7eb',
                                fontSize: '1rem',
                                backgroundColor: '#f9fafb',
                                outline: 'none',
                                transition: 'border-color 0.2s',
                                boxSizing: 'border-box'
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = 'var(--color-brand-gold)';
                                e.target.style.boxShadow = '0 0 0 3px rgba(253, 184, 51, 0.2)';
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = '#e5e7eb';
                                e.target.style.boxShadow = 'none';
                            }}
                        />
                    </div>

                    {error && (
                        <div style={{
                            color: '#b91c1c',
                            fontSize: '0.875rem',
                            backgroundColor: '#fef2f2',
                            padding: '12px',
                            borderRadius: '8px',
                            textAlign: 'center',
                            border: '1px solid #fecaca'
                        }}>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            marginTop: '0.5rem',
                            width: '100%',
                            padding: '14px',
                            backgroundColor: 'var(--color-brand-gold)',
                            color: 'var(--color-brand-dark)',
                            border: 'none',
                            borderRadius: '12px',
                            fontWeight: '800',
                            fontSize: '1.05rem',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.7 : 1,
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                            transition: 'transform 0.1s, filter 0.2s'
                        }}
                    >
                        {loading ? 'Accesso in corso...' : 'Entra'}
                    </button>
                </form>

                <p style={{ marginTop: '2rem', fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center' }}>
                    Panificio '900 &copy; {new Date().getFullYear()}
                </p>
            </div>
        </div>
    );
}
