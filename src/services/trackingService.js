const API_KEY = import.meta.env.VITE_17TRACK_KEY;
const API_URL = 'https://api.17track.net/track/v2.2/gettrackinfo';

/**
 * Consulta de rastreio.
 *
 * Sem chave de API configurada, devolve null — e não um status inventado.
 * Havia aqui um modo simulado que respondia 'In Transit' para qualquer código
 * que não começasse com DEL/EXC/OUT; como nenhuma chave está configurada, era
 * ficção sendo exibida (e gravada) como se fosse rastreio real.
 */
export const trackingService = {
    isConfigured: () => Boolean(API_KEY),

    getTrackingStatus: async (trackingCode) => {
        if (!API_KEY || !trackingCode) return null;

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    '17token': API_KEY
                },
                body: JSON.stringify([{ number: trackingCode }])
            });

            if (!response.ok) {
                console.error('17TRACK request failed:', response.status);
                return null;
            }

            const data = await response.json();
            const accepted = data?.data?.accepted?.[0];
            if (!accepted) return null;

            return mapTrackInfo(trackingCode, accepted);
        } catch (error) {
            console.error('17TRACK request error:', error);
            return null;
        }
    }
};

/**
 * Converte a resposta do 17TRACK para o formato do app.
 *
 * ATENÇÃO: este mapeamento ainda não foi validado contra a API real, porque
 * nunca houve chave configurada. A versão anterior lia campos `z0`/`z1`, que
 * são do formato v1, contra o endpoint v2.2 — não funcionaria. Conferir contra
 * uma resposta de verdade antes de confiar no resultado.
 */
function mapTrackInfo(trackingCode, accepted) {
    const info = accepted.track_info ?? accepted.track ?? {};
    const latest = info.latest_status ?? {};
    const event = info.latest_event ?? {};

    const raw = String(latest.status || '').toLowerCase();
    let status = 'In Transit';
    if (raw.includes('delivered')) status = 'Delivered';
    else if (raw.includes('exception') || raw.includes('alert')) status = 'Exception';
    else if (raw.includes('pickup')) status = 'Out for Delivery';

    return {
        code: trackingCode,
        status,
        location: event.location || null,
        timestamp: event.time_iso || event.time_utc || null,
        // Algumas transportadoras põem "Received By: <nome>" na descrição do
        // evento. É texto livre, então fica cru para quem quiser aproveitar.
        description: event.description || null
    };
}
