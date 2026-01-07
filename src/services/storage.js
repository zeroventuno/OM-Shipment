import { supabase } from './supabaseClient';

const STORAGE_KEY = 'bikeship_data_v1';

// Debug: Log storage mode on load
const debugStorage = () => {
    const config = {
        supabaseConfigured: !!supabase,
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
        supabaseKeyExists: !!import.meta.env.VITE_SUPABASE_ANON_KEY
    };
    console.log('🔍 STORAGE DEBUG:', config);
    return config;
};

debugStorage();

export const storageService = {
    getShipments: async () => {
        if (supabase) {
            console.log('📡 Fetching from SUPABASE...');
            try {
                const { data, error, status, statusText } = await supabase
                    .from('shipments')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error('❌ Supabase fetch error:', {
                        code: error.code,
                        message: error.message,
                        details: error.details,
                        hint: error.hint,
                        status,
                        statusText
                    });
                    console.log('⚠️ Falling back to LocalStorage');
                } else {
                    console.log('✅ Fetched from Supabase:', data?.length, 'shipments');
                    return data.map(mapFromDb);
                }
            } catch (err) {
                console.error('💥 Unexpected error fetching from Supabase:', err);
                console.log('⚠️ Falling back to LocalStorage');
            }
        } else {
            console.log('💾 Using LocalStorage (Supabase not configured)');
        }

        // Fallback to LocalStorage
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            const parsed = data ? JSON.parse(data) : [];
            console.log('💾 LocalStorage has', parsed.length, 'shipments');
            return parsed;
        } catch (err) {
            console.error('❌ LocalStorage read error:', err);
            return [];
        }
    },

    saveShipment: async (shipment) => {
        const newShipment = {
            ...shipment,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            status: 'Pending',
            trackingHistory: []
        };

        if (supabase) {
            console.log('📡 Saving to SUPABASE:', newShipment);
            const { data, error } = await supabase
                .from('shipments')
                .insert([mapToDb(newShipment)])
                .select();

            if (error) {
                console.error('❌ Supabase save error:', error);
                alert(`Erro ao salvar no Supabase: ${error.message}\n\nTentando salvar localmente...`);
                console.log('⚠️ Falling back to LocalStorage');
            } else {
                console.log('✅ Saved to Supabase successfully!');
                return mapFromDb(data[0]);
            }
        } else {
            console.log('💾 Saving to LocalStorage');
        }

        // LocalStorage
        const shipments = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        shipments.unshift(newShipment);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(shipments));
        return newShipment;
    },

    getShipment: async (id) => {
        if (supabase) {
            const { data, error } = await supabase
                .from('shipments')
                .select('*')
                .eq('id', id)
                .single();

            if (!error) return mapFromDb(data);
        }

        const shipments = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        return shipments.find(s => s.id === id);
    },

    updateShipment: async (shipment) => {
        if (supabase) {
            const { error } = await supabase
                .from('shipments')
                .update(mapToDb({ ...shipment, updatedAt: new Date().toISOString() }))
                .eq('id', shipment.id);

            if (error) {
                console.error('❌ Supabase update error:', error);
                alert(`Erro ao atualizar no Supabase: ${error.message}`);
                throw error;
            }
            return;
        }

        const shipments = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        const index = shipments.findIndex(s => s.id === shipment.id);
        if (index !== -1) {
            shipments[index] = { ...shipments[index], ...shipment, updatedAt: new Date().toISOString() };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(shipments));
        }
    },

    deleteShipment: async (id) => {
        if (supabase) {
            await supabase.from('shipments').delete().eq('id', id);
            return;
        }

        const shipments = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        const filtered = shipments.filter(s => s.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    },

    updateStatus: async (id, status) => {
        if (supabase) {
            await supabase
                .from('shipments')
                .update({ status: status, updated_at: new Date().toISOString() })
                .eq('id', id);
            return;
        }

        const shipments = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        const index = shipments.findIndex(s => s.id === id);
        if (index !== -1) {
            shipments[index].status = status;
            shipments[index].updatedAt = new Date().toISOString();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(shipments));
        }
    },

    getSuggestedPortal: async (country) => {
        // For simplicity, we'll keep this logic client-side or fetch all needed data
        // In a real app, this should be a database query
        const shipments = await storageService.getShipments();

        if (!country) return null;

        const countryShipments = shipments.filter(s =>
            s.destinationCountry && s.destinationCountry.toLowerCase() === country.toLowerCase()
        );

        if (countryShipments.length === 0) return null;

        const portalCounts = countryShipments.reduce((acc, curr) => {
            const portal = curr.selectedQuote.portal;
            acc[portal] = (acc[portal] || 0) + 1;
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
            const carrier = curr.selectedQuote.carrier;
            acc[carrier] = (acc[carrier] || 0) + 1;
            return acc;
        }, {});

        const favoriteCarrier = Object.entries(carrierCounts).sort((a, b) => b[1] - a[1])[0];

        return {
            totalSavings,
            totalShipments,
            pendingShipments,
            favoriteCarrier: favoriteCarrier ? favoriteCarrier[0] : '-',
            favoriteCarrierPercentage: favoriteCarrier ? Math.round((favoriteCarrier[1] / totalShipments) * 100) : 0,
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
    }
};

// Helpers to map between DB (snake_case) and App (camelCase)
const mapToDb = (s) => ({
    id: s.id,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
    order_id: s.orderId,
    customer_name: s.customerName,
    destination_country: s.destinationCountry,
    customer_payment: s.customerPayment,
    status: s.status,
    tracking_code: s.trackingCode,
    selected_quote: s.selectedQuote,
    all_quotes: s.allQuotes,
    profit: s.profit,
    savings: s.savings
});

const mapFromDb = (s) => ({
    id: s.id,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    orderId: s.order_id,
    customerName: s.customer_name,
    destinationCountry: s.destination_country,
    customerPayment: s.customer_payment,
    status: s.status,
    trackingCode: s.tracking_code,
    selectedQuote: s.selected_quote,
    allQuotes: s.all_quotes,
    profit: s.profit,
    savings: s.savings
});
