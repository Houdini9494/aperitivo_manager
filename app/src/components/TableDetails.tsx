import React from 'react';
import type { Table, Reservation } from '../types';
import { X, Edit, Trash2 } from 'lucide-react';

interface TableDetailsProps {
    isOpen: boolean;
    onClose: () => void;
    table: Table | null;
    reservations: Reservation[]; // Reservations for this table
    onDeleteReservation: (id: string) => void;
    onEditReservation: (reservation: Reservation) => void;
    onAddReservation: () => void;
    onUpdateReservation: (reservation: Reservation) => void;
    onQuickAdd: () => void; // New prop
}

export const TableDetails: React.FC<TableDetailsProps> = ({
    isOpen,
    onClose,
    table,
    reservations,
    onDeleteReservation,
    onEditReservation,
    onAddReservation,
    onUpdateReservation,
    onQuickAdd // Destructure
}) => {
    const [expandedResId, setExpandedResId] = React.useState<string | null>(null);

    // When closing or changing table, reset expansion
    React.useEffect(() => {
        if (!isOpen) setExpandedResId(null);
    }, [isOpen]);

    if (!isOpen || !table) return null;

    const toggleExpand = (id: string) => {
        setExpandedResId(prev => prev === id ? null : id);
    };

    const handleOrderChange = (res: Reservation, newOrderText: string) => {
        const updated = { ...res, orders: newOrderText };
        // We could debounce this, but for now specific save or blur is safer.
        // Let's rely on a Blur or "Save" button in the UI.
        // Actually for a text area, blur is good.
        onUpdateReservation(updated);
    };

    return (
        <div className={`sidebar-container ${isOpen ? 'open' : ''}`}>

            <button
                onClick={onClose}
                className="sidebar-close-btn"
            >
                <X size={24} />
            </button>

            <div className="sidebar-content">
                {/* Left Column: Reservations */}
                <div className="sidebar-col-left">
                    <h3 className="section-title">
                        Prenotazioni
                        <span className="badge-count">
                            {reservations.length}
                        </span>
                    </h3>

                    {reservations.length === 0 ? (
                        <p className="no-data-text">Nessuna prenotazione per oggi.</p>
                    ) : (
                        <div className="reservation-list">
                            {reservations.map(res => {
                                const isExpanded = expandedResId === res.id;
                                return (
                                    <div
                                        key={res.id}
                                        className="reservation-card group"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => toggleExpand(res.id)}
                                    >
                                        <div className="res-header">
                                            <span className="res-time">{res.time}</span>
                                            <div className="res-actions">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onEditReservation(res); }}
                                                    className="action-btn edit"
                                                    title="Modifica"
                                                >
                                                    <Edit size={16} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onDeleteReservation(res.id); }}
                                                    className="action-btn delete"
                                                    title="Elimina"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="res-details">
                                            <span className="res-name">{res.customerName}</span>
                                            <span className="res-pax">({res.pax} p.)</span>
                                        </div>

                                        {res.customerPhone && (
                                            <div className="res-phone">
                                                <span>📞</span> {res.customerPhone}
                                            </div>
                                        )}

                                        {res.notes && (
                                            <div className="res-notes">
                                                "{res.notes}"
                                            </div>
                                        )}

                                        {/* Orders Section - Visible only if expanded */}
                                        {isExpanded && (
                                            <div
                                                className="res-orders"
                                                style={{ marginTop: '12px', borderTop: '1px solid #e5e7eb', paddingTop: '8px' }}
                                                onClick={(e) => e.stopPropagation()} // Prevent collapse when clicking in orders
                                            >
                                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '4px', color: '#4b5563' }}>
                                                    Ordinazioni:
                                                </label>
                                                <textarea
                                                    style={{
                                                        width: '100%',
                                                        minHeight: '80px',
                                                        padding: '8px',
                                                        borderRadius: '6px',
                                                        borderColor: '#d1d5db',
                                                        fontSize: '0.9rem',
                                                        fontFamily: 'inherit'
                                                    }}
                                                    placeholder="Scrivi qui le ordinazioni..."
                                                    defaultValue={res.orders || ''}
                                                    onBlur={(e) => handleOrderChange(res, e.target.value)}
                                                />
                                                <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '2px', textAlign: 'right' }}>
                                                    Clicca fuori per salvare
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Right Column: Table Info */}
                <div className="sidebar-col-right">
                    <h2 className="table-title">{table.label}</h2>

                    <div className="info-group">
                        <div className="info-row">
                            <span className="info-label">Stato:</span>
                            <span className={`status-badge ${table.status === 'occupied' ? 'occupied' : 'free'}`}>
                                {table.status === 'occupied' ? 'Occupato' : 'Libero'}
                            </span>
                        </div>

                        <div className="info-row">
                            <span className="info-label">Capienza:</span>
                            <span className="info-value">{table.seats} persone</span>
                        </div>

                        <hr className="divider" />

                        <div className="quick-actions">
                            <h4 className="actions-title">Azioni Rapide</h4>
                            <button
                                className="add-res-btn"
                                onClick={onAddReservation}
                            >
                                <span>+ Aggiungi Prenotazione</span>
                            </button>
                            <button
                                className="add-res-btn"
                                style={{ marginTop: '8px', borderColor: '#f59e0b', color: '#d97706', backgroundColor: '#fffbeb' }}
                                onClick={onQuickAdd}
                            >
                                <span>⚡ Cliente al Volo</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
