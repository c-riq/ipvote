const {
    createIPRangeLookup,
    findCloudProvider,
    clearCache,
    isIPInRange,
    ipToInt,
    ipv6ToBytes
} = require('./cloudProviderChecker');

describe('IP Address Utilities', () => {
    describe('ipToInt', () => {
        test('converts IPv4 addresses to integers correctly', () => {
            expect(ipToInt('0.0.0.0')).toBe(0);
            expect(ipToInt('0.0.0.1')).toBe(1);
            expect(ipToInt('0.0.1.0')).toBe(256);
            expect(ipToInt('192.168.1.1')).toBe(3232235777);
            expect(ipToInt('255.255.255.255')).toBe(4294967295);
        });
    });

    describe('ipv6ToBytes', () => {
        test('converts full IPv6 addresses to bytes correctly', () => {
            expect(ipv6ToBytes('2001:0db8:85a3:0000:0000:8a2e:0370:7334'))
                .toEqual([
                    0x20, 0x01, 0x0d, 0xb8, 0x85, 0xa3, 0x00, 0x00,
                    0x00, 0x00, 0x8a, 0x2e, 0x03, 0x70, 0x73, 0x34
                ]);
        });

        test('handles compressed IPv6 addresses correctly', () => {
            expect(ipv6ToBytes('2001:db8::1'))
                .toEqual([
                    0x20, 0x01, 0x0d, 0xb8, 0x00, 0x00, 0x00, 0x00,
                    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01
                ]);
        });
    });
});

describe('IP Range Checking', () => {
    describe('isIPInRange', () => {
        test('correctly checks IPv4 ranges', () => {
            expect(isIPInRange('192.168.1.1', '192.168.1.0/24')).toBe(true);
            expect(isIPInRange('192.168.2.1', '192.168.1.0/24')).toBe(false);
            expect(isIPInRange('192.168.1.255', '192.168.1.0/24')).toBe(true);
            expect(isIPInRange('192.168.1.1', '192.168.1.0/32')).toBe(false);
            expect(isIPInRange('192.168.1.0', '192.168.1.0/32')).toBe(true);
        });

        test('correctly checks IPv6 ranges', () => {
            expect(isIPInRange('2001:db8::1', '2001:db8::/32')).toBe(true);
            expect(isIPInRange('2001:db8::1', '2001:db8::/128')).toBe(false);
            expect(isIPInRange('2001:db9::1', '2001:db8::/32')).toBe(false);
        });

        test('returns false for mismatched IP versions', () => {
            expect(isIPInRange('192.168.1.1', '2001:db8::/32')).toBe(false);
            expect(isIPInRange('2001:db8::1', '192.168.1.0/24')).toBe(false);
        });
    });
});

