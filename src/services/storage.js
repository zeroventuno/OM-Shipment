import { supabase } from './supabaseClient';

const STORAGE_KEY = 'bikeship_data_v1';

// Helpers to map between DB (snake_case) and App (camelCase)
const mapToDb = (s) => ({
    id: s.id,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
    order_id: s.orderId,
    order_type: s.orderType,
    customer_name: s.customerName,
    quantity: s.quantity || 1,
    destination_country: s.destinationCountry,
    customer_payment: s.customerPayment,
    status: s.status,
    tracking_code: s.trackingCode,
    selected_quote: s.selectedQuote,
    all_quotes: s.allQuotes,
    profit: s.profit,
    savings: s.savings,
    photo_urls: s.photoUrls || [],
    customer_cost_pickup: s.customerCostPickup || false
});

const mapFromDb = (s) => ({
    id: s.id,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    orderId: s.order_id,
    orderType: s.order_type,
    customerName: s.customer_name,
    quantity: s.quantity || 1,
    destinationCountry: s.destination_country,
    customerPayment: s.customer_payment,
    status: s.status,
    trackingCode: s.tracking_code,
    selectedQuote: s.selected_quote,
    allQuotes: s.all_quotes,
    profit: s.profit,
    savings: s.savings,
    photoUrls: s.photo_urls || [],
    customerCostPickup: s.customer_cost_pickup || false
});

// LocalStorage só é usado quando o Supabase NÃO está configurado. Quando ele
// está configurado e a chamada falha, o erro sobe: cair para o LocalStorage
// silenciosamente mascararia sessão expirada ou bloqueio de RLS.
const localRead = () => {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (err) {
        console.error('LocalStorage read error:', err);
        return [];
    }
};

const localWrite = (shipments) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shipments));
};

