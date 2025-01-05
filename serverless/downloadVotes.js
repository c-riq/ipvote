const { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } = require('@aws-sdk/client-athena');

const athenaClient = new AthenaClient({ region: 'us-east-1' });

const escapeSql = (str) => {
    if (typeof str !== 'string') return '';
    return str.replace(/[^a-zA-Z0-9_]/g, '');
};

const query = (poll) => {
    const query = `
select
    poll_ as poll,
    time,
    vote,
    IF (
        ip LIKE '%.%',
        CONCAT (
            SPLIT_PART (ip, '.', 1),
            '.',
            SPLIT_PART (ip, '.', 2),
            '.',
            SPLIT_PART (ip, '.', 3),
            '.',
            'XXX'
        ),
        CONCAT (
            SPLIT_PART (ip, ':', 1),
            ':',
            SPLIT_PART (ip, ':', 2),
            ':',
            SUBSTRING(LPAD (SPLIT_PART (ip, ':', 3), 4, '0'), 1, 2) || 'XX:',
            'XXXX:',
            'XXXX:',
            'XXXX'
        )
    ) AS masked_ip
from
    aggregated_votes
where
    poll_ = '${escapeSql(poll)}'
order by
    time asc
`;
    console.log(query);
    return query;
};

const getVotesData = async (poll) => {
    const result = await athenaClient.send(new StartQueryExecutionCommand({
        QueryString: query(poll),
        QueryExecutionContext: {
            Database: 'ipvotes'
        },
        ResultConfiguration: {
            OutputLocation: 's3://athenarix/'
        }
    }));
    return result;
};

const waitForQueryToComplete = async (queryExecutionId) => {
    let queryStatus = 'RUNNING';
    while (queryStatus === 'RUNNING' || queryStatus === 'QUEUED') {
        const result = await athenaClient.send(new GetQueryExecutionCommand({
            QueryExecutionId: queryExecutionId
        }));
        if (!result.QueryExecution?.Status?.State) {
            throw new Error('Invalid query execution response');
        }
        queryStatus = result.QueryExecution.Status.State;
        if (queryStatus === 'FAILED') throw new Error(`Query failed: ${result.QueryExecution.Status.AthenaError?.ErrorMessage}`);
        if (queryStatus === 'CANCELLED') throw new Error('Query cancelled');
        await new Promise(resolve => setTimeout(resolve, 200)); 
    }
};

module.exports.handler = async (event) => {
    const poll = event?.queryStringParameters?.poll;
    if (!poll) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Missing poll parameter',
                time: new Date()
            }),
        };
    }

    const startResult = await getVotesData(poll);
    const queryExecutionId = startResult.QueryExecutionId;
    
    await waitForQueryToComplete(queryExecutionId);
    
    const queryResults = await athenaClient.send(new GetQueryResultsCommand({
        QueryExecutionId: queryExecutionId
    }));

    const rows = queryResults.ResultSet?.Rows || [];
    let csvContent = '';
    
    // Convert all rows (including header) to CSV
    for (const row of rows) {
        const values = row.Data?.map(cell => {
            const value = cell.VarCharValue || '';
            // Escape quotes and wrap in quotes if contains comma or newline
            return value.includes(',') || value.includes('\n') || value.includes('"') 
                ? `"${value.replace(/"/g, '""')}"` 
                : value;
        });
        csvContent += (values || []).join(',') + '\n';
    }

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/csv'
        },
        body: csvContent
    };
};

