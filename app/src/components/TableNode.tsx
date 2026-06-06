import React from 'react';
import type { Table, Reservation } from '../types';

interface TableNodeProps {
    table: Table;
    reservations: Reservation[]; // Subset for this table
    onClick: () => void;
    onStatusToggle: (e: React.MouseEvent) => void;
    isEditing: boolean; // Control interaction styles
}

export const TableNode: React.FC<TableNodeProps> = ({ table, reservations, onClick, onStatusToggle, isEditing }) => {
    const isOccupied = table.status === 'occupied';

    // Inline styles for positioning (absolute)
    const style: React.CSSProperties = {
        position: 'absolute',
        left: table.x,
        top: table.y,
        width: `${table.width}px`,
        height: `${table.height}px`,
        borderWidth: '2px',
        borderStyle: 'solid',
        borderRadius: table.shape === 'rectangle' ? '6px' : '12px',
        display: 'flex',
        flexDirection: 'column',
        padding: '4px',
        cursor: isEditing ? 'move' : 'pointer', // Only show move cursor if editing
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        transition: 'background-color 0.2s ease, border-color 0.2s ease',
        backgroundColor: isOccupied ? '#fee2e2' : '#dcfce7',
        borderColor: isOccupied ? '#dc2626' : '#16a34a',
        zIndex: 10,
        userSelect: 'none',
        touchAction: isEditing ? 'none' : 'auto', // CRITICAL: Allow scrolling when not editing
    };

    return (
        <div
            style={style}
            onClick={() => {
                // Only trigger click if not dragging (handled by MapView usually, but here we propagate)
                onClick();
            }}
            className="table-node"
        >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', marginBottom: '4px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '2px' }}>{table.label}</span>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onStatusToggle(e); // Pass the event as per prop definition
                    }}
                    style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        padding: '6px 4px',
                        minHeight: '28px', // Target touch più comodo durante il servizio
                        background: 'white',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        width: '100%',
                    }}
                >
                    {isOccupied ? 'LIBERA' : 'OCCUPA'}
                </button>
            </div>

            {/* Mini list of reservations */}
            {reservations.length > 0 && (
                <div style={{ fontSize: '0.7rem', marginTop: '2px', overflow: 'hidden' }}>
                    {reservations.slice(0, 2).map((res) => (
                        <div key={res.id} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {res.time} - {res.customerName}
                        </div>
                    ))}
                    {reservations.length > 2 && <div>+{reservations.length - 2} altri</div>}
                </div>
            )}
        </div>
    );
};