export const storageService = {
    getShipments: async () => {
        if (!supabase) return localRead();

        const { data, error } = await supabase
            .from('shipments')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabase fetch error:', error);
            throw error;
        }

        return data.map(mapFromDb);
    },

    saveShipment: async (shipment) => {
        const newShipment = {
            ...shipment,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            status: 'Pending',
            trackingHistory: []
        };

        if (!supabase) {
            const shipments = localRead();
            shipments.unshift(newShipment);
            localWrite(shipments);
            return newShipment;
        }

        const { data, error } = await supabase
            .from('shipments')
            .insert([mapToDb(newShipment)])
            .select();

        if (error) {
            console.error('Supabase save error:', error);
            throw error;
        }

        return mapFromDb(data[0]);
    },

    getShipment: async (id) => {
        if (!supabase) return localRead().find(s => s.id === id);

        const { data, error } = await supabase
            .from('shipments')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error('Supabase fetch error:', error);
            throw error;
        }

        return mapFromDb(data);
    },

    updateShipment: async (shipment) => {
        if (!supabase) {
            const shipments = localRead();
            const index = shipments.findIndex(s => s.id === shipment.id);
            if (index !== -1) {
                shipments[index] = { ...shipments[index], ...shipment, updatedAt: new Date().toISOString() };
                localWrite(shipments);
            }
            return;
        }

        const { error } = await supabase
            .from('shipments')
            .update(mapToDb({ ...shipment, updatedAt: new Date().toISOString() }))
            .eq('id', shipment.id);

        if (error) {
            console.error('Supabase update error:', error);
            throw error;
        }
    },

    deleteShipment: async (id) => {
        if (!supabase) {
            localWrite(localRead().filter(s => s.id !== id));
            return;
        }

        const { error } = await supabase.from('shipments').delete().eq('id', id);

        if (error) {
            console.error('Supabase delete error:', error);
            throw error;
        }
    },

    updateStatus: async (id, status) => {
        if (!supabase) {
            const shipments = localRead();
            const index = shipments.findIndex(s => s.id === id);
            if (index !== -1) {
                shipments[index].status = status;
                shipments[index].updatedAt = new Date().toISOString();
                localWrite(shipments);
            }
            return;
        }

        const { error } = await supabase
            .from('shipments')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            console.error('Supabase status update error:', error);
            throw error;
        }
    },

    getSuggestedPortal: async (country) => {
        if (!country) return null;

        const shipments = await storageService.getShipments();

        const countryShipments = shipments.filter(s =>
            s.destinationCountry && s.destinationCountry.toLowerCase() === country.toLowerCase()
        );

        if (countryShipments.length === 0) return null;

        const portalCounts = countryShipments.reduce((acc, curr) => {
            if (curr.selectedQuote && curr.selectedQuote.portal) {
                const portal = curr.selectedQuote.portal;
                acc[portal] = (acc[portal] || 0) + 1;
            }
            return acc;
        }, {});

        return Object.entries(portalCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    },

    getStats: async () => {
        const shipments = await storageService.getShipments();

        const totalSavings = shipments.reduce((acc, curr) => acc + (curr.savings || 0), 0);
        const totalShipments = shipments.length;
        const pendingShipments = shipments.filter(s => s.status !== 'Delivered').length;

        const carrierCounts = shipments.reduce((acc, curr) => {
            if (curr.selectedQuote && curr.selectedQuote.carrier) {
                const carrier = curr.selectedQuote.carrier;
                acc[carrier] = (acc[carrier] || 0) + 1;
            }
            return acc;
        }, {});

        // Portal/Carrier combinations
        const combinationCountsMap = shipments.reduce((acc, curr) => {
            if (curr.selectedQuote && curr.selectedQuote.portal && curr.selectedQuote.carrier) {
                const combo = `${curr.selectedQuote.portal} / ${curr.selectedQuote.carrier}`;
                acc[combo] = (acc[combo] || 0) + 1;
            }
            return acc;
        }, {});

        const combinationData = Object.entries(combinationCountsMap)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        // Helper to check if shipment is a bike
        const isBike = (shipment) => {
            const type = shipment.orderType;
            return type === 'Bicycle' || type === 'Frame Kit';
        };

        const bikeShipments = shipments.filter(isBike);

        // Monthly bicycle shipments (Filtered by Bike)
        const monthlyDataMap = bikeShipments.reduce((acc, curr) => {
            if (curr.createdAt) {
                const date = new Date(curr.createdAt);
                const monthYear = date.toLocaleString('default', { month: 'short', year: 'numeric' });
                const quantity = curr.quantity || 1;
                acc[monthYear] = (acc[monthYear] || 0) + quantity;
            }
            return acc;
        }, {});

        // Sort monthly data chronologically
        const monthlyData = Object.entries(monthlyDataMap)
            .map(([month, count]) => ({ month, count }))
            .sort((a, b) => new Date(a.month) - new Date(b.month));

        const totalBikes = bikeShipments.reduce((acc, curr) => acc + (curr.quantity || 1), 0);
        const monthsCount = Object.keys(monthlyDataMap).length || 1;
        const avgBikesPerMonth = totalBikes / monthsCount;

        const favoriteCarrier = Object.entries(carrierCounts).sort((a, b) => b[1] - a[1])[0];

        return {
            totalSavings,
            totalShipments,
            pendingShipments,
            favoriteCarrier: favoriteCarrier ? favoriteCarrier[0] : '-',
            favoriteCarrierPercentage: favoriteCarrier ? Math.round((favoriteCarrier[1] / totalShipments) * 100) : 0,
            combinationData,
            monthlyData,
            totalBikes,
            avgBikesPerMonth,
            recentShipments: shipments.slice(0, 5)
        };
    },

    getConnectionStatus: async () => {
        if (!supabase) return { status: 'disconnected', reason: 'Not configured' };

        try {
            const { error } = await supabase.from('shipments').select('id').limit(1);
            if (error) return { status: 'error', message: error.message };
            return { status: 'connected' };
        } catch (err) {
            return { status: 'error', message: err.message };
        }
    },

    uploadPhoto: async (file) => {
        if (!supabase) throw new Error('Supabase not configured');

        const fileExt = file.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const filePath = `photos/${fileName}`;

        const { error } = await supabase.storage
            .from('shipment-photos')
            .upload(filePath, file);

        if (error) {
            console.error('Supabase storage upload error:', error);
            throw error;
        }

        const { data: { publicUrl } } = supabase.storage
            .from('shipment-photos')
            .getPublicUrl(filePath);

        return publicUrl;
    }
};
