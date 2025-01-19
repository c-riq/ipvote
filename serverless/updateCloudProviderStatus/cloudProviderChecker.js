const ipCache = new Map();

function ipToInt(ip) {
    return ip.split('.')
        .reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

function ipv6ToBytes(ip) {
    // Expand compressed notation
    let fullAddress = ip;
    if (ip.includes('::')) {
        const parts = ip.split('::');
        const missing = 8 - (parts[0].split(':').length + parts[1].split(':').length);
        const zeros = Array(missing).fill('0000').join(':');
        fullAddress = `${parts[0]}:${zeros}${parts[1] ? ':' + parts[1] : ''}`;
    }

    // Ensure all parts are 4 digits
    const bytes = [];
    fullAddress.split(':').forEach(part => {
        // Pad each part to 4 digits
        const paddedPart = part.padStart(4, '0');
        // Convert each 16-bit group to two bytes
        const value = parseInt(paddedPart, 16);
        bytes.push((value >> 8) & 0xff);
        bytes.push(value & 0xff);
    });

    return bytes;
}

function isIPInRange(ip, cidr) {
    const isIPv6 = ip.includes(':');
    const isCIDRv6 = cidr.includes(':');
    
    if (isIPv6 !== isCIDRv6) return false;
    
    if (isIPv6) {
        const [rangeIP, bits] = cidr.split('/');
        const prefixLength = parseInt(bits);
        
        const ipBytes = ipv6ToBytes(ip);
        const rangeBytes = ipv6ToBytes(rangeIP);
        
        const fullBytes = Math.floor(prefixLength / 8);
        // Check full bytes
        for (let i = 0; i < fullBytes; i++) {
            if (ipBytes[i] !== rangeBytes[i]) return false;
        }
        
        // Check remaining bits
        const remainingBits = prefixLength % 8;
        if (remainingBits > 0) {
            const mask = 0xff << (8 - remainingBits);
            const lastByteIndex = fullBytes;
            if ((ipBytes[lastByteIndex] & mask) !== (rangeBytes[lastByteIndex] & mask)) {
                return false;
            }
        }
        
        return true;
    } else {
        const [rangeIP, bits] = cidr.split('/');
        const mask = ~((1 << (32 - parseInt(bits))) - 1);
        const ipInt = ipToInt(ip);
        const rangeInt = ipToInt(rangeIP);
        return (ipInt & mask) === (rangeInt & mask);
    }
}

function getFirstIPv4Byte(ip) {
    return ip.split('.')[0];
}

function getFirstIPv6Section(ip) {
    return ip.split(':')[0];
}

function createIPRangeLookup(ranges) {
    const ipv4RangeMap = {};
    const ipv6RangeMap = {};
    
    for (const range of ranges) {
        const { ip_prefix } = range;
        
        if (ip_prefix.includes(':')) {
            // IPv6
            const firstSection = getFirstIPv6Section(ip_prefix);
            if (!ipv6RangeMap[firstSection]) {
                ipv6RangeMap[firstSection] = [];
            }
            ipv6RangeMap[firstSection].push(range);
        } else {
            // IPv4
            const firstByte = getFirstIPv4Byte(ip_prefix);
            if (!ipv4RangeMap[firstByte]) {
                ipv4RangeMap[firstByte] = [];
            }
            ipv4RangeMap[firstByte].push(range);
        }
    }
    
    // Sort ranges within each block by prefix length (most specific first)
    for (const block in ipv4RangeMap) {
        ipv4RangeMap[block].sort((a, b) => 
            parseInt(b.ip_prefix.split('/')[1]) - parseInt(a.ip_prefix.split('/')[1])
        );
    }
    
    for (const block in ipv6RangeMap) {
        ipv6RangeMap[block].sort((a, b) => 
            parseInt(b.ip_prefix.split('/')[1]) - parseInt(a.ip_prefix.split('/')[1])
        );
    }
    
    return { ipv4RangeMap, ipv6RangeMap };
}

function findCloudProvider(ip, rangeLookup) {
    if (ipCache.has(ip)) {
        return ipCache.get(ip);
    }
    
    let result = null;
    
    if (ip.includes(':')) {
        // IPv6
        const firstSection = getFirstIPv6Section(ip);
        const relevantRanges = rangeLookup.ipv6RangeMap[firstSection] || [];
        
        for (const range of relevantRanges) {
            if (isIPInRange(ip, range.ip_prefix)) {
                result = `${range.cloud_provider}:${range.tag}`;
                break;
            }
        }
    } else {
        // IPv4
        const firstByte = getFirstIPv4Byte(ip);
        const relevantRanges = rangeLookup.ipv4RangeMap[firstByte] || [];
        
        for (const range of relevantRanges) {
            if (isIPInRange(ip, range.ip_prefix)) {
                result = `${range.cloud_provider}:${range.tag}`;
                break;
            }
        }
    }
    
    ipCache.set(ip, result);
    return result;
}

function clearCache() {
    ipCache.clear();
}

module.exports = {
    createIPRangeLookup,
    findCloudProvider,
    clearCache,
    // Export these for testing
    isIPInRange,
    ipToInt,
    ipv6ToBytes
}; 