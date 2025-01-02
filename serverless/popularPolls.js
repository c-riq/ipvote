// aws lambda function to get the most popular polls using athena

const { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } = require('@aws-sdk/client-athena');

const athenaClient = new AthenaClient({ region: 'us-east-1' });

const query = `
select 
    partition_0 as poll,
    sum(1) n
    from (
        select * from ipvotes
    )
group by 1
order by n desc
`;

const getPopularPolls = async () => {
    const result = await athenaClient.send(new StartQueryExecutionCommand({
        QueryString: query,
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
        if (queryStatus === 'FAILED') throw new Error('Query failed');
        if (queryStatus === 'CANCELLED') throw new Error('Query cancelled');
        await new Promise(resolve => setTimeout(resolve, 200)); 
    }
};

module.exports.handler = async (event) => {
    const startResult = await getPopularPolls();
    const queryExecutionId = startResult.QueryExecutionId;
    
    await waitForQueryToComplete(queryExecutionId);
    
    const queryResults = await athenaClient.send(new GetQueryResultsCommand({
        QueryExecutionId: queryExecutionId
    }));

    
    const rows = queryResults.ResultSet?.Rows || [];
    const columns = rows[0].Data?.map(cell => cell.VarCharValue);
    const data = []
    for (const row of rows.slice(1)) {
        const rowData = row.Data?.map(cell => cell.VarCharValue);
        data.push([rowData?.[0], parseInt(rowData?.[1] || "0")])
    }

    return {
        statusCode: 200,
        body: JSON.stringify({columns, data})
    };
};

