/**
 * Process vote delegations for a set of votes
 * @param {string[]} rows Array of CSV rows (excluding header)
 * @param {Object} delegationGraph Delegation graph data
 * @param {string} header CSV header row
 * @returns {string[]} Updated rows with delegation counts
 */
function processDelegations(rows, delegationGraph, header) {
    // Parse header to find column indices
    const headers = header.split(',');
    const voterIdIndex = headers.findIndex(h => h === 'voter_id');
    
    if (voterIdIndex === -1) {
        throw new Error('Required column "voter_id" not found in CSV header');
    }

    // Track who has already voted to prevent counting their delegations
    const hasVoted = new Set(rows.map(row => row.split(',')[voterIdIndex]));

    // Build delegation tree for account IDs
    const delegationTree = {};
    for (const [userId, data] of Object.entries(delegationGraph)) {
        if (data.delegations?.all?.target) {
            if (!delegationTree[data.delegations.all.target]) {
                delegationTree[data.delegations.all.target] = new Set();
            }
            delegationTree[data.delegations.all.target].add(userId);
        }
    }

    // Build phone number mapping (only for unique phone numbers)
    const phoneToUsers = new Map();
    for (const [userId, data] of Object.entries(delegationGraph)) {
        if (data.phoneNumber) {
            if (!phoneToUsers.has(data.phoneNumber)) {
                phoneToUsers.set(data.phoneNumber, new Set());
            }
            phoneToUsers.get(data.phoneNumber).add(userId);
        }
    }

    // Filter out duplicate phone numbers
    const validPhoneNumbers = new Map();
    for (const [phone, users] of phoneToUsers.entries()) {
        if (users.size === 1) {
            validPhoneNumbers.set([...users][0], phone);
        }
    }

    // Process each row and count delegations
    return rows.map(row => {
        const columns = row.split(',');
        const voterId = columns[voterIdIndex];
        
        // Count delegations
        const delegators = new Set();
        const delegatorsWithVerifiedPhone = new Set();
        
        // Helper function to recursively collect delegators
        const collectDelegators = (userId, visited = new Set()) => {
            if (visited.has(userId)) return; // Prevent circular delegations
            visited.add(userId);

            if (delegationTree[userId]) {
                for (const delegator of delegationTree[userId]) {
                    if (!hasVoted.has(delegator)) {
                        delegators.add(delegator);
                        // Check if delegator has a unique phone number
                        const delegatorPhone = delegationGraph[delegator]?.phoneNumber;
                        if (delegatorPhone && phoneToUsers.get(delegatorPhone).size === 1) {
                            delegatorsWithVerifiedPhone.add(delegator);
                        }
                        // Recursively check for further delegations
                        collectDelegators(delegator, visited);
                    }
                }
            }
        };

        collectDelegators(voterId);

        // Append delegation counts to the row
        return `${row},${delegators.size},${delegatorsWithVerifiedPhone.size}`;
    });
}

module.exports = { processDelegations }; 