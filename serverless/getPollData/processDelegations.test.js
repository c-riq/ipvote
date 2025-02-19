const { processDelegations } = require('./processDelegations');

describe('processDelegations', () => {
    const standardHeader = 'timestamp,poll,option,comment,lang,nonce,country,asn_name,field1,field2,field3,ip,voter_id';
    const realExampleHeader = 'timestamp,masked_ip,poll,vote,country,asn_name,field1,field2,field3,field4,field5,field6,field7,phone,voter_id,field8,field9';

    test('should correctly count delegated votes and verified phone delegations', () => {
        // Arrange
        const rows = [
            `1709347300000,poll123,option2,comment,en,1,0,0,0,0,0,127.0.0.1,user3`,
            `1709347200000,poll123,option1,comment,en,1,0,0,0,0,0,127.0.0.1,user5`,
        ];

        const delegationGraph = {
            'user1': {
                delegations: {
                    all: { target: 'user2' }
                },
                phoneNumber: "+441"
            },
            'user2': {
                delegations: {
                    all: { target: 'user3' }
                },
                phoneNumber: "+442"
            },
            'user4': {
                delegations: {
                    all: { target: 'user3' }
                },
                phoneNumber: "+443"
            },
            'user5': {
                delegations: {
                    all: { target: 'user3' }
                },
                phoneNumber: "+443" // same as user 4
            },
            'user6': { // voted
                delegations: {
                    all: { target: 'user3' }
                },
                phoneNumber: "+444"
            }
        };

        // Act
        const result = processDelegations(rows, delegationGraph, standardHeader);

        // Assert
        const processedRows = result.map(row => row.split(','));
        
        // (3 total, 3 unique phone numbers)
        const [total, unique_phone_numbers] = processedRows[0].slice(-2)
        expect(total).toEqual('4');
        expect(unique_phone_numbers).toEqual('3')
        
        expect(processedRows[1].slice(-2)).toEqual(['0', '0']);
    });

    test('should correctly consider', () => {
        // Arrange
        const rows = [
            `1709347300000,poll123,option2,comment,en,1,0,0,0,0,0,127.0.0.1,user2`,
        ];

        const delegationGraph = {
            'user1': {
                delegations: {
                    all: { target: 'user2' }
                },
                phoneNumber: "+441"
            },
            'user2': {
                delegations: {
                    all: { target: 'user3' }
                },
                phoneNumber: "+442"
            }
        };

        // Act
        const result = processDelegations(rows, delegationGraph, standardHeader);

        // Assert
        const processedRows = result.map(row => row.split(','));
        const [total, unique_phone_numbers] = processedRows[0].slice(-2)
        expect(total).toEqual('1');
        expect(unique_phone_numbers).toEqual('1')
    });

    test('should handle circular delegations', () => {
        // Arrange
        const rows = [
            `1709347300000,poll123,option2,comment,en,1,0,0,0,0,0,127.0.0.1,user3`,
        ];

        const delegationGraph = {
            'user1': {
                delegations: {
                    all: { target: 'user2' }
                },
                phoneNumber: "+441"
            },
            'user2': {
                delegations: {
                    all: { target: 'user3' }
                },
                phoneNumber: "+442"
            },
            'user3': {
                delegations: {
                    all: { target: 'user2' }
                },
                phoneNumber: "+443"
            }
        };

        // Act
        const result = processDelegations(rows, delegationGraph, standardHeader);

        // Assert
        const processedRows = result.map(row => row.split(','));
        const [total, unique_phone_numbers] = processedRows[0].slice(-2);
        expect(total).toEqual('2');
        expect(unique_phone_numbers).toEqual('2');
    });

    test('should handle empty delegation graph', () => {
        // Arrange
        const rows = [
            `1709347300000,poll123,option2,comment,en,1,0,0,0,0,0,127.0.0.1,user1`,
        ];

        const delegationGraph = {};

        // Act
        const result = processDelegations(rows, delegationGraph, standardHeader);

        // Assert
        const processedRows = result.map(row => row.split(','));
        const [total, unique_phone_numbers] = processedRows[0].slice(-2);
        expect(total).toEqual('0');
        expect(unique_phone_numbers).toEqual('0');
    });

    test('should handle multiple votes from different users', () => {
        // Arrange
        const rows = [
            `1709347300000,poll123,option2,comment,en,1,0,0,0,0,0,127.0.0.1,user1`,
            `1709347301000,poll123,option1,comment,en,1,0,0,0,0,0,127.0.0.1,user3`,
        ];

        const delegationGraph = {
            'user2': {
                delegations: {
                    all: { target: 'user1' }
                },
                phoneNumber: "+441"
            },
            'user4': {
                delegations: {
                    all: { target: 'user3' }
                },
                phoneNumber: "+442"
            },
            'user5': {
                delegations: {
                    all: { target: 'user3' }
                },
                phoneNumber: "+442" // Duplicate phone number with user4
            }
        };

        // Act
        const result = processDelegations(rows, delegationGraph, standardHeader);

        // Assert
        const processedRows = result.map(row => row.split(','));
        
        const [total1, unique_phone_numbers1] = processedRows[0].slice(-2);
        expect(total1).toEqual('1');
        expect(unique_phone_numbers1).toEqual('1');

        const [total2, unique_phone_numbers2] = processedRows[1].slice(-2);
        expect(total2).toEqual('2');
        expect(unique_phone_numbers2).toEqual('0');
    });

    test('should handle missing or invalid delegation data', () => {
        // Arrange
        const rows = [
            `1709347300000,poll123,option2,comment,en,1,0,0,0,0,0,127.0.0.1,user1`,
        ];

        const delegationGraph = {
            'user2': {
                // Missing delegations field
                phoneNumber: "+441"
            },
            'user3': {
                delegations: null,
                phoneNumber: "+442"
            },
            'user4': {
                delegations: {
                    // Missing 'all' field
                },
                phoneNumber: "+443"
            },
            'user5': {
                delegations: {
                    all: {} // Missing target
                },
                phoneNumber: "+444"
            }
        };

        // Act
        const result = processDelegations(rows, delegationGraph, standardHeader);

        // Assert
        const processedRows = result.map(row => row.split(','));
        const [total, unique_phone_numbers] = processedRows[0].slice(-2);
        expect(total).toEqual('0');
        expect(unique_phone_numbers).toEqual('0');
    });
    
    test('real example', () => {
        const rows = ["2025-02-19T13:13:35.565Z,X.XXX,a_or_t,t,NL,_,0,0,,,,,0,+4915234XXXXXX,4e47d8456fd684e27a78d2d513e037fc,0,0"]
        const delegationGraph = {
            "b4b681c44f0de6a93eb768bb73ab50e2": {
                "delegations": {
                    "all": {
                        "target": "4e47d8456fd684e27a78d2d513e037fc",
                        "targetPhone": "+4915234037009"
                    }
                },
                "phoneNumber": "+447445686051"
            }
        }

        const result = processDelegations(rows, delegationGraph, realExampleHeader);

        // Assert
        const processedRows = result.map(row => row.split(','));
        const [total, unique_phone_numbers] = processedRows[0].slice(-2);
        expect(total).toEqual('1');
        expect(unique_phone_numbers).toEqual('1');
    });
}); 

