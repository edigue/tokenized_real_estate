import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.14.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

Clarinet.test({
    name: "Ensure that property listing works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;

        let block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'list-property',
                [
                    types.uint(1000000), // price
                    types.uint(1000),    // total shares
                    types.ascii('123 Main St, Anytown, USA'), // property address
                    types.ascii('3 bedroom, 2 bath house with modern amenities and large backyard') // property details
                ],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(ok u0)`); // First property has ID 0

        // Check property details
        const propertyDetails = chain.callReadOnlyFn(
            'tokenized-real-estate',
            'get-property-details',
            [types.uint(0)],
            user1.address
        );

        // Verify the returned property object contains expected values
        const propertyJson = propertyDetails.result.expectSome().expectTuple();
        assertEquals(propertyJson['owner'], user1.address);
        assertEquals(propertyJson['price'], types.uint(1000000));
        assertEquals(propertyJson['total-shares'], types.uint(1000));
        assertEquals(propertyJson['available-shares'], types.uint(1000));
        assertEquals(propertyJson['listed'], types.bool(true));

        // Check share balance for the owner
        const shareBalance = chain.callReadOnlyFn(
            'tokenized-real-estate',
            'get-share-balance',
            [types.uint(0), types.principal(user1.address)],
            user1.address
        );

        assertEquals(shareBalance.result, types.uint(1000));
    },
});

Clarinet.test({
    name: "Ensure that buying shares works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!; // property owner
        const user2 = accounts.get('wallet_2')!; // share buyer

        // First, list a property
        let block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'list-property',
                [
                    types.uint(1000000), // price
                    types.uint(1000),    // total shares
                    types.ascii('123 Main St, Anytown, USA'), // property address
                    types.ascii('3 bedroom, 2 bath house with modern amenities and large backyard') // property details
                ],
                user1.address
            )
        ]);

        // Now, buy some shares
        block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'buy-shares',
                [
                    types.uint(0),  // property ID
                    types.uint(200) // buying 200 shares
                ],
                user2.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(ok true)`);

        // Check share balances
        const user2ShareBalance = chain.callReadOnlyFn(
            'tokenized-real-estate',
            'get-share-balance',
            [types.uint(0), types.principal(user2.address)],
            user2.address
        );

        assertEquals(user2ShareBalance.result, types.uint(200));

        // Check updated property details
        const propertyDetails = chain.callReadOnlyFn(
            'tokenized-real-estate',
            'get-property-details',
            [types.uint(0)],
            user1.address
        );

        const propertyJson = propertyDetails.result.expectSome().expectTuple();
        assertEquals(propertyJson['available-shares'], types.uint(800)); // 1000 - 200 = 800
    },
});

Clarinet.test({
    name: "Ensure that property price update works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const user1 = accounts.get('wallet_1')!;

        // First, list a property
        let block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'list-property',
                [
                    types.uint(1000000), // initial price
                    types.uint(1000),    // total shares
                    types.ascii('123 Main St, Anytown, USA'),
                    types.ascii('Property details')
                ],
                user1.address
            )
        ]);

        // Update the property price
        block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'update-property-price',
                [
                    types.uint(0),       // property ID
                    types.uint(1200000)  // new price
                ],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(ok true)`);

        // Check updated property details
        const propertyDetails = chain.callReadOnlyFn(
            'tokenized-real-estate',
            'get-property-details',
            [types.uint(0)],
            user1.address
        );

        const propertyJson = propertyDetails.result.expectSome().expectTuple();
        assertEquals(propertyJson['price'], types.uint(1200000));
    },
});

Clarinet.test({
    name: "Ensure that unauthorized users cannot update property price",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const user1 = accounts.get('wallet_1')!; // property owner
        const user2 = accounts.get('wallet_2')!; // not the owner

        // First, list a property
        let block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'list-property',
                [
                    types.uint(1000000),
                    types.uint(1000),
                    types.ascii('123 Main St, Anytown, USA'),
                    types.ascii('Property details')
                ],
                user1.address
            )
        ]);

        // Try to update price with non-owner
        block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'update-property-price',
                [
                    types.uint(0),      // property ID
                    types.uint(1200000) // new price
                ],
                user2.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(err u105)`); // err-unauthorized
    },
});

