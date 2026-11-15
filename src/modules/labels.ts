/*
 * Valores gravados no banco → chave de tradução para exibir.
 *
 * Os valores no banco continuam os de sempre (em italiano/português, como o
 * antigo OM-Assist gravava); só o que aparece na tela é traduzido.
 */

export const PHASE_LABELS: Record<string, string> = {
    "Ingresso": "Received",
    "Spedito": "Sent to producer",
    "In lavorazione": "In progress",
    "Completato": "Completed",
};

export const APPROVAL_LABELS: Record<string, string> = {
    "Approvato": "Approved",
    "Rifiutato": "Rejected",
};

export const WARRANTY_STATUS_LABELS: Record<string, string> = {
    "In attesa": "Waiting",
    "In lavorazione": "In progress",
    "Completato": "Completed",
};

export const PROCESS_TYPE_LABELS: Record<string, string> = {
    "Garantia": "Warranty",
    "A pagamento": "Paid",
};

export const SOLUTION_LABELS: Record<string, string> = {
    "Pintura": "Paint",
    "Reparação + Pintura": "Repair + paint",
    "Substituição": "Replacement",
};

/** Qualquer valor conhecido (fase, status, solução…) → chave de tradução. */
export const VALUE_LABELS: Record<string, string> = {
    ...PHASE_LABELS,
    ...APPROVAL_LABELS,
    ...WARRANTY_STATUS_LABELS,
    ...PROCESS_TYPE_LABELS,
    ...SOLUTION_LABELS,
};

/** Nome do campo → chave de tradução do rótulo, usado no histórico. */
export const FIELD_LABELS: Record<string, string> = {
    // Assistências
    clientName: "Customer name",
    clientEmail: "Customer email",
    component: "Component",
    brand: "Brand",
    serialNumber: "Serial number",
    problem: "Problem",
    protocolNumber: "Protocol no.",
    approvalStatus: "Approval status",
    phase: "Phase",
    shippingDate: "Shipping date",
    trackingNumber: "Tracking",
    shippingCompany: "Courier",
    completionDate: "Completion date",
    // Garantias
    customerName: "Customer name",
    email: "Email",
    agent: "Agent",
    bikeModel: "Bike model",
    size: "Size",
    observation: "Notes",
    paintDetails: "Paint details",
    componentsDescription: "Mounted components",
    status: "Status",
    solution: "Solution",
    producer: "Producer",
    newSerialNumber: "New serial number",
    processType: "Process type",
    images: "Photos",
    orderNumber: "Order no.",
    value: "Value",
    invoice: "Invoice",
    startDate: "Start date",
    // Gravado pelo banco quando um envio ligado é salvo
    shipment: "Shipment",
    // Nota gravada por um sistema parceiro (API)
    partnerNote: "Partner note",
};

/*
 * O histórico gravado pelo sistema antigo guardava o rótulo em italiano
 * (ex.: "Nome del Cliente") em vez do nome do campo. Este mapa traduz esses
 * registros antigos também.
 */
const LEGACY_FIELD_LABELS: Record<string, string> = {
    "Nome del Cliente": "Customer name",
    "Email del Cliente": "Customer email",
    "Componente": "Component",
    "Marca": "Brand",
    "Numero di Serie": "Serial number",
    "Problema": "Problem",
    "N° Protocollo": "Protocol no.",
    "Stato di Approvazione": "Approval status",
    "Fase": "Phase",
    "Data di Spedizione": "Shipping date",
    "Tracking": "Tracking",
    "Corriere": "Courier",
    "Data di Completamento": "Completion date",
    "Email": "Email",
    "Agente": "Agent",
    "N° Serial": "Serial number",
    "Modello Bicicletta": "Bike model",
    "Taglia": "Size",
    "Osservazione": "Notes",
    "Dettagli Verniciatura": "Paint details",
    "Descrizione Componenti": "Mounted components",
    "Stato": "Status",
    "Soluzione": "Solution",
    "Produttore": "Producer",
    "Nuovo N° Serial": "New serial number",
    "Tipo di Processo": "Process type",
    "Foto": "Photos",
    "N° Ordine": "Order no.",
    "Valore": "Value",
    "Fattura": "Invoice",
    "Data Inizio": "Start date",
};

export function fieldLabelKey(field: string): string {
    return FIELD_LABELS[field] ?? LEGACY_FIELD_LABELS[field] ?? field;
}
