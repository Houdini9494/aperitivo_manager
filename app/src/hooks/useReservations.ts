import { useState, useEffect, useCallback } from 'react';
import type { Reservation } from '../types';
import { StorageService } from '../services/storage';

export function useReservations(date: string) {
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchReservations = useCallback(async () => {
        try {
            setLoading(true);
            const data = await StorageService.getReservations(date);
            setReservations(data);
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

        return () => unsubscribe();
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
