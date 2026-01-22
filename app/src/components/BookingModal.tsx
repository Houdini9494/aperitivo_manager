import React, { useState } from 'react';
import type { Table, Reservation } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface BookingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (reservation: Reservation) => void;
    tables: Table[];     // Available tables to choose from
    currentDate: string; // The date we are booking for
    initialReservation?: Reservation | null; // For editing
    initialTableId?: string | null; // For pre-filling from sidebar
}

export const BookingModal: React.FC<BookingModalProps> = ({
    isOpen,
    onClose,
    onSave,
    tables,
    currentDate,
    initialReservation,
    initialTableId
}) => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [pax, setPax] = useState('2');
    const [time, setTime] = useState('20:00');
    const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Effect to populate form when modal opens or initial data changes
    React.useEffect(() => {
        if (isOpen) {
            if (initialReservation) {
                // Edit Mode
                setName(initialReservation.customerName);
                setPhone(initialReservation.customerPhone || '');
                setPax(initialReservation.pax.toString());
                setTime(initialReservation.time);
                setSelectedTableIds(initialReservation.tableIds);
            } else {
                // New Mode
                setName('');
                setPhone('');
                setPax('2');
                // Keep previous time or reset? Resetting is safer.
                setTime('20:00');
                // Use initialTableId if provided (Quick Add from Sidebar)
                setSelectedTableIds(initialTableId ? [initialTableId] : []);
            }
            setError(null);
        }
    }, [isOpen, initialReservation, initialTableId]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !pax || !time || selectedTableIds.length === 0) {
            setError('Compila tutti i campi obbligatori e seleziona almeno un tavolo.');
            return;
        }

        const paxNum = parseInt(pax, 10);

        const reservationToSave: Reservation = {
            id: initialReservation ? initialReservation.id : uuidv4(), // Keep ID if editing
            customerName: name,
            customerPhone: phone,
            pax: paxNum,
            time,
            date: currentDate,
            tableIds: selectedTableIds,
            notes: initialReservation?.notes || '' // Preserve notes or empty
        };

        onSave(reservationToSave);
        resetForm(); // Actually onClose usually handles this, but good practice
    };

    const resetForm = () => {
        setName('');
        setPhone('');
        setPax('2');
        setSelectedTableIds([]);
        setError(null);
        onClose();
    };

    const toggleTable = (id: string) => {
        setSelectedTableIds(prev =>
            prev.includes(id) ? prev.filter(tid => tid !== id) : [...prev, id]
        );
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h2 style={{ marginTop: 0 }}>
                    {initialReservation ? 'Modifica Prenotazione' : 'Nuova Prenotazione'}
                </h2>

                {error && <div style={{ color: 'red', marginBottom: '10px', fontSize: '0.875rem' }}>{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Nome Cliente *</label>
                        <input
                            className="form-input"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Es. Mario Rossi"
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label className="form-label">Persone *</label>
                            <input
                                type="number"
                                className="form-input"
                                value={pax}
                                onChange={e => setPax(e.target.value)}
                                min="1"
                            />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label className="form-label">Orario *</label>
                            <input
                                type="time"
                                className="form-input"
                                value={time}
                                onChange={e => setTime(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Telefono (Opzionale)</label>
                        <input
                            className="form-input"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Seleziona Tavoli *</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '150px', overflowY: 'auto', border: '1px solid #eee', padding: '8px' }}>
                            {tables.map(table => (
                                <div
                                    key={table.id}
                                    onClick={() => toggleTable(table.id)}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '20px',
                                        border: '1px solid',
                                        borderColor: selectedTableIds.includes(table.id) ? '#3b82f6' : '#d1d5db',
                                        backgroundColor: selectedTableIds.includes(table.id) ? '#eff6ff' : 'white',
                                        color: selectedTableIds.includes(table.id) ? '#1d4ed8' : '#374151',
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                        userSelect: 'none'
                                    }}
                                >
                                    {table.label} ({table.seats}p)
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{ background: 'transparent', border: '1px solid #ccc', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer' }}
                        >
                            Annulla
                        </button>
                        <button type="submit" className="btn-primary">
                            {initialReservation ? 'Salva Modifiche' : 'Crea Prenotazione'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
