const fs = require('fs');
const path = require('path');

function parseLinodeRanges(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  return lines
    .filter(line => line && !line.startsWith('#')) // Skip empty lines and comments
    .map(line => {
      const [ip_prefix, , region] = line.split(',');
      return {
        ip_prefix,
        cloud_provider: 'linode',
        tag: region || 'unknown'
      };
    });
}

function parseGoogleCloudRanges(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);
  
  return data.prefixes.map(prefix => ({
    ip_prefix: prefix.ipv4Prefix || prefix.ipv6Prefix,
    cloud_provider: 'google',
    tag: prefix.scope || 'unknown'
  }));
}

function parseAWSRanges(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);
  
  return data.prefixes
    .filter(prefix => prefix.ip_prefix) // Only include IPv4 prefixes
    .map(prefix => ({
      ip_prefix: prefix.ip_prefix,
      cloud_provider: 'aws',
      tag: prefix.region || 'unknown'
    }));
}

function parseAkamaiRanges(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  return lines
    .filter(line => line && !line.startsWith('#')) // Skip empty lines and comments
    .map(line => {
      const ip_prefix = line.trim();
      return {
        ip_prefix,
        cloud_provider: 'akamai',
        tag: ip_prefix.includes(':') ? 'ipv6' : 'ipv4'
      };
    });
}

function parseCloudflareRanges(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  return lines
    .filter(line => line && !line.startsWith('#')) // Skip empty lines and comments
    .map(line => {
      const ip_prefix = line.trim();
      return {
        ip_prefix,
        cloud_provider: 'cloudflare',
        tag: ip_prefix.includes(':') ? 'ipv6' : 'ipv4'
      };
    });
}

function parseFastlyRanges(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);
  
  const ipv4Ranges = data.addresses.map(ip_prefix => ({
    ip_prefix,
    cloud_provider: 'fastly',
    tag: 'ipv4'
  }));
  
  const ipv6Ranges = data.ipv6_addresses.map(ip_prefix => ({
    ip_prefix,
    cloud_provider: 'fastly',
    tag: 'ipv6'
  }));
  
  return [...ipv4Ranges, ...ipv6Ranges];
}

function parseZscalerRanges(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);
  
  return data.hubPrefixes.map(ip_prefix => ({
    ip_prefix,
    cloud_provider: 'zscaler',
    tag: ip_prefix.includes(':') ? 'ipv6' : 'ipv4'
  }));
}

function parseDigitalOceanRanges(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(line => line.trim());
  
  return lines.map(line => {
    const [ip_prefix] = line.split(',');
    return {
      ip_prefix,
      cloud_provider: 'digitalocean',
      tag: ip_prefix.includes(':') ? 'ipv6' : 'ipv4'
    };
  });
}

function parseOracleCloudRanges(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);
  
  return data.regions.flatMap(region => 
    region.cidrs.map(cidr => ({
      ip_prefix: cidr.cidr,
      cloud_provider: 'oracle',
      tag: cidr.tags[0] // Use first tag (usually 'OCI' or 'OSN')
    }))
  );
}

function parseGitHubRanges(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);
  
  // Collect all unique IP ranges from different GitHub services
  const allRanges = new Set([
    ...data.hooks || [],
    ...data.web || [],
    ...data.api || [],
    ...data.git || [],
    ...data.packages || [],
    ...data.pages || [],
    ...data.importer || [],
    ...data.actions || [],
    ...data.dependabot || [],
    ...data.copilot || []
  ]);
  
  return Array.from(allRanges).map(ip_prefix => ({
    ip_prefix,
    cloud_provider: 'github',
    tag: ip_prefix.includes(':') ? 'ipv6' : 'ipv4'
  }));
}

function parseAzureRanges(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);
  
  return data.values.flatMap(service => 
    service.properties.addressPrefixes.map(ip_prefix => ({
      ip_prefix,
      cloud_provider: 'azure',
      tag: service.name // Use the service name as the tag
    }))
  );
}

function parseApplePrivateRelayRanges(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(line => line.trim());
  
  return lines.map(line => {
    const [ip_prefix] = line.split(',');
    return {
      ip_prefix,
      cloud_provider: 'apple_private_relay',
      tag: ip_prefix.includes(':') ? 'ipv6' : 'ipv4'
    };
  });
}