Clarinet.test({
    name: "Ensure that rental payment recording works",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const user1 = accounts.get('wallet_1')!;

        // First, list a property
        let block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'list-property',
                [
                    types.uint(1000000),
                    types.uint(1000),
                    types.ascii('123 Main St, Anytown, USA'),
                    types.ascii('Property details')
                ],
                user1.address
            )
        ]);

        // Record rental payment
        block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'record-rental-payment',
                [
                    types.uint(0),    // property ID
                    types.uint(5000)  // rental amount
                ],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(ok true)`);

        // Check updated property details
        const propertyDetails = chain.callReadOnlyFn(
            'tokenized-real-estate',
            'get-property-details',
            [types.uint(0)],
            user1.address
        );

        const propertyJson = propertyDetails.result.expectSome().expectTuple();
        assertEquals(propertyJson['rental-income'], types.uint(5000));
    },
});

Clarinet.test({
    name: "Ensure that maintenance proposal creation works",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const user1 = accounts.get('wallet_1')!;

        // First, list a property
        let block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'list-property',
                [
                    types.uint(1000000),
                    types.uint(1000),
                    types.ascii('123 Main St, Anytown, USA'),
                    types.ascii('Property details')
                ],
                user1.address
            )
        ]);

        // Create maintenance proposal
        block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'create-maintenance-proposal',
                [
                    types.uint(0),  // property ID
                    types.ascii('Roof repair and exterior painting required'),
                    types.uint(25000)  // cost amount
                ],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(ok true)`);

        // Check proposal details
        const proposal = chain.callReadOnlyFn(
            'tokenized-real-estate',
            'get-active-proposal',
            [types.uint(0)],
            user1.address
        );

        const proposalJson = proposal.result.expectSome().expectTuple();
        assertEquals(proposalJson['proposer'], user1.address);
        assertEquals(proposalJson['proposal-type'], types.ascii('MAINTENANCE'));
        assertEquals(proposalJson['amount'], types.uint(25000));
        assertEquals(proposalJson['votes-for'], types.uint(0));
        assertEquals(proposalJson['votes-against'], types.uint(0));
        assertEquals(proposalJson['executed'], types.bool(false));
    },
});

Clarinet.test({
    name: "Ensure that voting on proposals works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const user1 = accounts.get('wallet_1')!;
        const user2 = accounts.get('wallet_2')!;

        // First, list a property
        let block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'list-property',
                [
                    types.uint(1000000),
                    types.uint(1000),
                    types.ascii('123 Main St, Anytown, USA'),
                    types.ascii('Property details')
                ],
                user1.address
            )
        ]);

        // Buy some shares first to be able to vote
        block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'buy-shares',
                [
                    types.uint(0),  // property ID
                    types.uint(200) // buying 200 shares
                ],
                user2.address
            )
        ]);

        // Create maintenance proposal
        block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'create-maintenance-proposal',
                [
                    types.uint(0),
                    types.ascii('Roof repair needed'),
                    types.uint(25000)
                ],
                user1.address
            )
        ]);

        // Vote on the proposal - user1 votes for
        block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'vote-on-proposal',
                [
                    types.uint(0),  // property ID
                    types.bool(true) // vote for
                ],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(ok true)`);

        // User2 votes against
        block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'vote-on-proposal',
                [
                    types.uint(0),  // property ID
                    types.bool(false) // vote against
                ],
                user2.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(ok true)`);

        // Check updated proposal details
        const proposal = chain.callReadOnlyFn(
            'tokenized-real-estate',
            'get-active-proposal',
            [types.uint(0)],
            user1.address
        );

        const proposalJson = proposal.result.expectSome().expectTuple();
        assertEquals(proposalJson['votes-for'], types.uint(800)); // User1 has 800 shares after selling 200
        assertEquals(proposalJson['votes-against'], types.uint(200)); // User2 has 200 shares
    },
});

Clarinet.test({
    name: "Ensure that platform fee update works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;

        // Update platform fee
        let block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'update-platform-fee',
                [types.uint(30)], // 3.0% fee
                deployer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(ok true)`);

        // Verify updated fee
        const platformFee = chain.callReadOnlyFn(
            'tokenized-real-estate',
            'get-platform-fee',
            [],
            deployer.address
        );

        assertEquals(platformFee.result, types.uint(30));

        // Ensure non-admin cannot update fee
        block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'update-platform-fee',
                [types.uint(40)],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(err u100)`); // err-owner-only
    },
});

