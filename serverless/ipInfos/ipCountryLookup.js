const fs = require('fs');
const path = require('path');

// Load partitioned files info
function loadPartitionInfo() {
    const partitionDir = './ip_info_io_country_asn_partitioned';
    const files = fs.readdirSync(partitionDir);
    
    const ipv4Partitions = [];
    const ipv6Partitions = [];
    
    files.forEach(file => {
        const [type, startIP, endIP] = path.parse(file).name.split('_');
        const fullPath = path.join(partitionDir, file);
        
        if (type === 'ipv4') {
            ipv4Partitions.push({ startIP, endIP, path: fullPath });
        } else if (type === 'ipv6') {
            ipv6Partitions.push({ 
                startIP: startIP.replace(/;/g, ':'),
                endIP: endIP.replace(/;/g, ':'),
                path: fullPath 
            });
        }
    });
    
    return {
        ipv4: ipv4Partitions.sort((a, b) => ipv4ToInt(a.startIP) - ipv4ToInt(b.startIP)),
        ipv6: ipv6Partitions.sort((a, b) => {
            const aInt = ipv6ToBigInt(a.startIP);
            const bInt = ipv6ToBigInt(b.startIP);
            return aInt > bInt ? 1 : aInt < bInt ? -1 : 0;
        })
    };
}

const partitions = loadPartitionInfo();

// Parse IPv4 address to numeric value for comparison
function ipv4ToInt(ip) {
    // Add IPv4 validation
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    
    for (const part of parts) {
        const num = parseInt(part);
        if (isNaN(num) || num < 0 || num > 255) return null;
    }
    
    return parts.reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

// Parse IPv6 address to BigInt for comparison
function ipv6ToBigInt(ip) {
    try {
        // Basic IPv6 format validation
        if (!ip || typeof ip !== 'string') return null;
        
        // Remove IPv6 zone index if present
        ip = ip.split('%')[0];
        
        // Special case for ::
        if (ip === '::') {
            return BigInt(0);
        }
        
        // Expand :: notation
        if (ip.includes('::')) {
            const parts = ip.split('::');
            if (parts.length > 2) return null; // Invalid if more than one '::'
            
            const left = parts[0] ? parts[0].split(':') : [];
            const right = parts[1] ? parts[1].split(':') : [];
            const missing = 8 - (left.length + right.length);
            if (missing < 0) return null;
            
            const zeros = Array(missing).fill('0');
            const fullParts = [...left, ...zeros, ...right];
            ip = fullParts.join(':');
        }
        
        // Split and validate each hextet
        const hextets = ip.split(':');
        if (hextets.length !== 8) return null;
        
        // Convert to BigInt
        let result = BigInt(0);
        for (const hextet of hextets) {
            if (hextet === '') return null;
            const num = parseInt(hextet, 16);
            if (isNaN(num) || num < 0 || num > 0xffff) return null;
            result = (result << BigInt(16)) | BigInt(num);
        }
        
        return result;
    } catch (error) {
        console.error('IPv6 conversion error:', error);
        return null;
    }
}

// Get all information for an IP address
function getIPInfo(ip) {
    if (!ip || typeof ip !== 'string') return null;
    
    const isIPv4 = ip.includes('.');
    
    if (isIPv4) {
        const ipInt = ipv4ToInt(ip);
        if (ipInt === null) return null;
        
        // Find the right partition
        const partition = partitions.ipv4.find(p => {
            const startInt = ipv4ToInt(p.startIP);
            const endInt = ipv4ToInt(p.endIP);
            return ipInt >= startInt && ipInt <= endInt;
        });
        
        if (!partition) return null;
        
        // Load and search the partition
        const entries = fs.readFileSync(partition.path, 'utf8').split('\n').slice(1);
        
        for (const entry of entries) {
            const [startIP, endIP, country, countryName, continent, continentName, asn, asName, asDomain] = entry.split(',');
            const startInt = ipv4ToInt(startIP);
            const endInt = ipv4ToInt(endIP);
            
            if (ipInt >= startInt && ipInt <= endInt) {
                return {
                    country,
                    country_name: countryName,
                    continent,
                    continent_name: continentName,
                    asn: asn || null,
                    as_name: asName || null,
                    as_domain: asDomain || null
                };
            }
        }
    } else {
        const ipBigInt = ipv6ToBigInt(ip);
        if (ipBigInt === null) return null;
        
        // Find the right partition
        const partition = partitions.ipv6.find(p => {
            const startBigInt = ipv6ToBigInt(p.startIP);
            const endBigInt = ipv6ToBigInt(p.endIP);
            if (!startBigInt || !endBigInt) return false;
            return ipBigInt >= startBigInt && ipBigInt <= endBigInt;
        });
        
        if (!partition) return null;
        
        // Load and search the partition
        const entries = fs.readFileSync(partition.path, 'utf8').split('\n').slice(1);
        
        for (const entry of entries) {
            if (!entry.trim()) continue;  // Skip empty lines
            const [startIP, endIP, country, countryName, continent, continentName, asn, asName, asDomain] = entry.split(',');
            const startBigInt = ipv6ToBigInt(startIP);
            const endBigInt = ipv6ToBigInt(endIP);
            
            if (!startBigInt || !endBigInt) continue;  // Skip invalid entries
            
            if (ipBigInt >= startBigInt && ipBigInt <= endBigInt) {
                return {
                    country,
                    country_name: countryName,
                    continent,
                    continent_name: continentName,
                    asn: asn || null,
                    as_name: asName || null,
                    as_domain: asDomain || null
                };
            }
        }
    }
    
    return null;
}

module.exports = {
    getIPInfo,
    ipv4ToInt,
    ipv6ToBigInt
};

// Simple tests
if (require.main === module) {
    // Test IPv4 addresses
    console.log('Testing IPv4 addresses:');
    console.log('104.254.119.170 ->', JSON.stringify(getIPInfo('104.254.119.170'), null, 2));
    console.log('203.82.17.123 ->', JSON.stringify(getIPInfo('203.82.17.123'), null, 2));
    
    // Test IPv6 addresses
    console.log('\nTesting IPv6 addresses:');
    console.log('2a13:ef41:a000::1 ->', JSON.stringify(getIPInfo('2a13:ef41:a000::1'), null, 2));
    console.log('2603:1090:e00:c200::1 ->', JSON.stringify(getIPInfo('2603:1090:e00:c200::1'), null, 2));
    
    // Test invalid or non-existent IPs
    console.log('\nTesting invalid/non-existent IPs:');
    console.log('256.256.256.256 ->', getIPInfo('256.256.256.256'));
    console.log('invalid_ip ->', getIPInfo('invalid_ip'));
}

