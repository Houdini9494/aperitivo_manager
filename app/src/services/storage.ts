import { get, set, del, keys } from 'idb-keyval';
import { supabase } from './supabase';
import type { Table, Reservation } from '../types';

const STORAGE_KEYS = {
    MASTER_LAYOUT: 'layout_master',
    LAYOUT_PREFIX: 'layout_',
    RESERVATIONS_PREFIX: 'reservations_',
    PENDING: 'pending_reservations',
};

// Pending change tracking: id -> { date, op }
// (Sostituisce i vecchi pending_upserts / pending_deletes che non avevano la data,
//  causando prenotazioni offline che non si sincronizzavano mai — item 8.)
type PendingOp = 'upsert' | 'delete';
type PendingMap = Record<string, { date: string; op: PendingOp }>;

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

function rowToTable(row: any): Table {
    return {
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
    };
}

function tableToRow(t: Table) {
    return {
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
    };
}

export const StorageService = {
    // --- Layouts ---
    // Geometria dei tavoli (condivisa fra tutti i giorni) + stato OCCUPA/LIBERA
    // letto PER-GIORNO da table_status (item 5). Lo `status` salvato nella tabella
    // `tables` non è più la fonte di verità.
    async getTables(date: string): Promise<Table[]> {
        try {
            const [tablesRes, statusRes] = await Promise.all([
                supabase.from('tables').select('*'),
                supabase.from('table_status').select('table_id, status').eq('date', date),
            ]);

            if (tablesRes.error) throw tablesRes.error;

            if (tablesRes.data && tablesRes.data.length > 0) {
                // Mappa stato per-giorno: table_id -> status
                const statusMap = new Map<string, 'free' | 'occupied'>();
                if (!statusRes.error && statusRes.data) {
                    for (const s of statusRes.data as any[]) {
                        statusMap.set(s.table_id, s.status);
                    }
                }

                const mapped = tablesRes.data.map((row: any) => {
                    const table = rowToTable(row);
                    // Stato del giorno: se non c'è riga in table_status => libero
                    table.status = statusMap.get(table.id) ?? 'free';
                    return table;
                });

                // Cache locale (master = solo geometria, daily = con stato del giorno)
                await set(STORAGE_KEYS.MASTER_LAYOUT, mapped.map(t => ({ ...t, status: 'free' as const })));
                await set(`${STORAGE_KEYS.LAYOUT_PREFIX}${date}`, mapped);
                return mapped;
            }
        } catch (e) {
            console.warn('Supabase fetch failed, falling back to local', e);
        }

        // Fallback locale
        const dailyLayout = await get<Table[]>(`${STORAGE_KEYS.LAYOUT_PREFIX}${date}`);
        if (dailyLayout) return dailyLayout;
        const masterLayout = await get<Table[]>(STORAGE_KEYS.MASTER_LAYOUT);
        if (masterLayout) return masterLayout;
        return DEFAULT_TABLES;
    },

    // Salva l'INTERO layout (geometria). Usato solo dall'admin per "Salva layout
    // predefinito". Lo stato per-giorno NON viene toccato qui.
    async saveTables(date: string, tables: Table[], skipNetwork: boolean = false): Promise<void> {
        await set(`${STORAGE_KEYS.LAYOUT_PREFIX}${date}`, tables);
        await set(STORAGE_KEYS.MASTER_LAYOUT, tables);

        if (skipNetwork) return;

        try {
            const rows = tables.map(tableToRow);
            const { error } = await supabase.from('tables').upsert(rows);
            if (error) throw error;
        } catch (e) {
            console.error('Failed to sync tables to Supabase', e);
        }
    },

    // Semina il layout di default nel DB se è VUOTO. Va chiamata solo per gli
    // admin (la RLS impedisce allo staff di scrivere su `tables`).
    // Necessaria perché le scritture a singola riga + realtime, su un DB vuoto,
    // farebbero "sparire" i tavoli non ancora persistiti.
    async ensureLayoutSeeded(): Promise<void> {
        try {
            const { data, error } = await supabase.from('tables').select('id').limit(1);
            if (error) throw error;
            if (!data || data.length === 0) {
                const rows = DEFAULT_TABLES.map(tableToRow);
                const { error: upErr } = await supabase.from('tables').upsert(rows);
                if (upErr) throw upErr;
            }
        } catch (e) {
            // Per lo staff l'upsert fallisce per RLS: è atteso, ignoriamo.
            console.warn('ensureLayoutSeeded skipped/failed', e);
        }
    },

    // Salva/aggiorna UNA singola riga di geometria (item 6: niente più
    // last-write-wins sull'intero array durante drag/aggiunta/modifica).
    async saveTable(date: string, table: Table): Promise<void> {
        // Aggiorna cache locale del giorno
        const local = (await get<Table[]>(`${STORAGE_KEYS.LAYOUT_PREFIX}${date}`)) || [];
        const idx = local.findIndex(t => t.id === table.id);
        if (idx >= 0) local[idx] = table; else local.push(table);
        await set(`${STORAGE_KEYS.LAYOUT_PREFIX}${date}`, local);

        try {
            const { error } = await supabase.from('tables').upsert(tableToRow(table));
            if (error) throw error;
        } catch (e) {
            console.error('Failed to sync single table to Supabase', e);
        }
    },

    async saveMasterLayout(tables: Table[]): Promise<void> {
        await this.saveTables('master', tables); // Reuse
    },

    async deleteTable(tableId: string): Promise<void> {
        try {
            const { error } = await supabase.from('tables').delete().eq('id', tableId);
            if (error) throw error;
            // Pulisci anche eventuali stati per-giorno collegati
            await supabase.from('table_status').delete().eq('table_id', tableId);
        } catch (e) {
            console.error('Failed to delete table from Supabase', e);
        }
    },

    // Stato OCCUPA/LIBERA per-giorno: upsert della SINGOLA riga (item 5 + 6).
    async setTableStatus(tableId: string, date: string, status: 'free' | 'occupied'): Promise<void> {
        // Aggiorna cache locale del giorno (optimistic)
        const local = await get<Table[]>(`${STORAGE_KEYS.LAYOUT_PREFIX}${date}`);
        if (local) {
            const next = local.map(t => t.id === tableId ? { ...t, status } : t);
            await set(`${STORAGE_KEYS.LAYOUT_PREFIX}${date}`, next);
        }

        try {
            const { error } = await supabase
                .from('table_status')
                .upsert({ table_id: tableId, date, status, updated_at: new Date().toISOString() });
            if (error) throw error;
        } catch (e) {
            console.error('Failed to sync table status to Supabase', e);
        }
    },

    // --- Pending changes helpers ---
    async getPending(): Promise<PendingMap> {
        const pending = await get<PendingMap>(STORAGE_KEYS.PENDING);
        if (pending) return pending;
        // Migrazione soft: scarta i vecchi marcatori senza data (non sincronizzabili)
        await del('pending_upserts').catch(() => {});
        await del('pending_deletes').catch(() => {});
        return {};
    },

    async setPending(pending: PendingMap): Promise<void> {
        await set(STORAGE_KEYS.PENDING, pending);
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

        // 3. Load Pending Changes (filtra per gli id che ci interessano)
        const pending = await this.getPending();
        const pendingUpserts = Object.keys(pending).filter(id => pending[id].op === 'upsert');
        const pendingDeletes = Object.keys(pending).filter(id => pending[id].op === 'delete');

        // 4. Merge Logic
        let merged = remoteData || localData;

        if (remoteData) {
            // A. Remove items we deleted locally
            merged = merged.filter(r => !pendingDeletes.includes(r.id));

            // B. Apply items we created/updated locally
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

            // D. Save merged truth back to local
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

        // 2. Track as Pending (con la data, così il sync funziona anche se stai
        //    guardando un altro giorno — item 8)
        const pending = await this.getPending();
        pending[reservation.id] = { date: reservation.date, op: 'upsert' };
        await this.setPending(pending);

        // 3. Try Sync immediately (tutte le date pendenti)
        this.syncPendingChanges();
    },

    async deleteReservation(id: string, date: string): Promise<void> {
        // 1. Delete Local
        const key = `${STORAGE_KEYS.RESERVATIONS_PREFIX}${date}`;
        const current = (await get<Reservation[]>(key)) || [];
        const filtered = current.filter(r => r.id !== id);
        await set(key, filtered);

        // 2. Track as Pending Delete (con la data)
        const pending = await this.getPending();
        pending[id] = { date, op: 'delete' };
        await this.setPending(pending);

        // 3. Try Sync
        this.syncPendingChanges();
    },

    // Svuota TUTTE le modifiche pendenti, su TUTTE le date (item 8).
    async syncPendingChanges() {
        const pending = await this.getPending();
        const ids = Object.keys(pending);
        if (ids.length === 0) return;

        try {
            for (const id of ids) {
                const entry = pending[id];

                if (entry.op === 'delete') {
                    const { error } = await supabase.from('reservations').delete().eq('id', id);
                    if (!error) {
                        const fresh = await this.getPending();
                        delete fresh[id];
                        await this.setPending(fresh);
                    }
                } else {
                    // upsert: ricava il dato dalla cache locale della sua data
                    const localData = await get<Reservation[]>(`${STORAGE_KEYS.RESERVATIONS_PREFIX}${entry.date}`) || [];
                    const r = localData.find(x => x.id === id);
                    if (!r) {
                        // Dato locale non più presente: rimuovi il pending orfano
                        const fresh = await this.getPending();
                        delete fresh[id];
                        await this.setPending(fresh);
                        continue;
                    }
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
                        const fresh = await this.getPending();
                        delete fresh[id];
                        await this.setPending(fresh);
                    }
                }
            }
        } catch {
            // Ancora offline: i pending restano per il prossimo tentativo.
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

    subscribeToTableStatus(date: string, callback: () => void) {
        const channel = supabase.channel(`public:table_status:${date}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'table_status', filter: `date=eq.${date}` }, () => {
                callback();
            })
            .subscribe();
        return { unsubscribe: () => supabase.removeChannel(channel) };
    },

    subscribeToReservations(date: string, callback: () => void) {
        const channel = supabase.channel(`public:reservations:${date}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: `date=eq.${date}` }, () => {
                callback();
            })
            .subscribe();
        return { unsubscribe: () => supabase.removeChannel(channel) };
    },

    // --- Maintenance ---
    async resetLayout(date: string): Promise<void> {
        try {
            await supabase.from('tables').delete().in('room_id', ['internal', 'external']);
        } catch (e) {
            console.error('Failed to clear Supabase tables', e);
        }
        await this.saveTables(date, DEFAULT_TABLES);
    },

    // Manutenzione LOCALE: rimuove dall'IndexedDB le chiavi più vecchie della
    // retention così lo storage del tablet non cresce all'infinito (item 15).
    // La cancellazione lato server è gestita da cleanup_old_reservations()
    // schedulata in Supabase (vedi SECURITY_DB.sql) — NON più dal client (item 4).
    async cleanOldData(retentionDays: number = 30): Promise<void> {
        try {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - retentionDays);
            const cutoffStr = cutoff.toISOString().split('T')[0];

            const allKeys = (await keys()) as string[];

            for (const k of allKeys) {
                if (typeof k !== 'string') continue;
                const isReservation = k.startsWith(STORAGE_KEYS.RESERVATIONS_PREFIX);
                const isLayout = k.startsWith(STORAGE_KEYS.LAYOUT_PREFIX) && k !== STORAGE_KEYS.MASTER_LAYOUT;
                if (!isReservation && !isLayout) continue;

                const datePart = k.substring(k.indexOf('_') + 1);
                // Solo chiavi con data valida YYYY-MM-DD anteriore al cutoff
                if (/^\d{4}-\d{2}-\d{2}$/.test(datePart) && datePart < cutoffStr) {
                    await del(k);
                }
            }
        } catch (e) {
            console.error('Failed to clean old local data', e);
        }
    }
};

export { DEFAULT_TABLES };
