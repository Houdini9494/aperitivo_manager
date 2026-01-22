export type RoomId = 'internal' | 'external';

export interface Room {
    id: RoomId;
    name: string;
}

export interface Table {
    id: string;
    label: string;
    roomId: RoomId;
    x: number;
    y: number;
    width: number;
    height: number;
    shape: 'square' | 'rectangle';
    seats: number;
    // Runtime state (not always persisted in the same way)
    status: 'free' | 'occupied';
}

export interface Reservation {
    id: string;
    customerName: string;
    customerPhone?: string;
    pax: number;
    time: string; // HH:mm
    date: string; // YYYY-MM-DD
    tableIds: string[];
    notes?: string;
    orders?: string;
}

export interface DailyLayout {
    date: string; // 'YYYY-MM-DD' or 'master'
    tables: Table[];
}
