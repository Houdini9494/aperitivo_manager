import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { LogOut } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { Login } from './components/Login';
import { useLayout } from './hooks/useLayout';
import { useReservations } from './hooks/useReservations';
import { MapView } from './components/MapView';
import { BookingModal } from './components/BookingModal';
import { TableDetails } from './components/TableDetails';
import { StorageService } from './services/storage';
import type { RoomId, Table } from './types';

function App() {
  const { user, loading, isAdmin, signOut } = useAuth();

  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [selectedRoom, setSelectedRoom] = useState<RoomId>('internal');
  const [isModalOpen, setIsModalOpen] = useState(false); // Restored
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);

  // Auto-Cleanup Trigger & Online Sync Listener
  useEffect(() => {
    StorageService.cleanOldData();

    const handleOnline = () => {
      console.log("Back Online! Waiting for network stabilization...");
      // Wait 3 seconds to ensure connection is solid before syncing
      setTimeout(() => {
        console.log("Executing Auto-Sync...");
        StorageService.syncPendingChanges();
      }, 3000);
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // New State for features
  const [editingReservation, setEditingReservation] = useState<any | null>(null);
  const [preSelectedTableId, setPreSelectedTableId] = useState<string | null>(null);
  const [isEditingLayout, setIsEditingLayout] = useState(false);

  const { tables, updateTableStatus, updateTablePosition, loading: loadingTables, saveTable, deleteTable } = useLayout(date, isAdmin);
  const { reservations, addReservation, updateReservation, deleteReservation, loading: loadingRes } = useReservations(date);

  if (loading) {
    return <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>Autenticazione…</div>;
  }

  if (!user) {
    return <Login />;
  }

  // Filter tables by room
  const roomTables = tables.filter(t => t.roomId === selectedRoom);

  // Get reservations for selected table
  const selectedTableReservations = selectedTable
    ? reservations.filter(r => r.tableIds.includes(selectedTable.id)).sort((a, b) => a.time.localeCompare(b.time))
    : [];

  const handleOpenNewReservation = () => {
    setEditingReservation(null);
    setPreSelectedTableId(null);
    setIsModalOpen(true);
  };

  const handleEditReservation = (res: any) => {
    setEditingReservation(res);
    setPreSelectedTableId(null);
    setIsModalOpen(true);
  };

  const handleAddReservationOnTable = (tableId: string) => {
    setEditingReservation(null);
    setPreSelectedTableId(tableId);
    setIsModalOpen(true);
  };

  const handleAddTable = () => {
    // Offset incrementale per non sovrapporre i nuovi tavoli (item 14)
    const newCount = tables.filter(t => t.id.startsWith('new-')).length;
    const offset = (newCount % 8) * 30;
    const newTable: Table = {
      id: `new-${Date.now()}`,
      label: 'Nuovo Tavolo',
      roomId: selectedRoom,
      x: 100 + offset,
      y: 100 + offset,
      width: 100,
      height: 100,
      shape: 'square',
      seats: 4,
      status: 'free'
    };
    // Salva solo la nuova riga (item 6)
    saveTable(newTable);
  };

  const handleSaveMasterLayout = async () => {
    if (!isAdmin) {
      alert("Solo l'amministratore può salvare il layout di default.");
      return;
    }

    if (confirm('Vuoi salvare questa disposizione come predefinita per tutti i giorni futuri?')) {
      await StorageService.saveMasterLayout(tables);
      alert('Layout salvato come predefinito!');
      setIsEditingLayout(false);
    }
  };

  const handleTableUpdate = (updatedTable: Table) => {
    // Salva solo la riga modificata (item 6)
    saveTable(updatedTable);
  };

  const handleTableDelete = async (tableId: string) => {
    // Elimina la singola riga (DB + stato locale)
    await deleteTable(tableId);
  };

  if (loadingTables || loadingRes) {
    return <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>Caricamento dati…</div>;
  }

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        {/* Top Row: Brand | Date | Logout */}
        <div className="header-top-row">
          <div className="header-brand">
            <img src="/logo.jpg" alt="Panificio 900" className="header-logo" />
          </div>

          <div className="control-group date-group">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="date-input"
              disabled={isEditingLayout}
            />
          </div>

          <div className="header-user-actions">
            {/* Edit Switch (Desktop) — solo admin può modificare il layout */}
            {isAdmin && (
              <div className="edit-switch-container desktop-only">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={isEditingLayout}
                    onChange={(e) => setIsEditingLayout(e.target.checked)}
                  />
                  <span className="slider round"></span>
                </label>
                <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>Edit</span>
              </div>
            )}

            <button
              onClick={() => {
                if (confirm("Vuoi davvero uscire?")) {
                  signOut();
                }
              }}
              className="logout-btn"
              title="Esci"
              style={{
                backgroundColor: 'transparent',
                border: '1px solid var(--color-brand-gold)',
                color: 'var(--color-brand-gold)',
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* Bottom Row (Mobile mainly, or inline on desktop) */}
        <div className="header-bottom-row">
          <div className="room-toggle">
            <button
              onClick={() => setSelectedRoom('internal')}
              className={`toggle-btn ${selectedRoom === 'internal' ? 'active' : ''}`}
            >
              Sala Interna
            </button>
            <button
              onClick={() => setSelectedRoom('external')}
              className={`toggle-btn ${selectedRoom === 'external' ? 'active' : ''}`}
            >
              Sala Esterna
            </button>
          </div>

          <div className="action-buttons">
            {isEditingLayout ? (
              <>
                <button
                  onClick={handleAddTable}
                  className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                >
                  + Tavolo
                </button>
                {isAdmin && (
                  <button
                    onClick={handleSaveMasterLayout}
                    className="bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium ml-2"
                  >
                    Salva
                  </button>
                )}
              </>
            ) : (
              <button className="btn-primary" onClick={handleOpenNewReservation}>
                + Prenotazione
              </button>
            )}
          </div>

          {/* Mobile Edit Switch (Hidden on Desktop) — solo admin */}
          {isAdmin && (
            <div className="edit-switch-container mobile-only" style={{ marginLeft: 'auto' }}>
              <label className="switch" style={{ transform: 'scale(0.8)' }}>
                <input
                  type="checkbox"
                  checked={isEditingLayout}
                  onChange={(e) => setIsEditingLayout(e.target.checked)}
                />
                <span className="slider round"></span>
              </label>
            </div>
          )}
        </div>
      </header>

      {/* Main Content (Map) using class for responsive resize */}
      <main
        className={`main-content ${selectedTable ? 'sidebar-open' : ''}`}
        style={{
          display: 'flex',
          justifyContent: 'center', // Center the map if scaled
          alignItems: 'center', // Center vertically
          overflow: 'hidden' // Hide overflow during transition
        }}
      >
        <MapView
          tables={roomTables}
          reservations={reservations}
          onTableClick={(table) => {
            setSelectedTable(table);
          }}
          onTableStatusToggle={(table) => {
            const newStatus = table.status === 'free' ? 'occupied' : 'free';
            updateTableStatus(table.id, newStatus);
          }}
          onTableMove={(tableId, x, y) => {
            updateTablePosition(tableId, x, y);
          }}
          onTableDragEnd={(table) => {
            // Persiste solo la riga spostata (item 6)
            saveTable(table);
          }}
          isEditingLayout={isEditingLayout}
          onTableUpdate={handleTableUpdate}
          onTableDelete={handleTableDelete}
        />
      </main>

      <BookingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={(res) => {
          // Both add (new) and update (existing) handled by upsert in addReservation
          addReservation(res);
          setIsModalOpen(false);
        }}
        tables={tables}
        currentDate={date}
        initialReservation={editingReservation}
        initialTableId={preSelectedTableId}
        existingReservations={reservations}
      />

      <TableDetails
        isOpen={!!selectedTable}
        onClose={() => setSelectedTable(null)}
        table={selectedTable}
        reservations={selectedTableReservations}
        onDeleteReservation={(id) => {
          if (confirm('Sei sicuro di voler eliminare questa prenotazione?')) {
            deleteReservation(id);
          }
        }}
        onEditReservation={handleEditReservation}
        onAddReservation={() => selectedTable && handleAddReservationOnTable(selectedTable.id)}
        onUpdateReservation={updateReservation}
        onQuickAdd={() => {
          if (!selectedTable) return;
          const now = new Date();
          const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

          const quickRes = {
            id: uuidv4(),
            tableIds: [selectedTable.id],
            date: date,
            time: timeString,
            customerName: 'Cliente al Volo',
            pax: 2, // Default
            customerPhone: '',
            notes: 'Walk-in',
            orders: ''
          };
          addReservation(quickRes);
        }}
      />
    </div>
  );
}

export default App
