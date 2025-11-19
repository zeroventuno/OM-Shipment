const API_KEY = import.meta.env.VITE_17TRACK_KEY;
const API_URL = 'https://api.17track.net/track/v2.2/gettrackinfo';

export const trackingService = {
    getTrackingStatus: async (trackingCode) => {
        // 1. Try Real API if Key exists
        if (API_KEY) {
            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        '17token': API_KEY
                    },
                    body: JSON.stringify([{ number: trackingCode }])
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.data && data.data.accepted && data.data.accepted.length > 0) {
                        const trackInfo = data.data.accepted[0].track;
                        // Map 17TRACK status to our internal status
                        // 10=In Transit, 30=Picked Up, 40=Delivered, etc.
                        let status = 'In Transit';
                        const event = trackInfo.z1; // Latest event status code

                        if (event === 40) status = 'Delivered';
                        else if (event === 30 || event === 35) status = 'Exception';
                        else if (event === 10) status = 'In Transit';

                        return {
                            code: trackingCode,
                            status: status,
                            location: trackInfo.z0?.z || 'Location Unknown', // Location info
                            timestamp: trackInfo.z0?.a || new Date().toISOString()
                        };
                    }
                }
            } catch (error) {
                console.warn('Failed to fetch from 17TRACK, falling back to mock.', error);
            }
        }

        // 2. Fallback to Mock Logic
        return trackingService.getMockStatus(trackingCode);
    },

    getMockStatus: async (trackingCode) => {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 800));

        // Logic for testing/demo purposes:
        // Starts with "DEL" -> Delivered
        // Starts with "EXC" -> Exception
        // Starts with "OUT" -> Out for Delivery
        // Any other code -> In Transit

        let status = 'In Transit';
        const code = trackingCode.toUpperCase();

        if (code.startsWith('DEL')) status = 'Delivered';
        else if (code.startsWith('EXC')) status = 'Exception';
        else if (code.startsWith('OUT')) status = 'Out for Delivery';

        return {
            code: trackingCode,
            status: status,
            location: status === 'Delivered' ? 'Customer Address' : 'Distribution Center',
            timestamp: new Date().toISOString()
        };
    }
};
