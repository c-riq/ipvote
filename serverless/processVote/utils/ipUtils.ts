export const expandIPv6 = (ip: string): string => {
    if (ip.includes('::')) {
        const [prefix, suffix] = ip.split('::');
        const prefixParts = prefix.split(':');
        const suffixParts = suffix.split(':');
        const missingParts = 8 - prefixParts.length - suffixParts.length;
        const expanded = prefixParts.concat(Array(missingParts).fill('0000')).concat(suffixParts);
        return expanded.join(':');
    }
    return ip;
}

export const _64bitMask = (ip: string): string => {
    const parts = ip.split(':');
    const mask = parts.slice(0, 4).map(i => i.padStart(4, '0')).join(':');
    return mask;
}

export const getPartitionKey = (ip: string): string => {
    if (ip.includes(':')) { 
        const firstPart = ip.split(':')[0]
        const paddedIp = firstPart.padStart(4, '0');
        return paddedIp.substring(0, 2);
    }
    if (ip.includes('.')) {
        const firstPart = ip.split('.')[0]
        const paddedIp = firstPart.padStart(3, '0');
        return paddedIp.substring(0, 2);
    }
    throw new Error('Invalid IP address');
}; 