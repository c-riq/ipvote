// AWS lambda funtion to return the IP address of the client

exports.handler = async (event) => {
    const response = {
        statusCode: 200,
        body: JSON.stringify({
            ip: event.requestContext.identity.sourceIp,
        }),
    };
    return response;
}
