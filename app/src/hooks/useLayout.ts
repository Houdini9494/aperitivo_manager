import { useState, useEffect, useCallback, useRef } from 'react';
import type { Table } from '../types';
import { StorageService } from '../services/storage';

// Dimensioni del canvas (coerenti con MapView) per il clamp delle posizioni.
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;

function clampPosition(table: Table, x: number, y: number) {
    const maxX = Math.max(0, CANVAS_WIDTH - table.width);
    const maxY = Math.max(0, CANVAS_HEIGHT - table.height);
    return {
        x: Math.min(Math.max(0, x), maxX),
        y: Math.min(Math.max(0, y), maxY),
    };
}

export function useLayout(date: string, isAdmin: boolean = false) {
    const [tables, setTables] = useState<Table[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    // Ultima data già caricata: i refetch innescati dal realtime sulla stessa
    // data NON devono rimettere loading=true (farebbe lampeggiare l'intera UI
    // su tutti i tablet a ogni OCCUPA/LIBERA altrui).
    const loadedDateRef = useRef<string | null>(null);

    const fetchTables = useCallback(async () => {
        try {
            if (loadedDateRef.current !== date) setLoading(true);
            const data = await StorageService.getTables(date);
            setTables(data);
            loadedDateRef.current = date;
        } catch (err) {
            setError(err as Error);
        } finally {
            setLoading(false);
        }
    }, [date]);

    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            // Admin: assicura che il layout di default sia nel DB prima di editare,
            // così le scritture a singola riga non fanno sparire i tavoli.
            if (isAdmin) {
                await StorageService.ensureLayoutSeeded();
            }
            if (!cancelled) await fetchTables();
        };
        init();

        // Realtime: geometria (tables) + stato per-giorno (table_status)
        const subTables = StorageService.subscribeToTables(() => fetchTables());
        const subStatus = StorageService.subscribeToTableStatus(date, () => fetchTables());

        return () => {
            cancelled = true;
            subTables.unsubscribe();
            subStatus.unsubscribe();
        };
    }, [fetchTables, date, isAdmin]);

    // Salva l'intero layout (solo admin, "Salva layout predefinito")
    const saveTables = async (newTables: Table[]) => {
        try {
            await StorageService.saveTables(date, newTables);
            setTables(newTables);
        } catch (err) {
            console.error('Failed to save tables', err);
        }
    };

    // Salva/aggiunge UNA singola riga di geometria (drag end, editor, nuovo tavolo)
    const saveTable = async (table: Table) => {
        setTables(prev => {
            const idx = prev.findIndex(t => t.id === table.id);
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = table;
                return next;
            }
            return [...prev, table];
        });
        await StorageService.saveTable(date, table);
    };

    // Stato OCCUPA/LIBERA per-giorno (singola riga in table_status)
    const updateTableStatus = async (tableId: string, status: 'free' | 'occupied') => {
        setTables(prev => prev.map(t => t.id === tableId ? { ...t, status } : t));
        await StorageService.setTableStatus(tableId, date, status);
    };

    // Spostamento durante il drag: solo stato locale (no network), con clamp al canvas.
    // La persistenza avviene a fine drag tramite saveTable.
    const updateTablePosition = (id: string, x: number, y: number) => {
        setTables(prev => prev.map(t => {
            if (t.id !== id) return t;
            const pos = clampPosition(t, x, y);
            return { ...t, x: pos.x, y: pos.y };
        }));
    };

    const deleteTable = async (id: string) => {
        await StorageService.deleteTable(id);
        setTables(prev => prev.filter(t => t.id !== id));
    };

    const resetLayout = async () => {
        setLoading(true);
        await StorageService.resetLayout(date);
        await fetchTables();
        setLoading(false);
    };

    return {
        tables,
        loading,
        error,
        saveTables,
        saveTable,
        updateTableStatus,
        updateTablePosition,
        deleteTable,
        refresh: fetchTables,
        resetLayout,
    };
}
