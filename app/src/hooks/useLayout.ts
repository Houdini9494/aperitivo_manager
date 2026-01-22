import { useState, useEffect, useCallback } from 'react';
import type { Table } from '../types';
import { StorageService } from '../services/storage';

export function useLayout(date: string) {
    const [tables, setTables] = useState<Table[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchTables = useCallback(async () => {
        try {
            setLoading(true);
            const data = await StorageService.getTables(date);
            setTables(data);
        } catch (err) {
            setError(err as Error);
        } finally {
            setLoading(false);
        }
    }, [date]);

    useEffect(() => {
        fetchTables();

        // Subscribe to Realtime changes
        const { unsubscribe } = StorageService.subscribeToTables(() => {
            fetchTables();
        });

        return () => {
            unsubscribe();
        };
    }, [fetchTables]);

    const saveTables = async (newTables: Table[]) => {
        try {
            await StorageService.saveTables(date, newTables);
            setTables(newTables);
        } catch (err) {
            console.error('Failed to save tables', err);
            // Revert or show error? For now just log.
        }
    };

    const updateTableStatus = async (tableId: string, status: 'free' | 'occupied') => {
        const newTables = tables.map(t => t.id === tableId ? { ...t, status } : t);
        // Optimistic update
        setTables(newTables);
        await StorageService.saveTables(date, newTables);
    };

    const updateTablePosition = async (id: string, x: number, y: number) => {
        const newTables = tables.map(t => t.id === id ? { ...t, x, y } : t);
        setTables(newTables);
        // Save to storage LOCAL ONLY to avoid spamming Supabase while dragging
        await StorageService.saveTables(date, newTables, true);
    };

    const resetLayout = async () => {
        setLoading(true);
        await StorageService.resetLayout(date);
        await fetchTables();
        setLoading(false);
    };

    return { tables, loading, error, saveTables, updateTableStatus, updateTablePosition, refresh: fetchTables, resetLayout };
}
