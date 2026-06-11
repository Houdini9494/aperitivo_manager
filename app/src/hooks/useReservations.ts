import { useState, useEffect, useCallback, useRef } from 'react';
import type { Reservation } from '../types';
import { StorageService } from '../services/storage';

export function useReservations(date: string) {
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [loading, setLoading] = useState(true);
    // Come in useLayout: loader solo al primo caricamento di una data,
    // non sui refetch da realtime (evita il flash "Caricamento dati…").
    const loadedDateRef = useRef<string | null>(null);

    const fetchReservations = useCallback(async () => {
        try {
            if (loadedDateRef.current !== date) setLoading(true);
            const data = await StorageService.getReservations(date);
            setReservations(data);
            loadedDateRef.current = date;
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [date]);

    useEffect(() => {
        fetchReservations();

        // Subscribe
        const { unsubscribe } = StorageService.subscribeToReservations(date, () => {
            fetchReservations();
        });

        // Cleanup sincrono: non ritornare la Promise di removeChannel (item 9)
        return () => {
            unsubscribe();
        };
    }, [fetchReservations, date]);

    const addReservation = async (res: Reservation) => {
        await StorageService.saveReservation(res);
        await fetchReservations();
    };

    const deleteReservation = async (id: string) => {
        await StorageService.deleteReservation(id, date);
        await fetchReservations();
    };

    return { reservations, loading, addReservation, updateReservation: addReservation, deleteReservation, refresh: fetchReservations };
}
