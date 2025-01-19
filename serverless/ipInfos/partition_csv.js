const fs = require('fs');
const path = require('path');
const { ipv4ToInt, ipv6ToBigInt } = require('./ipCountryLookup');

const INPUT_FILE = '../../data/ip_info_io_country_asn.csv';
const OUTPUT_DIR = '../../data/ip_info_io_country_asn_partitioned';
//const INPUT_FILE = './ipCountryMap.csv';
//const OUTPUT_DIR = './ip_info_io_country_asn_partitioned';
const IPV4_PARTS = 10;
const IPV6_PARTS = 20;

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Read and parse CSV
const content = fs.readFileSync(INPUT_FILE, 'utf8');
const [header, ...lines] = content.split('\n');

function parseCSVLine(line) {
    const cells = [];
    let currentCell = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            cells.push(currentCell);
            currentCell = '';
        } else {
            currentCell += char;
        }
    }
    cells.push(currentCell); // Push the last cell
    
    // Remove surrounding quotes, encode commas, and clean special characters
    return cells.map(cell => {
        if (cell.startsWith('"') && cell.endsWith('"')) {
            cell = cell.slice(1, -1);
        }
        return cell
            .replace(/,/g, '%2C')
            .replace(/[\n\r]/g, ' ')  // Replace newlines with spaces
            .replace(/[\x00-\x1F\x7F-\x9F]/g, '')  // Remove control characters
            .replace(/\s+/g, ' ')  // Normalize multiple spaces to single space
            .trim();  // Remove leading/trailing whitespace
    });
}

// Modify the entries mapping to use the new parser
const entries = lines
    .filter(line => line.trim())  // Remove empty lines
    .map(line => {
        const parts = parseCSVLine(line);
        const startIP = parts[0];
        const endIP = parts[1];
        const isIPv4 = startIP.includes('.');
        const numericIP = isIPv4 ? ipv4ToInt(startIP) : ipv6ToBigInt(startIP);
        return {
            line: parts.join(','),  // Join with regular comma since we've encoded internal commas
            isIPv4,
            numericIP,
            startIP: isIPv4 ? startIP : startIP.replace(/:/g, ';'),
            endIP: isIPv4 ? endIP : endIP.replace(/:/g, ';')
        };
    })
    .filter(entry => entry.numericIP !== null);  // Remove invalid IPs

const ipv4Entries = entries
    .filter(entry => entry.isIPv4)
    .sort((a, b) => a.numericIP - b.numericIP);

const ipv6Entries = entries
    .filter(entry => !entry.isIPv4)
    .sort((a, b) => a.numericIP > b.numericIP ? 1 : -1);  // Use comparison for BigInt

// Write partitioned files
function writePartitions(entries, prefix, numParts) {
    const partitionSize = Math.ceil(entries.length / numParts);
    
    for (let i = 0; i < numParts; i++) {
        const start = i * partitionSize;
        const end = Math.min(start + partitionSize, entries.length);
        if (start >= entries.length) break;
        
        const partition = entries.slice(start, end);
        const firstIP = partition[0].startIP;
        const lastIP = partition[partition.length - 1].endIP;
        const filename = path.join(OUTPUT_DIR, `${prefix}_${firstIP}_${lastIP}.csv`);
        
        const content = [header, ...partition.map(e => e.line)].join('\n');
        fs.writeFileSync(filename, content);
        
        console.log(`Written ${partition.length} entries to ${filename}`);
    }
}

writePartitions(ipv4Entries, 'ipv4', IPV4_PARTS);
writePartitions(ipv6Entries, 'ipv6', IPV6_PARTS);

console.log('\nSummary:');
console.log(`Total entries: ${entries.length}`);
console.log(`IPv4 entries: ${ipv4Entries.length}`);
console.log(`IPv6 entries: ${ipv6Entries.length}`); 

