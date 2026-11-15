export const DEFAULT_STATUS = 'Pending';
export const DELIVERED = 'Delivered';

/**
 * Decide o status de um envio na hora de salvar.
 *
 * Um comprovante de entrega anexado é prova de que o envio chegou, então ele
 * manda no status. Enquanto o rastreio automático não estiver ligado, é o único
 * sinal de entrega confiável que existe no sistema.
 *
 * Remover o comprovante NÃO desfaz a entrega: uma entrega que aconteceu não
 * deixa de ter acontecido porque o arquivo foi trocado.
 *
 * @param {{podFiles?: string[], status?: string}} shipment
 * @param {string} [currentStatus] status já gravado, quando estiver editando
 */
export function resolveStatus(shipment, currentStatus) {
    if ((shipment?.podFiles || []).length > 0) return DELIVERED;
    return currentStatus || shipment?.status || DEFAULT_STATUS;
}