describe('Cloud Provider Lookup', () => {
    beforeEach(() => {
        clearCache();
    });

    describe('createIPRangeLookup', () => {
        test('correctly organizes IPv4 and IPv6 ranges', () => {
            const ranges = [
                { ip_prefix: '192.168.1.0/24', cloud_provider: 'AWS', tag: 'us-east-1' },
                { ip_prefix: '192.168.2.0/24', cloud_provider: 'AWS', tag: 'us-east-2' },
                { ip_prefix: '10.0.0.0/8', cloud_provider: 'GCP', tag: 'us-central1' },
                { ip_prefix: '172.16.0.0/12', cloud_provider: 'Azure', tag: 'eastus' },
                { ip_prefix: '2001:db8::/32', cloud_provider: 'AWS', tag: 'ipv6-1' },
                { ip_prefix: '2001:db8:1::/48', cloud_provider: 'AWS', tag: 'ipv6-2' },
                { ip_prefix: '2600:1f00::/24', cloud_provider: 'GCP', tag: 'ipv6-3' }
            ];

            const lookup = createIPRangeLookup(ranges);
            
            // Test IPv4 organization
            expect(lookup.ipv4RangeMap['192'].length).toBe(2);
            expect(lookup.ipv4RangeMap['10'].length).toBe(1);
            expect(lookup.ipv4RangeMap['172'].length).toBe(1);
            
            // Test IPv6 organization
            expect(lookup.ipv6RangeMap['2001'].length).toBe(2);
            expect(lookup.ipv6RangeMap['2600'].length).toBe(1);
            
            // Verify structure of stored ranges
            expect(lookup.ipv4RangeMap['192'][0]).toEqual(
                expect.objectContaining({
                    ip_prefix: expect.any(String),
                    cloud_provider: expect.any(String),
                    tag: expect.any(String)
                })
            );
        });

        test('sorts ranges by prefix length (most specific first)', () => {
            const ranges = [
                { ip_prefix: '192.168.0.0/16', cloud_provider: 'AWS', tag: 'wide' },
                { ip_prefix: '192.168.1.0/24', cloud_provider: 'AWS', tag: 'narrow' },
                { ip_prefix: '192.168.1.0/28', cloud_provider: 'AWS', tag: 'narrowest' },
                { ip_prefix: '2001:db8::/32', cloud_provider: 'AWS', tag: 'ipv6-wide' },
                { ip_prefix: '2001:db8::/48', cloud_provider: 'AWS', tag: 'ipv6-narrow' },
                { ip_prefix: '2001:db8::/64', cloud_provider: 'AWS', tag: 'ipv6-narrowest' }
            ];

            const lookup = createIPRangeLookup(ranges);
            
            // Test IPv4 sorting
            expect(lookup.ipv4RangeMap['192'][0].ip_prefix).toBe('192.168.1.0/28');
            expect(lookup.ipv4RangeMap['192'][1].ip_prefix).toBe('192.168.1.0/24');
            expect(lookup.ipv4RangeMap['192'][2].ip_prefix).toBe('192.168.0.0/16');
            
            // Test IPv6 sorting
            expect(lookup.ipv6RangeMap['2001'][0].ip_prefix).toBe('2001:db8::/64');
            expect(lookup.ipv6RangeMap['2001'][1].ip_prefix).toBe('2001:db8::/48');
            expect(lookup.ipv6RangeMap['2001'][2].ip_prefix).toBe('2001:db8::/32');
        });

        test('handles empty ranges', () => {
            const lookup = createIPRangeLookup([]);
            expect(lookup.ipv4RangeMap).toEqual({});
            expect(lookup.ipv6RangeMap).toEqual({});
        });

        test('handles ranges with same first byte but different networks', () => {
            const ranges = [
                { ip_prefix: '192.168.0.0/24', cloud_provider: 'AWS', tag: 'network1' },
                { ip_prefix: '192.169.0.0/24', cloud_provider: 'GCP', tag: 'network2' },
                { ip_prefix: '192.170.0.0/24', cloud_provider: 'Azure', tag: 'network3' }
            ];

            const lookup = createIPRangeLookup(ranges);
            expect(lookup.ipv4RangeMap['192'].length).toBe(3);
            expect(lookup.ipv4RangeMap['192'].map(r => r.tag))
                .toEqual(['network1', 'network2', 'network3']);
        });

        test('handles overlapping ranges correctly', () => {
            const ranges = [
                { ip_prefix: '192.168.0.0/16', cloud_provider: 'AWS', tag: 'wide' },
                { ip_prefix: '192.168.0.0/24', cloud_provider: 'GCP', tag: 'narrow' },
                { ip_prefix: '192.168.0.0/28', cloud_provider: 'Azure', tag: 'narrowest' }
            ];

            const lookup = createIPRangeLookup(ranges);
            expect(lookup.ipv4RangeMap['192'].length).toBe(3);
            // Should be sorted from most specific to least specific
            expect(lookup.ipv4RangeMap['192'].map(r => r.tag))
                .toEqual(['narrowest', 'narrow', 'wide']);
        });

        test('handles invalid IP ranges gracefully', () => {
            const ranges = [
                { ip_prefix: '192.168.1.0/24', cloud_provider: 'AWS', tag: 'valid' },
                { ip_prefix: 'invalid-ip/24', cloud_provider: 'AWS', tag: 'invalid' },
                { ip_prefix: '256.256.256.256/24', cloud_provider: 'AWS', tag: 'invalid' }
            ];

            expect(() => createIPRangeLookup(ranges)).not.toThrow();
            const lookup = createIPRangeLookup(ranges);
            expect(lookup.ipv4RangeMap['192'].length).toBe(1);
        });
    });

    describe('findCloudProvider', () => {
        const testRanges = [
            { ip_prefix: '192.168.1.0/24', cloud_provider: 'AWS', tag: 'us-east-1' },
            { ip_prefix: '192.168.0.0/16', cloud_provider: 'GCP', tag: 'wider-range' },
            { ip_prefix: '2001:db8::/32', cloud_provider: 'AWS', tag: 'ipv6-1' },
            { ip_prefix: '10.0.0.0/8', cloud_provider: 'GCP', tag: 'us-central1' }
        ];

        let lookup;

        beforeEach(() => {
            lookup = createIPRangeLookup(testRanges);
        });

        test('finds correct provider for IPv4 address', () => {
            expect(findCloudProvider('192.168.1.100', lookup)).toBe('AWS:us-east-1');
            expect(findCloudProvider('192.168.2.1', lookup)).toBe('GCP:wider-range');
            expect(findCloudProvider('10.10.10.10', lookup)).toBe('GCP:us-central1');
        });

        test('finds correct provider for IPv6 address', () => {
            expect(findCloudProvider('2001:db8::1', lookup)).toBe('AWS:ipv6-1');
            expect(findCloudProvider('2001:db9::1', lookup)).toBe(null);
        });

        test('returns null for unmatched IPs', () => {
            expect(findCloudProvider('172.16.1.1', lookup)).toBe(null);
            expect(findCloudProvider('2002:db8::1', lookup)).toBe(null);
        });

        test('uses cache for repeated lookups', () => {
            const ip = '192.168.1.100';
            const result1 = findCloudProvider(ip, lookup);
            const result2 = findCloudProvider(ip, lookup);
            
            expect(result1).toBe(result2);
            expect(result1).toBe('AWS:us-east-1');
        });
    });
}); 