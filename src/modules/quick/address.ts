/*
 * Endereço de faturamento x endereço de envio.
 *
 * O cadastro do cliente (customers) guarda o endereço principal, que é o de
 * FATURAMENTO (o da fatura, o fiscal). customer_addresses guarda os endereços
 * de ENVIO. Um mesmo endereço vale para os dois quando existe um endereço de
 * envio igual ao de faturamento.
 */

type Addr = { address_line1?: string | null; postal_code?: string | null; city?: string | null; country?: string | null };

const key = (v: string | null | undefined) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[^\p{L}\p{N}]/gu, "");

/** Mesmo endereço? (rua, CEP e cidade; o país pode estar escrito diferente) */
export function sameAddress(a: Addr | null | undefined, b: Addr | null | undefined): boolean {
  if (!a || !b || !key(a.address_line1) || !key(b.address_line1)) return false;
  return key(a.address_line1) === key(b.address_line1) && key(a.city) === key(b.city) && key(a.postal_code) === key(b.postal_code);
}