function writeCSV(records, outputPath) {
  // Validate records first
  for (const record of records) {
    if (record.ip_prefix.includes(',') || record.ip_prefix.includes('"') ||
        record.cloud_provider.includes(',') || record.cloud_provider.includes('"') ||
        record.tag.includes(',') || record.tag.includes('"')) {
      throw new Error('Invalid characters (comma or double quote) found in data');
    }
  }

  const header = 'ip_prefix,cloud_provider,tag\n';
  const rows = records.map(record => 
    `${record.ip_prefix},${record.cloud_provider},${record.tag}`
  ).join('\n');
  
  fs.writeFileSync(outputPath, header + rows + '\n');
}

function main() {
  const inputDir = path.join(__dirname, 'ip-ranges');
  const outputPath = path.join(__dirname, 'combined-ip-ranges.csv');
  
  // Parse Apple Private Relay ranges
  const applePrivateRelayRanges = parseApplePrivateRelayRanges(
    path.join(inputDir, 'apple-icloud-private-relay-ip-ranges.csv')
  );
  
  // Parse Azure ranges
  const azureRanges = parseAzureRanges(
    path.join(inputDir, 'microsoft-azure-ip-ranges.json')
  );
  
  // Parse GitHub ranges
  const githubRanges = parseGitHubRanges(
    path.join(inputDir, 'github-ip-ranges.json')
  );
  
  // Parse Oracle Cloud ranges
  const oracleRanges = parseOracleCloudRanges(
    path.join(inputDir, 'oracle-cloud-ip-ranges.json')
  );
  
  // Parse DigitalOcean ranges
  const digitalOceanRanges = parseDigitalOceanRanges(
    path.join(inputDir, 'digitalocean.csv')
  );
  
  // Parse Linode ranges
  const linodeRanges = parseLinodeRanges(
    path.join(inputDir, 'linode.txt')
  );
  
  // Parse Google Cloud ranges
  const googleRanges = parseGoogleCloudRanges(
    path.join(inputDir, 'google-cloud-ip-ranges.json')
  );
  
  // Parse AWS ranges
  const awsRanges = parseAWSRanges(
    path.join(inputDir, 'aws-ip-ranges.json')
  );
  
  // Parse Akamai ranges (both IPv4 and IPv6)
  const akamaiV4Ranges = parseAkamaiRanges(
    path.join(inputDir, 'akamai-v4-ip-ranges.txt')
  );
  const akamaiV6Ranges = parseAkamaiRanges(
    path.join(inputDir, 'akamai-v6-ip-ranges.txt')
  );
  
  // Parse Cloudflare ranges (both IPv4 and IPv6)
  const cloudflareV4Ranges = parseCloudflareRanges(
    path.join(inputDir, 'cloudflare-v4-ip-ranges.txt')
  );
  const cloudflareV6Ranges = parseCloudflareRanges(
    path.join(inputDir, 'cloudflare-v6-ip-ranges.txt')
  );
  
  // Parse Fastly ranges
  const fastlyRanges = parseFastlyRanges(
    path.join(inputDir, 'fastly-ip-ranges.json')
  );
  
  // Parse Zscaler ranges
  const zscalerRanges = parseZscalerRanges(
    path.join(inputDir, 'zscaler-cloud-ip-ranges.json')
  );
  
  // Combine all ranges
  const allRanges = [
    ...applePrivateRelayRanges,
    ...azureRanges,
    ...githubRanges,
    ...oracleRanges,
    ...digitalOceanRanges,
    ...linodeRanges,
    ...googleRanges,
    ...awsRanges,
    ...akamaiV4Ranges,
    ...akamaiV6Ranges,
    ...cloudflareV4Ranges,
    ...cloudflareV6Ranges,
    ...fastlyRanges,
    ...zscalerRanges
  ];
  
  // Write combined CSV
  writeCSV(allRanges, outputPath);
  
  console.log(`Successfully wrote ${allRanges.length} IP ranges to ${outputPath}`);
}

main(); 