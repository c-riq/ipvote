/**
 * Parses CSV data into an array of objects where each object maps headers to cell values
 * @param csvData Raw CSV data as a string or array of lines
 * @returns Array of objects mapping headers to cell values
 */
export function parseCSV(csvData: string | string[]): Array<{ [key: string]: string }> {
  // Split into lines if string input
  const lines = typeof csvData === 'string' ? csvData.split('\n') : csvData;
  
  // Remove empty lines
  const nonEmptyLines = lines.filter(line => line.trim());
  if (nonEmptyLines.length === 0) return [];

  // Parse header row
  const headers = nonEmptyLines[0].split(',').map(header => header.trim());
  
  // Parse data rows
  return nonEmptyLines.slice(1).map(line => {
    const values = line.split(',').map(cell => cell.trim());
    return headers.reduce((obj, header, index) => {
      obj[header] = values[index] || '';
      return obj;
    }, {} as { [key: string]: string });
  });
}

/**
 * Type guard to check if required fields are present in a CSV row
 * @param row Parsed CSV row object
 * @param requiredFields Array of required field names
 * @returns Boolean indicating if all required fields are present
 */
export function hasRequiredFields(
  row: { [key: string]: string }, 
  requiredFields: string[]
): boolean {
  return requiredFields.every(field => 
    Object.prototype.hasOwnProperty.call(row, field) && 
    row[field] !== undefined && 
    row[field] !== ''
  );
}

/**
 * Example usage:
 * const csvData = `time,masked_ip,poll,vote,country,nonce,country_geoip,asn_name_geoip,is_tor,is_vpn,is_cloud_provider
 * 1730623803558,12.158.241.XXX,harris_or_trump,trump,,,TW,HostingInside LTD.,0,1,`;
 * 
 * const parsedData = parseCSV(csvData);
 * const validRows = parsedData.filter(row => 
 *   hasRequiredFields(row, ['masked_ip', 'vote'])
 * );
 */ 