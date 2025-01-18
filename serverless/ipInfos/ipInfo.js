const { getIPInfo } = require('./ipCountryLookup');

exports.handler = async (event) => {
    // Extract IP from various possible sources
    const ip = event.requestContext?.identity?.sourceIp ||       // REST API Gateway
               event.requestContext?.http?.sourceIp ||           // HTTP API Gateway
               event.headers?.['x-forwarded-for']?.split(',')[0].trim() || // ALB
               '';

    if (!ip) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: 'Could not determine IP address',
                timestamp: new Date().toISOString()
            })
        };
    }

    // Get all IP information
    const geoInfo = getIPInfo(ip);

    // Return response with either full info or empty geo data
    return {
        statusCode: 200,
        body: JSON.stringify({
            ip: ip,
            geo: geoInfo || {
                country: null,
                country_name: null,
                continent: null,
                continent_name: null,
                asn: null,
                as_name: null,
                as_domain: null,
                attribution: '<p>IP address data powered by <a href="https://ipinfo.io">IPinfo</a></p>'
            },
            timestamp: new Date().toISOString()
        })
    };
}; 