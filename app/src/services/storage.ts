import { get, set } from 'idb-keyval';
import { supabase } from './supabase';
import type { Table, Reservation } from '../types';

const STORAGE_KEYS = {
    MASTER_LAYOUT: 'layout_master',
    LAYOUT_PREFIX: 'layout_',
    RESERVATIONS_PREFIX: 'reservations_',
};

// Initial Mock Data
const DEFAULT_TABLES: Table[] = [
    // Room: Internal - Tables (5 tables)
    ...Array.from({ length: 5 }).map((_, i) => ({
        id: `int-${i + 1}`,
        label: `Tavolo ${i + 1}`,
        roomId: 'internal' as const,
        x: 50 + (i % 4) * 120, // Grid loop 4
        y: 50 + Math.floor(i / 4) * 120,
        width: 100,
        height: 100,
        shape: 'square' as const,
        seats: 4,
        status: 'free' as const,
    })),
    // Room: Internal - Counters (Banconi) - 2 counters
    {
        id: 'counter-a',
        label: 'Bancone A',
        roomId: 'internal' as const,
        x: 600,
        y: 50,
        width: 80,
        height: 250,
        shape: 'rectangle' as const,
        seats: 2,
        status: 'free' as const,
    },
    {
        id: 'counter-b',
        label: 'Bancone B',
        roomId: 'internal' as const,
        x: 700,
        y: 50,
        width: 80,
        height: 250,
        shape: 'rectangle' as const,
        seats: 2,
        status: 'free' as const,
    },
    // Room: External (13 tables)
    ...Array.from({ length: 13 }).map((_, i) => ({
        id: `ext-${i + 1}`,
        label: `Esterno ${i + 1}`,
        roomId: 'external' as const,
        x: 50 + (i % 5) * 120, // Grid loop 5 for wider room
        y: 50 + Math.floor(i / 5) * 120,
        width: 100,
        height: 100,
        shape: 'square' as const,
        seats: 4,
        status: 'free' as const,
    })),
];

