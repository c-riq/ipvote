const { getIPInfo, ipv4ToInt, ipv6ToBigInt } = require('./ipCountryLookup');

// IPv4 Tests
describe('IPv4 Tests', () => {
    test('should correctly identify IPv4 addresses from sample data', () => {
        const uaeResult = getIPInfo('104.254.119.170');
        expect(uaeResult).toEqual({
            country: 'AE',
            country_name: 'United Arab Emirates',
            continent: 'AS',
            continent_name: 'Asia',
            asn: null,
            as_name: null,
            as_domain: null
        });

        const uaeResult2 = getIPInfo('203.82.17.123');
        expect(uaeResult2).toEqual({
            country: 'AE',
            country_name: 'United Arab Emirates',
            continent: 'AS',
            continent_name: 'Asia',
            asn: null,
            as_name: null,
            as_domain: null
        });
    });

    test('should handle invalid IPv4 addresses', () => {
        expect(getIPInfo('256.256.256.256')).toBeNull();
        expect(getIPInfo('1.2.3')).toBeNull();
        expect(getIPInfo('1.2.3.4.5')).toBeNull();
        expect(getIPInfo('abc.def.ghi.jkl')).toBeNull();
    });

    test('should handle edge cases in IPv4 ranges', () => {
        // Test start of range
        const startResult = getIPInfo('203.82.17.0');
        expect(startResult).toEqual({
            country: 'AE',
            country_name: 'United Arab Emirates',
            continent: 'AS',
            continent_name: 'Asia',
            asn: null,
            as_name: null,
            as_domain: null
        });

        // Test end of range
        const endResult = getIPInfo('203.82.17.255');
        expect(endResult).toEqual({
            country: 'AE',
            country_name: 'United Arab Emirates',
            continent: 'AS',
            continent_name: 'Asia',
            asn: null,
            as_name: null,
            as_domain: null
        });
    });
});

// IPv6 Tests
describe('IPv6 Tests', () => {
    test('should correctly identify IPv6 addresses', () => {
        const andorraResult = getIPInfo('2a13:ef41:a000::1');
        expect(andorraResult).toEqual({
            country: 'AD',
            country_name: 'Andorra',
            continent: 'EU',
            continent_name: 'Europe',
            asn: null,
            as_name: null,
            as_domain: null
        });
    });

    test('should handle different IPv6 formats', () => {
        const result1 = getIPInfo('2a13:ef41:a000:0:0:0:0:1');
        const result2 = getIPInfo('2a13:ef41:a000::0:1');
        
        expect(result1).toEqual(result2);
        expect(result1).toEqual({
            country: 'AD',
            country_name: 'Andorra',
            continent: 'EU',
            continent_name: 'Europe',
            asn: null,
            as_name: null,
            as_domain: null
        });
    });

    test('should handle invalid IPv6 addresses', () => {
        expect(getIPInfo('2001:invalid')).toBeNull();
        expect(getIPInfo('2001::db8::1')).toBeNull();  // Multiple ::
        expect(getIPInfo('::::')).toBeNull();
    });

    test('should handle edge cases in IPv6 ranges', () => {
        // Test start of range
        const startResult = getIPInfo('2a13:ef41:a000::');
        expect(startResult).toEqual({
            country: 'AD',
            country_name: 'Andorra',
            continent: 'EU',
            continent_name: 'Europe',
            asn: null,
            as_name: null,
            as_domain: null
        });

        // Test end of range
        const endResult = getIPInfo('2a13:ef41:a006:ffff:ffff:ffff:ffff:ffff');
        expect(endResult).toEqual({
            country: 'AD',
            country_name: 'Andorra',
            continent: 'EU',
            continent_name: 'Europe',
            asn: null,
            as_name: null,
            as_domain: null
        });
    });
});

// Conversion Function Tests
describe('IP Conversion Functions', () => {
    test('ipv4ToInt should correctly convert valid IPv4 addresses', () => {
        expect(ipv4ToInt('192.168.1.1')).toBe(3232235777);
        expect(ipv4ToInt('0.0.0.0')).toBe(0);
        expect(ipv4ToInt('255.255.255.255')).toBe(4294967295);
    });

    test('ipv4ToInt should handle invalid inputs', () => {
        expect(ipv4ToInt('256.1.2.3')).toBeNull();
        expect(ipv4ToInt('1.2.3')).toBeNull();
        expect(ipv4ToInt('')).toBeNull();
    });

    test('ipv6ToBigInt should correctly convert valid IPv6 addresses', () => {
        expect(ipv6ToBigInt('2a13:ef41:a000::1')).not.toBeNull();
        expect(ipv6ToBigInt('::')).toBe(BigInt(0));
        expect(ipv6ToBigInt('2a13:ef41:a000:0:0:0:0:1')).not.toBeNull();
    });

    test('ipv6ToBigInt should handle invalid inputs', () => {
        expect(ipv6ToBigInt('2001:db8::g')).toBeNull();
        expect(ipv6ToBigInt('2001::db8::1')).toBeNull();
        expect(ipv6ToBigInt('')).toBeNull();
    });
});

// General Tests
describe('General Functionality', () => {
    test('should handle empty or invalid inputs', () => {
        expect(getIPInfo('')).toBeNull();
        expect(getIPInfo(null)).toBeNull();
        expect(getIPInfo(undefined)).toBeNull();
        expect(getIPInfo('invalid_ip')).toBeNull();
    });

    test('should handle non-existent IP ranges', () => {
        expect(getIPInfo('0.0.0.0')).toBeNull();  // IP not in our dataset
        expect(getIPInfo('3001:db8::1')).toBeNull();  // IP not in our dataset
    });
}); 
