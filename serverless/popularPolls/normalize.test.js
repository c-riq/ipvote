const { normalizeText } = require('./normalize');

describe('normalizeText', () => {
    test('removes diacritics and converts to lowercase', () => {
        expect(normalizeText('Orbán')).toBe('orban');
        expect(normalizeText('CAFÉ')).toBe('cafe');
        expect(normalizeText('piñata')).toBe('pinata');
        expect(normalizeText('crème')).toBe('creme');
    });

    test('handles regular text correctly', () => {
        expect(normalizeText('Hello World')).toBe('hello world');
        expect(normalizeText('TEST')).toBe('test');
    });
});