export const StorageService = {
    // --- Layouts ---
    async getTables(date: string): Promise<Table[]> {
        // 1. Try Supabase (Master Layout) - Treat layout as global for now to simplify multi-device sync
        try {
            const { data, error } = await supabase.from('tables').select('*');
            if (error) throw error;
            if (data && data.length > 0) {
                const mapped = data.map((row: any) => ({
                    id: row.id,
                    label: row.label,
                    roomId: row.room_id as any,
                    x: Number(row.x),
                    y: Number(row.y),
                    width: Number(row.width),
                    height: Number(row.height),
                    shape: row.shape,
                    seats: Number(row.seats),
                    status: row.status,
                }));
                // Cache locally as master and current daily
                await set(STORAGE_KEYS.MASTER_LAYOUT, mapped);
                await set(`${STORAGE_KEYS.LAYOUT_PREFIX}${date}`, mapped);
                return mapped;
            }
        } catch (e) {
            console.warn('Supabase fetch failed, falling back to local', e);
        }

        // 2. Fallback to Local
        const dailyLayout = await get<Table[]>(`${STORAGE_KEYS.LAYOUT_PREFIX}${date}`);
        if (dailyLayout) return dailyLayout;
        const masterLayout = await get<Table[]>(STORAGE_KEYS.MASTER_LAYOUT);
        if (masterLayout) return masterLayout;
        return DEFAULT_TABLES;
    },

    async saveTables(date: string, tables: Table[], skipNetwork: boolean = false): Promise<void> {
        // Save to Local (optimistic)
        await set(`${STORAGE_KEYS.LAYOUT_PREFIX}${date}`, tables);
        await set(STORAGE_KEYS.MASTER_LAYOUT, tables);

        if (skipNetwork) return;

        // Sync to Supabase
        try {
            const rows = tables.map(t => ({
                id: t.id,
                label: t.label,
                room_id: t.roomId,
                x: t.x,
                y: t.y,
                width: t.width,
                height: t.height,
                shape: t.shape,
                seats: t.seats,
                status: t.status,
            }));
            const { error } = await supabase.from('tables').upsert(rows);
            if (error) throw error;
        } catch (e) {
            console.error('Failed to sync tables to Supabase', e);
        }
    },

    async saveMasterLayout(tables: Table[]): Promise<void> {
        await this.saveTables('master', tables); // Reuse
    },

    async deleteTable(tableId: string): Promise<void> {
        try {
            const { error } = await supabase.from('tables').delete().eq('id', tableId);
            if (error) throw error;
        } catch (e) {
            console.error('Failed to delete table from Supabase', e);
        }
    },

    // --- Reservations ---
    async getReservations(date: string): Promise<Reservation[]> {
        let remoteData: Reservation[] | null = null;

        // 1. Try Fetch from Supabase
        try {
            const { data, error } = await supabase
                .from('reservations')
                .select('*')
                .eq('date', date);

            if (error) throw error;
            if (data) {
                remoteData = data.map((row: any) => ({
                    id: row.id,
                    customerName: row.customer_name,
                    customerPhone: row.customer_phone,
                    pax: Number(row.pax),
                    time: row.time,
                    date: row.date,
                    tableIds: row.table_ids,
                    notes: row.notes,
                    orders: row.orders
                }));
            }
        } catch (e) {
            console.warn('Supabase reservations fetch failed (Offline?)', e);
        }

        // 2. Load Local Data
        const localData = await get<Reservation[]>(`${STORAGE_KEYS.RESERVATIONS_PREFIX}${date}`) || [];

        // 3. Load Pending Changes
        const pendingUpserts = await get<string[]>('pending_upserts') || [];
        const pendingDeletes = await get<string[]>('pending_deletes') || [];

        // 4. Merge Logic
        let merged = remoteData || localData; // Start with Remote if available, else Local

        if (remoteData) {
            // If we have fresh remote data, we must re-apply our pending local changes
            // A. Remove items we deleted locally
            merged = merged.filter(r => !pendingDeletes.includes(r.id));

            // B. Apply items we created/updated locally
            // We need to find the *actual* local object for these IDs
            merged = merged.map(r => {
                if (pendingUpserts.includes(r.id)) {
                    const localVersion = localData.find(l => l.id === r.id);
                    return localVersion || r;
                }
                return r;
            });

            // C. Add completely new local items that aren't in remote yet
            const newLocalItems = localData.filter(l =>
                pendingUpserts.includes(l.id) && !merged.find(m => m.id === l.id)
            );
            merged = [...merged, ...newLocalItems];

            // D. Save this merged truth back to local storage
            await set(`${STORAGE_KEYS.RESERVATIONS_PREFIX}${date}`, merged);
        }

        return merged;
    },

    async saveReservation(reservation: Reservation): Promise<void> {
        // 1. Save Local (Optimistic)
        const key = `${STORAGE_KEYS.RESERVATIONS_PREFIX}${reservation.date}`;
        const current = (await get<Reservation[]>(key)) || [];
        const index = current.findIndex(r => r.id === reservation.id);
        if (index >= 0) current[index] = reservation;
        else current.push(reservation);
        await set(key, current);

        // 2. Track as Pending
        const pendingUpserts = await get<string[]>('pending_upserts') || [];
        if (!pendingUpserts.includes(reservation.id)) {
            await set('pending_upserts', [...pendingUpserts, reservation.id]);
        }
        // Remove from deletes if it was there (undone delete)
        const pendingDeletes = await get<string[]>('pending_deletes') || [];
        if (pendingDeletes.includes(reservation.id)) {
            await set('pending_deletes', pendingDeletes.filter(id => id !== reservation.id));
        }

        // 3. Try Sync immediately
        this.syncPendingChanges(reservation.date);
    },

    async deleteReservation(id: string, date: string): Promise<void> {
        // 1. Delete Local
        const key = `${STORAGE_KEYS.RESERVATIONS_PREFIX}${date}`;
        const current = (await get<Reservation[]>(key)) || [];
        const filtered = current.filter(r => r.id !== id);
        await set(key, filtered);

        // 2. Track as Pending Delete
        const pendingDeletes = await get<string[]>('pending_deletes') || [];
        if (!pendingDeletes.includes(id)) {
            await set('pending_deletes', [...pendingDeletes, id]);
        }
        // Remove from upserts if present
        const pendingUpserts = await get<string[]>('pending_upserts') || [];
        if (pendingUpserts.includes(id)) {
            await set('pending_upserts', pendingUpserts.filter(pid => pid !== id));
        }

        // 3. Try Sync
        this.syncPendingChanges(date);
    },

    async syncPendingChanges(dateStr?: string) {
        // Just a simple flush attempt. If it fails, it remains pending.
        const pendingUpserts = await get<string[]>('pending_upserts') || [];
        const pendingDeletes = await get<string[]>('pending_deletes') || [];

        if (pendingUpserts.length === 0 && pendingDeletes.length === 0) return;

        // Ensure we are online-ish? Supabase call will throw if not.
        try {
            // Process Deletes
            for (const id of pendingDeletes) {
                const { error } = await supabase.from('reservations').delete().eq('id', id);
                if (!error) {
                    const freshDeletes = await get<string[]>('pending_deletes') || [];
                    await set('pending_deletes', freshDeletes.filter(d => d !== id));
                }
            }

            // Process Upserts
            // We need to find the data. Since we don't store date in pending list efficiently yet,
            // we rely on the passed `dateStr` or we scan?
            // For MVP, we pass `dateStr` from the save call context. 
            // If we are just "coming online" without a specific date context, we might miss syncing until that date is opened.
            // This is an acceptable tradeoff for now to avoid scanning ALL local keys.
            if (dateStr && pendingUpserts.length > 0) {
                const localData = await get<Reservation[]>(`${STORAGE_KEYS.RESERVATIONS_PREFIX}${dateStr}`) || [];
                const toSync = localData.filter(r => pendingUpserts.includes(r.id));

                for (const r of toSync) {
                    const row = {
                        id: r.id,
                        customer_name: r.customerName,
                        customer_phone: r.customerPhone,
                        pax: r.pax,
                        time: r.time,
                        date: r.date,
                        table_ids: r.tableIds,
                        notes: r.notes,
                        orders: r.orders
                    };
                    const { error } = await supabase.from('reservations').upsert(row);
                    if (!error) {
                        const freshUpserts = await get<string[]>('pending_upserts') || [];
                        await set('pending_upserts', freshUpserts.filter(u => u !== r.id));
                    }
                }
            }

        } catch (e) {
            // Still offline, ignore.
            console.log('Sync attempt failed (Offline)');
        }
    },

    // --- Realtime Subscriptions ---
    subscribeToTables(callback: () => void) {
        const channel = supabase.channel('public:tables')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => {
                callback();
            })
            .subscribe();
        return { unsubscribe: () => supabase.removeChannel(channel) };
    },

    subscribeToReservations(date: string, callback: () => void) {
        // Filter by date not supported directly in filter string for all events simply, 
        // but we can filter client side or just listen to all reservations and check date?
        // 'filter' in postgres_changes accepts simple equality. `date=eq.${date}` should work.
        // However, date is a text column in my schema.
        const channel = supabase.channel(`public:reservations:${date}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: `date=eq.${date}` }, () => {
                callback();
            })
            .subscribe();
        return { unsubscribe: () => supabase.removeChannel(channel) };
    },

    // --- Maintenance ---
    async resetLayout(date: string): Promise<void> {
        // 1. Clear Supabase tables (delete all)
        try {
            // We can delete by matching all room_ids since we know them
            await supabase.from('tables').delete().in('room_id', ['internal', 'external']);
        } catch (e) {
            console.error('Failed to clear Supabase tables', e);
        }

        // 2. Overwrite with defaults (Local + Supabase via saveTables)
        await this.saveTables(date, DEFAULT_TABLES);
    },

    async cleanOldData(): Promise<void> {
        try {
            // Keep reservations from today onwards
            // Everything BEFORE today (YYYY-MM-DD) is considered "old" and deletable?
            // User requested "automatic cleanup". 
            // Let's decide a safe policy: Keep last 7 days history, delete older.
            // Or strictly: delete everything < today?
            // Usually restaurants might want history. Let's assume 30 days retention.
            const today = new Date();
            const retentionDate = new Date(today);
            retentionDate.setDate(today.getDate() - 30);
            const retentionStr = retentionDate.toISOString().split('T')[0];

            console.log('Running Auto-Cleanup for reservations older than:', retentionStr);

            const { error, count } = await supabase
                .from('reservations')
                .delete({ count: 'exact' })
                .lt('date', retentionStr); // Delete where date < retentionStr

            if (error) throw error;
            if (count && count > 0) {
                console.log(`Auto-Cleanup: Deleted ${count} old reservations.`);
            }
        } catch (e) {
            console.error('Failed to clean old data', e);
        }
    }
};

export { DEFAULT_TABLES };
