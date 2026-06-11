import React, { useRef, useState, useEffect } from 'react';
import type { Table, Reservation } from '../types';
import { TableNode } from './TableNode';
import { TableEditor } from './TableEditor';

interface MapViewProps {
    tables: Table[];
    reservations: Reservation[]; // All reservations for the day
    onTableClick: (table: Table) => void;
    onTableStatusToggle: (table: Table) => void;
    onTableMove: (tableId: string, x: number, y: number) => void;
    onTableUpdate?: (table: Table) => void; // New
    onTableDelete?: (tableId: string) => void; // New
    onTableDragEnd?: (table: Table) => void; // New, triggers sync
    width?: number;
    height?: number;
    isEditingLayout?: boolean; // New prop
}

export const MapView: React.FC<MapViewProps> = ({
    tables,
    reservations,
    onTableClick,
    onTableStatusToggle,
    onTableMove,
    onTableUpdate, // Destructured new prop
    onTableDelete, // Destructured new prop
    onTableDragEnd, // Destructured new prop
    height = 600,
    isEditingLayout = false
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null); // Il canvas 1200x800 scalato da zoom
    const [draggingTableId, setDraggingTableId] = useState<string | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);

    // Editor State
    const [editingTable, setEditingTable] = useState<Table | null>(null); // New state

    const [initialPointerDownPos, setInitialPointerDownPos] = useState<{ x: number, y: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Helper to find reservations for a table
    const getReservationsForTable = (tableId: string) => {
        return reservations
            .filter(r => r.tableIds.includes(tableId))
            .sort((a, b) => a.time.localeCompare(b.time));
    };

    const handlePointerDown = (e: React.PointerEvent, table: Table) => {
        // Guard: If not editing, do nothing here. Let native events (click/scroll) happen.
        if (!isEditingLayout) return;

        // Only left click
        if (e.button !== 0) return;

        // Ignore if clicking on button/interactive elements inside
        if ((e.target as HTMLElement).tagName === 'BUTTON') return;

        e.preventDefault(); // Prevent text selection/scrolling
        e.stopPropagation(); // Let it bubble if needed? Better to stop to prevent map panning if we had it.

        // Cattura il puntatore: così il pointerup arriva SEMPRE a questo nodo,
        // anche se il rilascio avviene fuori dal tavolo (drag veloce su tablet).
        // Senza capture lo spostamento veniva scartato senza essere salvato.
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch { /* capture non supportata: persiste comunque il fallback su window */ }

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        // Offset in coordinate del canvas (non scalate): dividiamo per zoom (item 11)
        const offsetX = (e.clientX - rect.left) / zoom - table.x;
        const offsetY = (e.clientY - rect.top) / zoom - table.y;

        setDraggingTableId(table.id);
        setDragOffset({ x: offsetX, y: offsetY });
        setInitialPointerDownPos({ x: e.clientX, y: e.clientY });
        setIsDragging(false); // Reset drag flag
    };

    // Lo spostamento durante il drag è gestito da un unico listener su window
    // (vedi useEffect più sotto), per evitare aggiornamenti doppi (item 11).

    const handleTablePointerUp = (e: React.PointerEvent, table: Table) => {
        // e.stopPropagation(); 

        if (draggingTableId === table.id) {
            // Create a potentially updated table object with current prop state or rely on parent?
            // The "table" arg passed here is from the render closure, which might be stale if props didn't update fast enough?
            // Actually, "table" comes from .map(table => ...), so it's fresh from the last render.
            // Since onTableMove updates parent state -> re-render -> new props -> new "table", 
            // this "table" should have the final X/Y if React updated fast enough.
            // However, if we rely on onTableDragEnd to sync, we should pass the table.
            if (isDragging) {
                onTableDragEnd?.(table);
            }
        }

        // Check if it was a click
        if (!isDragging && initialPointerDownPos) {
            const dist = Math.hypot(e.clientX - initialPointerDownPos.x, e.clientY - initialPointerDownPos.y);
            if (dist < 5) {
                // Click logic
                if (isEditingLayout) {
                    setEditingTable(table);
                } else {
                    onTableClick(table);
                }
            }
        }

        setDraggingTableId(null);
        setInitialPointerDownPos(null);
        setIsDragging(false);
        e.stopPropagation();
    };

    // Zoom Logic
    const handleWheel = (e: React.WheelEvent) => {
        // Trackpad pinch usually fires wheel event with ctrlKey
        if (e.ctrlKey) {
            e.preventDefault();
            const delta = -e.deltaY;
            setZoom(z => Math.max(0.5, Math.min(2, z + delta * 0.01)));
        }
    };

    // Touch Zoom Logic
    const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null);

    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            setLastTouchDistance(dist);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 2 && lastTouchDistance !== null) {
            // Prevent default to stop browser zoom/scroll
            // e.preventDefault(); // React synthetic events might not support this reliably here without passive: false

            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );

            const delta = dist - lastTouchDistance;
            // Sensitivity
            setZoom(z => Math.max(0.5, Math.min(2, z + delta * 0.005)));
            setLastTouchDistance(dist);
        }
    };

    const handleTouchEnd = () => {
        setLastTouchDistance(null);
    };

    // Global listener for up/move to handle dragging outside element bounds if needed
    // But strictly using React events on container usually works if capture is set or just on container.
    // Actually, setting specific listeners on window is better for reliable drag.
    useEffect(() => {
        const endDrag = () => {
            // Rilascio fuori dal nodo del tavolo (capture fallita o pointercancel):
            // persisti comunque lo spostamento prima di azzerare lo stato di drag.
            // Il caso normale (rilascio sul tavolo) è gestito da handleTablePointerUp,
            // che ferma la propagazione: qui non si arriva, niente doppio salvataggio.
            if (draggingTableId) {
                if (isDragging) {
                    const moved = tables.find(t => t.id === draggingTableId);
                    if (moved) onTableDragEnd?.(moved);
                }
                setDraggingTableId(null);
                setInitialPointerDownPos(null);
                setIsDragging(false);
            }
        };
        const handleWindowPointerMove = (e: PointerEvent) => {
            if (!draggingTableId || !canvasRef.current) return;

            const rect = canvasRef.current.getBoundingClientRect();
            // Coordinate in spazio canvas (non scalato): dividi per zoom (item 11)
            const x = (e.clientX - rect.left) / zoom - dragOffset.x;
            const y = (e.clientY - rect.top) / zoom - dragOffset.y;

            const snappedX = Math.round(x / 10) * 10;
            const snappedY = Math.round(y / 10) * 10;

            // Check if pointer has moved significantly to consider it a drag
            if (initialPointerDownPos) {
                const dx = e.clientX - initialPointerDownPos.x;
                const dy = e.clientY - initialPointerDownPos.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > 5) { // Threshold for drag (e.g., 5 pixels)
                    setIsDragging(true);
                }
            }

            onTableMove(draggingTableId, snappedX, snappedY);
        };

        if (draggingTableId) {
            window.addEventListener('pointerup', endDrag);
            window.addEventListener('pointercancel', endDrag);
            window.addEventListener('pointermove', handleWindowPointerMove);
        }

        return () => {
            window.removeEventListener('pointerup', endDrag);
            window.removeEventListener('pointercancel', endDrag);
            window.removeEventListener('pointermove', handleWindowPointerMove);
        };
    }, [draggingTableId, dragOffset, initialPointerDownPos, onTableMove, zoom, isDragging, tables, onTableDragEnd]); // Re-bind when dragging starts or initial pos changes

    // Prevent default gesture behaviors on the container to allow custom zoom
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const preventDefault = (e: Event) => e.preventDefault();

        // We might want to prevent touchmove to stop scrolling while pinching?
        // But we want to allow panning (scrolling) if 1 finger?
        // Let's rely on React handlers mostly, but for "gesturestart" (Safari) it's good to prevent
        container.addEventListener('gesturestart', preventDefault);
        container.addEventListener('gesturechange', preventDefault);

        return () => {
            container.removeEventListener('gesturestart', preventDefault);
            container.removeEventListener('gesturechange', preventDefault);
        };
    }, []);

    return (
        <div
            ref={containerRef}
            className="map-container"
            style={{
                position: 'relative',
                width: '100%',
                height: '100%', // Fill parent
                minHeight: `${height}px`,
                backgroundColor: '#e5e7eb', // gray-200
                borderRadius: '16px',
                overflow: 'auto', // Allow scrolling
                border: '1px solid #d1d5db',
                display: 'grid',         // Center content
                placeItems: 'center',     // Center content
                touchAction: 'pan-x pan-y' // Allow native scrolling, but we handle pinch via JS
            }}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <div ref={canvasRef} style={{
                width: '1200px', // Reduced from 2000px
                height: '800px', // Reduced from 2000px
                transform: `scale(${zoom})`,
                transformOrigin: 'center center', // Zoom from center
                transition: 'transform 0.2s',
                position: 'relative',
                backgroundColor: 'rgba(255,255,255,0.5)', // Optional: visually denote boundaries
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}>
                {tables.map(table => (
                    <div
                        key={table.id}
                        onPointerDown={(e) => handlePointerDown(e, table)}
                        onPointerUp={(e) => handleTablePointerUp(e, table)}
                        style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0 }}
                    >
                        <div
                            style={{ display: 'contents' }}
                        >
                            <TableNode
                                table={table}
                                reservations={getReservationsForTable(table.id)}
                                isEditing={isEditingLayout}
                                onClick={() => {
                                    // If NOT editing, we rely on standard click event because pointerDown was skipped.
                                    if (!isEditingLayout) {
                                        onTableClick(table);
                                    }
                                }}
                                onStatusToggle={(e) => {
                                    // This works because we didn't preventDefault for BUTTON
                                    e.stopPropagation(); // Already in TableNode, but good to be explicit
                                    onTableStatusToggle(table);
                                }}
                            />
                        </div>
                    </div>
                ))}
            </div>

            {/* Editor Overlay */}
            {isEditingLayout && editingTable && (
                <TableEditor
                    table={editingTable}
                    onSave={(updated) => {
                        onTableUpdate?.(updated);
                        setEditingTable(null);
                    }}
                    onDelete={(id) => {
                        onTableDelete?.(id);
                        setEditingTable(null);
                    }}
                    onClose={() => setEditingTable(null)}
                />
            )}

            {/* Zoom Controls */}
            <div style={{
                position: 'absolute',
                bottom: '20px',
                right: '20px',
                display: 'flex',
                gap: '8px',
                zIndex: 10
            }}>
                <button
                    onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
                    style={{
                        padding: '8px',
                        background: 'white',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                >
                    -
                </button>
                <button
                    onClick={() => setZoom(z => Math.min(2, z + 0.1))}
                    style={{
                        padding: '8px',
                        background: 'white',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                >
                    +
                </button>
            </div>
        </div>
    );
};
