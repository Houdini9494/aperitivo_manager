import React, { useState, useEffect } from 'react';
import { X, Trash2, Save } from 'lucide-react';
import type { Table } from '../types';

interface TableEditorProps {
    table: Table;
    onSave: (updatedTable: Table) => void;
    onDelete: (tableId: string) => void;
    onClose: () => void;
}

export const TableEditor: React.FC<TableEditorProps> = ({ table, onSave, onDelete, onClose }) => {
    const [label, setLabel] = useState(table.label);
    const [seats, setSeats] = useState(table.seats);
    const [shape, setShape] = useState<'square' | 'rectangle'>(table.shape);
    const [width, setWidth] = useState(table.width);
    const [height, setHeight] = useState(table.height);

    // Update local state when table prop changes
    useEffect(() => {
        setLabel(table.label);
        setSeats(table.seats);
        setShape(table.shape);
        setWidth(table.width);
        setHeight(table.height);
    }, [table]);

    const handleSave = () => {
        onSave({
            ...table,
            label,
            seats,
            shape,
            width,
            height
        });
        onClose();
    };

    return (
        <div style={{
            position: 'fixed',
            top: '100px',
            right: '20px',
            width: '300px',
            backgroundColor: 'white',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            borderRadius: '0.5rem',
            zIndex: 50,
            overflow: 'hidden',
            border: '1px solid #e5e7eb'
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem',
                borderBottom: '1px solid #e5e7eb',
                backgroundColor: '#f9fafb'
            }}>
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>Modifica Tavolo</h3>
                <button onClick={onClose} style={{ color: '#6b7280', cursor: 'pointer', background: 'none', border: 'none' }}>
                    <X size={20} />
                </button>
            </div>

            <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Visual Preview */}
                <div style={{
                    height: '120px',
                    backgroundColor: '#e5e7eb',
                    borderRadius: '0.375rem',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginBottom: '0.5rem'
                }}>
                    <div style={{
                        width: `${width * 0.5}px`, // Scale down for preview
                        height: `${height * 0.5}px`,
                        backgroundColor: '#dcfce7',
                        border: '2px solid #16a34a',
                        borderRadius: shape === 'rectangle' ? '4px' : '8px',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        fontSize: '0.75rem',
                        fontWeight: 'bold'
                    }}>
                        {label}
                    </div>
                </div>

                {/* Form Fields */}
                <div>
                    <label style={{ display: 'block', textTransform: 'uppercase', color: '#6b7280', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                        Etichetta
                    </label>
                    <input
                        type="text"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
                    />
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', textTransform: 'uppercase', color: '#6b7280', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                            Posti
                        </label>
                        <input
                            type="number"
                            value={seats}
                            onChange={(e) => setSeats(Number(e.target.value))}
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', textTransform: 'uppercase', color: '#6b7280', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                            Forma
                        </label>
                        <select
                            value={shape}
                            onChange={(e) => setShape(e.target.value as 'square' | 'rectangle')}
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
                        >
                            <option value="square">Quadrato</option>
                            <option value="rectangle">Rettangolo</option>
                        </select>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', textTransform: 'uppercase', color: '#6b7280', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                            Larghezza (px)
                        </label>
                        <input
                            type="number"
                            value={width}
                            step={10}
                            onChange={(e) => setWidth(Number(e.target.value))}
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', textTransform: 'uppercase', color: '#6b7280', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                            Altezza (px)
                        </label>
                        <input
                            type="number"
                            value={height}
                            step={10}
                            onChange={(e) => setHeight(Number(e.target.value))}
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                    <button
                        onClick={handleSave}
                        style={{
                            flex: 1,
                            backgroundColor: '#2563eb',
                            color: 'white',
                            padding: '0.5rem',
                            borderRadius: '0.375rem',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '0.5rem',
                            border: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <Save size={16} /> Salva
                    </button>

                    <button
                        onClick={() => {
                            if (confirm('Sei sicuro di voler eliminare questo tavolo?')) {
                                onDelete(table.id);
                                onClose();
                            }
                        }}
                        style={{
                            backgroundColor: '#fee2e2',
                            color: '#dc2626',
                            padding: '0.5rem',
                            borderRadius: '0.375rem',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            border: 'none',
                            cursor: 'pointer'
                        }}
                        title="Elimina Tavolo"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};
