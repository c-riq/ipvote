const ipCache = new Map();

function ipToInt(ip) {
    return ip.split('.')
        .reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

function ipv6ToBytes(ip) {
    const fullAddress = ip.split('::').map(part => {
        const segments = part.split(':');
        return segments.concat(Array(8 - segments.length).fill('0')).slice(0, 8);
    }).join(':');
    
    return fullAddress.split(':')
        .map(group => parseInt(group || '0', 16))
        .reduce((acc, val) => {
            acc.push((val >> 8) & 0xff);
            acc.push(val & 0xff);
            return acc;
        }, []);
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
        for (let i = 0; i < fullBytes; i++) {
            if (ipBytes[i] !== rangeBytes[i]) return false;
        }
        
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

function createIPRangeLookup(ranges) {
    const ipv4Ranges = [];
    const ipv6Ranges = [];
    
    for (const range of ranges) {
        if (range.ip_prefix.includes(':')) {
            ipv6Ranges.push(range);
        } else {
            ipv4Ranges.push(range);
        }
    }
    
    ipv4Ranges.sort((a, b) => parseInt(b.ip_prefix.split('/')[1]) - parseInt(a.ip_prefix.split('/')[1]));
    ipv6Ranges.sort((a, b) => parseInt(b.ip_prefix.split('/')[1]) - parseInt(a.ip_prefix.split('/')[1]));
    
    return { ipv4Ranges, ipv6Ranges };
}

function findCloudProvider(ip, rangeLookup) {
    if (ipCache.has(ip)) {
        return ipCache.get(ip);
    }
    
    const ranges = ip.includes(':') ? rangeLookup.ipv6Ranges : rangeLookup.ipv4Ranges;
    let result = null;
    
    for (const range of ranges) {
        if (isIPInRange(ip, range.ip_prefix)) {
            result = `${range.cloud_provider}:${range.tag}`;
            break;
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