Clarinet.test({
    name: "Ensure that locking a property works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const user2 = accounts.get('wallet_2')!;

        // First, list a property
        let block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'list-property',
                [
                    types.uint(1000000),
                    types.uint(1000),
                    types.ascii('123 Main St, Anytown, USA'),
                    types.ascii('Property details')
                ],
                user1.address
            )
        ]);

        // Lock the property as admin
        block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'lock-property',
                [types.uint(0)],
                deployer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(ok true)`);

        // Check property status
        const propertyDetails = chain.callReadOnlyFn(
            'tokenized-real-estate',
            'get-property-details',
            [types.uint(0)],
            user1.address
        );

        const propertyJson = propertyDetails.result.expectSome().expectTuple();
        assertEquals(propertyJson['locked'], types.bool(true));

        // Try to buy shares for locked property
        block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'buy-shares',
                [
                    types.uint(0),
                    types.uint(200)
                ],
                user2.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(err u112)`); // err-property-locked
    },
});

Clarinet.test({
    name: "Ensure that share value calculation works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const user1 = accounts.get('wallet_1')!;

        // First, list a property
        let block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'list-property',
                [
                    types.uint(1000000), // price
                    types.uint(1000),    // total shares
                    types.ascii('123 Main St, Anytown, USA'),
                    types.ascii('Property details')
                ],
                user1.address
            )
        ]);

        // Get share value
        const shareValue = chain.callReadOnlyFn(
            'tokenized-real-estate',
            'calculate-share-value',
            [types.uint(0)],
            user1.address
        );

        assertEquals(shareValue.result, `(ok u1000)`); // 1000000 / 1000 = 1000
    },
});

Clarinet.test({
    name: "Ensure that errors are thrown for invalid operations",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const user1 = accounts.get('wallet_1')!;
        const user2 = accounts.get('wallet_2')!;

        // Try to get non-existent property
        const nonExistentProperty = chain.callReadOnlyFn(
            'tokenized-real-estate',
            'get-property-details',
            [types.uint(99)],
            user1.address
        );

        assertEquals(nonExistentProperty.result, `none`);

        // List a property with invalid price (0)
        let block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'list-property',
                [
                    types.uint(0), // invalid price
                    types.uint(1000),
                    types.ascii('123 Main St, Anytown, USA'),
                    types.ascii('Property details')
                ],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(err u106)`); // err-invalid-price

        // Create a valid property
        block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'list-property',
                [
                    types.uint(1000000),
                    types.uint(1000),
                    types.ascii('123 Main St, Anytown, USA'),
                    types.ascii('Property details')
                ],
                user1.address
            )
        ]);

        // Try to vote on non-existent proposal
        block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'vote-on-proposal',
                [
                    types.uint(0),
                    types.bool(true)
                ],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(err u109)`); // err-no-active-proposal
    },
});

Clarinet.test({
    name: "Ensure that distributing rental income works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const user1 = accounts.get('wallet_1')!; // property owner
        const user2 = accounts.get('wallet_2')!; // share buyer

        // First, list a property
        let block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'list-property',
                [
                    types.uint(1000000),
                    types.uint(1000),
                    types.ascii('123 Main St, Anytown, USA'),
                    types.ascii('Property details')
                ],
                user1.address
            )
        ]);

        // Buy some shares
        block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'buy-shares',
                [
                    types.uint(0),
                    types.uint(400)
                ],
                user2.address
            )
        ]);

        // Record rental payment
        block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'record-rental-payment',
                [
                    types.uint(0),
                    types.uint(10000)
                ],
                user1.address
            )
        ]);

        // User2 distributes their portion of rental income
        block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'distribute-rental-income',
                [types.uint(0)],
                user2.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(ok true)`);
    },
});

Clarinet.test({
    name: "Ensure that users cannot vote twice on the same proposal",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const user1 = accounts.get('wallet_1')!;

        // First, list a property
        let block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'list-property',
                [
                    types.uint(1000000),
                    types.uint(1000),
                    types.ascii('123 Main St, Anytown, USA'),
                    types.ascii('Property details')
                ],
                user1.address
            )
        ]);

        // Create maintenance proposal
        block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'create-maintenance-proposal',
                [
                    types.uint(0),
                    types.ascii('Roof repair needed'),
                    types.uint(25000)
                ],
                user1.address
            )
        ]);

        // Vote on the proposal
        block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'vote-on-proposal',
                [
                    types.uint(0),
                    types.bool(true)
                ],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(ok true)`);

        // Try to vote again
        block = chain.mineBlock([
            Tx.contractCall(
                'tokenized-real-estate',
                'vote-on-proposal',
                [
                    types.uint(0),
                    types.bool(false) // change vote direction
                ],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(err u108)`); // err-already-voted
    },
});