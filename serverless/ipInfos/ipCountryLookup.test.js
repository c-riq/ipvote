const fs = require('fs');
const path = require('path');

// Setup and teardown for test files
const TEST_DIR = './ip_info_io_country_asn_partitioned';
const SAMPLE_FILES = {
    'ipv4_104.254.119.0_104.254.119.255.csv': 
        'start_ip,end_ip,country,country_name,continent,continent_name,asn,as_name,as_domain\n' +
        '104.254.119.0,104.254.119.255,AE,United Arab Emirates,AS,Asia,,,',
    
    'ipv4_203.82.17.0_203.82.17.255.csv':
        'start_ip,end_ip,country,country_name,continent,continent_name,asn,as_name,as_domain\n' +
        '203.82.17.0,203.82.17.255,AE,United Arab Emirates,AS,Asia,,,',
    
    'ipv6_2a13;ef41;a000;;_2a13;ef41;a003;ffff;ffff;ffff;ffff;ffff.csv':
        'start_ip,end_ip,country,country_name,continent,continent_name,asn,as_name,as_domain\n' +
        '2a13:ef41:a000::,2a13:ef41:a003:ffff:ffff:ffff:ffff:ffff,AD,Andorra,EU,Europe,,,',
    
    'ipv6_2a13;ef41;a004;;_2a13;ef41;a006;ffff;ffff;ffff;ffff;ffff.csv':
        'start_ip,end_ip,country,country_name,continent,continent_name,asn,as_name,as_domain\n' +
        '2a13:ef41:a004::,2a13:ef41:a006:ffff:ffff:ffff:ffff:ffff,AD,Andorra,EU,Europe,,,',
};

// Create directory and files before importing the module
if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
}

// Only create sample files if directory is empty
const existingFiles = fs.readdirSync(TEST_DIR);
if (existingFiles.length === 0) {
    Object.entries(SAMPLE_FILES).forEach(([filename, content]) => {
        const filePath = path.join(TEST_DIR, filename);
        fs.writeFileSync(filePath, content.trim() + '\n', 'utf8');
    });
}

// Now we can safely require the module
const { getIPInfo, ipv4ToInt, ipv6ToBigInt } = require('./ipCountryLookup');

beforeAll(() => {
    // Directory and files are already created, nothing to do here
});

afterAll(() => {
    // Clean up test files and directory
    return;
    if (fs.existsSync(TEST_DIR)) {
        fs.readdirSync(TEST_DIR).forEach(file => {
            fs.unlinkSync(path.join(TEST_DIR, file));
        });
        fs.rmdirSync(TEST_DIR);
    }
});

// Clear the require cache to ensure fresh module load
beforeEach(() => {
    jest.resetModules();
});

// IPv4 Tests
describe('IPv4 Tests', () => {
    test('should correctly identify IPv4 addresses from sample data', () => {
        // Test an IP from the first IPv4 range
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

        // Test an IP from the second IPv4 range
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
        expect(getIPInfo('104.254.119.0')).toEqual({
            country: 'AE',
            country_name: 'United Arab Emirates',
            continent: 'AS',
            continent_name: 'Asia',
            asn: null,
            as_name: null,
            as_domain: null
        });

        // Test end of range
        expect(getIPInfo('104.254.119.255')).toEqual({
            country: 'AE',
            country_name: 'United Arab Emirates',
            continent: 'AS',
            continent_name: 'Asia',
            asn: null,
            as_name: null,
            as_domain: null
        });
    });

    test('should return null for IPs outside sample ranges', () => {
        expect(getIPInfo('192.168.1.1')).toBeNull();
        expect(getIPInfo('8.8.8.8')).toBeNull();
    });
});

// IPv6 Tests
describe('IPv6 Tests', () => {
    test('should correctly identify IPv6 addresses from sample data', () => {
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

    test('should handle different IPv6 formats within sample ranges', () => {
        const result1 = getIPInfo('2a13:ef41:a000:0:0:0:0:1');
        const result2 = getIPInfo('2a13:ef41:a000::1');
        
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
        expect(getIPInfo('2a13:ef41:a000::')).toEqual({
            country: 'AD',
            country_name: 'Andorra',
            continent: 'EU',
            continent_name: 'Europe',
            asn: null,
            as_name: null,
            as_domain: null
        });

        // Test end of range
        expect(getIPInfo('2a13:ef41:a003:ffff:ffff:ffff:ffff:ffff')).toEqual({
            country: 'AD',
            country_name: 'Andorra',
            continent: 'EU',
            continent_name: 'Europe',
            asn: null,
            as_name: null,
            as_domain: null
        });
    });

    test('should return null for IPv6 addresses outside sample ranges', () => {
        expect(getIPInfo('2001:db8::1')).toBeNull();
        expect(getIPInfo('fe80::1')).toBeNull();
    });
});

// Conversion Function Tests
describe('IP Conversion Functions', () => {
    test('ipv4ToInt should correctly convert valid IPv4 addresses', () => {
        // 104.254.119.0 = (104 << 24) + (254 << 16) + (119 << 8) + 0
        // = (104 * 16777216) + (254 * 65536) + (119 * 256) + 0
        // = 1745879040 + 16646144 + 30464 + 0
        // = 1761507072
        expect(ipv4ToInt('104.254.119.0')).toBe(1761507072);
        expect(ipv4ToInt('0.0.0.0')).toBe(0);
        expect(ipv4ToInt('255.255.255.255')).toBe(4294967295);
    });

    test('ipv4ToInt should handle invalid inputs', () => {
        expect(ipv4ToInt('256.1.2.3')).toBeNull();
        expect(ipv4ToInt('1.2.3')).toBeNull();
        expect(ipv4ToInt('')).toBeNull();
    });

    test('ipv6ToBigInt should correctly convert valid IPv6 addresses', () => {
        const result = ipv6ToBigInt('2a13:ef41:a000::1');
        expect(result).not.toBeNull();
        expect(typeof result).toBe('bigint');
        
        expect(ipv6ToBigInt('::')).toBe(BigInt(0));
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
        expect(getIPInfo('1.1.1.1')).toBeNull();  // IP not in our dataset
        expect(getIPInfo('2001:db8::1')).toBeNull();  // IP not in our dataset
    });
}); 
