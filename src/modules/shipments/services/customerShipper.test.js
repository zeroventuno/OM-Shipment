import { describe, expect, it } from 'vitest';
import {
    NEW_ADDRESS, addressOptions, addressToSave, initialAddressChoice, namesMatch, shipperFromCustomer,
} from './customerShipper';

const customer = {
    name: 'Alonzo Aguirre', address_line1: 'Calle 1', address_line2: 'Int 2', postal_code: '36300',
    city: 'San Francisco', country: 'México', phone: '+52 1', email: 'a@example.com', contact_name: 'Alonzo', tax_id: 'X1',
};
const other = { label: 'Oficina', address_line1: 'Av. 5', postal_code: '01000', city: 'CDMX', country: 'México', phone: '+52 2', contact_name: null };

describe('customerShipper', () => {
    it('reconhece o mesmo cliente com nome parcial, em qualquer ordem', () => {
        expect(namesMatch('ALONZO AGUIRRE ROCHA', 'Alonzo Aguirre')).toBe(true);
        expect(namesMatch('Aguirre, Alónzo', 'alonzo aguirre')).toBe(true);
        expect(namesMatch('Eddys', 'EDDYS')).toBe(true);
    });
    it('não liga clientes por uma palavra só', () => {
        expect(namesMatch('Alonzo Aguirre', 'Alonzo')).toBe(false);
        expect(namesMatch('Alonzo Aguirre', 'Alonzo Perez')).toBe(false);
        expect(namesMatch('', 'Alonzo')).toBe(false);
    });
    it('junta o endereço principal aos de entrega, sem repetir', () => {
        const copy = { ...customer, address_line1: 'CALLE 1', label: null };
        expect(addressOptions(customer, [copy])).toHaveLength(1);
        expect(addressOptions(customer, [other]).map((o) => o.address.city)).toEqual(['CDMX', 'San Francisco']);
        expect(addressOptions({ name: 'Sem endereço' }, [])).toEqual([]);
    });
    it('escolhe sozinho só quando há um endereço', () => {
        const one = addressOptions(customer, []);
        expect(initialAddressChoice(one)).toBe(one[0].key);
        expect(initialAddressChoice(addressOptions(customer, [other]))).toBe('');
        expect(initialAddressChoice([])).toBe(NEW_ADDRESS);
    });
    it('preenche endereço, telefone e e-mail do cliente', () => {
        const [option] = addressOptions(customer, []);
        expect(shipperFromCustomer(customer, option, { name: 'ALONZO AGUIRRE ROCHA', country: 'México' })).toEqual({
            name: 'Alonzo Aguirre', tax_id: 'X1', email: 'a@example.com', address: 'Calle 1, Int 2',
            postal_code: '36300', city: 'San Francisco', country: 'México', contact: 'Alonzo', phone: '+52 1',
        });
    });
    it('usa telefone do endereço e completa o que faltar com a ficha', () => {
        const [option] = addressOptions({}, [other]);
        const s = shipperFromCustomer(customer, option, { name: '', country: '' });
        expect(s.phone).toBe('+52 2');
        expect(s.contact).toBe('Alonzo');
    });
    it('sem cliente, fica com o nome e o país da retirada', () => {
        const s = shipperFromCustomer(null, null, { name: 'Novo', country: 'México' });
        expect(s).toMatchObject({ name: 'Novo', country: 'México', address: '', phone: '' });
    });
    it('só grava endereço novo completo e que ainda não existe', () => {
        const base = { address: 'Av. 9', postal_code: '', city: 'León', country: 'México', contact: '', phone: '' };
        const options = addressOptions(customer, []);
        expect(addressToSave(base, options)).toMatchObject({ address_line1: 'Av. 9', city: 'León' });
        expect(addressToSave({ ...base, city: ' ' }, options)).toBeNull();
        expect(addressToSave({ ...base, address: 'Calle 1 Int 2', postal_code: '36300', city: 'San Francisco' }, options)).toBeNull();
    });
});
