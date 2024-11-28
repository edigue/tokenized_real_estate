;; Title: Tokenized Real Estate Platform
;; Description: A comprehensive smart contract for tokenizing real estate assets

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-not-found (err u101))
(define-constant err-already-listed (err u102))
(define-constant err-not-listed (err u103))
(define-constant err-insufficient-funds (err u104))
(define-constant err-unauthorized (err u105))
(define-constant err-invalid-price (err u106))
(define-constant err-invalid-percentage (err u107))
(define-constant err-already-voted (err u108))
(define-constant err-no-active-proposal (err u109))
(define-constant err-proposal-expired (err u110))
(define-constant err-minimum-shares (err u111))
(define-constant err-property-locked (err u112))

;; Data Variables
(define-data-var platform-fee uint u25) ;; 2.5% fee
(define-data-var total-properties uint u0)
(define-data-var minimum-shares-for-proposal uint u100) ;; Minimum shares to create proposal
(define-data-var proposal-duration uint u1440) ;; Blocks (approximately 10 days)

;; Data Maps
(define-map properties
    uint 
    {
        owner: principal,
        price: uint,
        total-shares: uint,
        available-shares: uint,
        property-address: (string-ascii 100),
        property-details: (string-ascii 500),
        verified: bool,
        listed: bool,
        locked: bool,
        rental-income: uint,
        last-maintenance: uint,
        creation-height: uint
    }
)

(define-map share-holdings
    {property-id: uint, holder: principal}
    uint
)

(define-map property-proposals
    uint
    {
        proposer: principal,
        proposal-type: (string-ascii 20),
        details: (string-ascii 500),
        amount: uint,
        votes-for: uint,
        votes-against: uint,
        end-height: uint,
        executed: bool
    }
)

(define-map votes
    {property-id: uint, voter: principal}
    bool
)

(define-map property-maintenance
    uint
    {
        last-service-date: uint,
        total-spent: uint,
        service-history: (list 10 (string-ascii 100))
    }
)

(define-map rental-payments
    {property-id: uint, month: uint}
    uint
)


;; Read only functions

(define-read-only (get-property-details (property-id uint))
    (map-get? properties property-id)
)

(define-read-only (get-share-balance (property-id uint) (holder principal))
    (default-to u0
        (map-get? share-holdings {property-id: property-id, holder: holder})
    )
)

(define-read-only (get-platform-fee)
    (var-get platform-fee)
)

(define-read-only (get-active-proposal (property-id uint))
    (map-get? property-proposals property-id)
)

(define-read-only (get-maintenance-history (property-id uint))
    (map-get? property-maintenance property-id)
)

(define-read-only (calculate-share-value (property-id uint))
    (let
        (
            (property (unwrap! (map-get? properties property-id) err-not-found))
            (total-rental-income (get rental-income property))
            (maintenance-costs (get total-spent (default-to 
                {last-service-date: u0, total-spent: u0, service-history: (list)}
                (map-get? property-maintenance property-id))))
        )
        (ok (/ (- (get price property) maintenance-costs) (get total-shares property)))
    )
)

;; Public Functions

(define-public (list-property 
        (price uint)
        (total-shares uint)
        (property-address (string-ascii 100))
        (property-details (string-ascii 500)))
    (let
        (
            (property-id (var-get total-properties))
            (block-height block-height)
        )
        (asserts! (> price u0) err-invalid-price)
        (asserts! (> total-shares u0) err-invalid-price)
        
        ;; Check if map-insert was successful
        (asserts! (map-insert properties property-id
            {
                owner: tx-sender,
                price: price,
                total-shares: total-shares,
                available-shares: total-shares,
                property-address: property-address,
                property-details: property-details,
                verified: false,
                listed: true,
                locked: false,
                rental-income: u0,
                last-maintenance: block-height,
                creation-height: block-height
            }) err-already-listed)
        
        ;; Update total properties counter
        (var-set total-properties (+ property-id u1))
        
        ;; Set initial share holdings
        (map-set share-holdings 
            {property-id: property-id, holder: tx-sender}
            total-shares)
        
        (ok property-id)
    )
)

(define-public (record-rental-payment (property-id uint) (amount uint))
    (let
        (
            (property (unwrap! (map-get? properties property-id) err-not-found))
            (current-month (/ block-height u144)) ;; Approximate monthly blocks
        )
        ;; Check authorization
        (asserts! (is-eq tx-sender (get owner property)) err-unauthorized)
        
        ;; Record the rental payment for current month
        (map-set rental-payments 
            {property-id: property-id, month: current-month}
            amount)
        
        ;; Update total rental income in property details
        (map-set properties property-id
            (merge property {rental-income: (+ (get rental-income property) amount)}))
        
        (ok true)
    )
)

(define-public (distribute-rental-income (property-id uint))
    (let
        (
            (property (unwrap! (map-get? properties property-id) err-not-found))
            (total-income (get rental-income property))
            (total-shares (get total-shares property))
            (holder-shares (get-share-balance property-id tx-sender))
            (holder-share (/ (* total-income holder-shares) total-shares))
        )
        (asserts! (> holder-shares u0) err-unauthorized)
        (try! (stx-transfer? holder-share contract-owner tx-sender))
        (ok true)
    )
)

(define-public (create-maintenance-proposal 
        (property-id uint)
        (details (string-ascii 500))
        (amount uint))
    (let
        (
            (property (unwrap! (map-get? properties property-id) err-not-found))
            (proposer-shares (get-share-balance property-id tx-sender))
        )
        ;; Check if proposer has minimum required shares
        (asserts! (>= proposer-shares (var-get minimum-shares-for-proposal)) err-minimum-shares)
        
        ;; Check if property is not locked
        (asserts! (not (get locked property)) err-property-locked)
        
        ;; Create the proposal
        (map-set property-proposals property-id
            {
                proposer: tx-sender,
                proposal-type: "MAINTENANCE",
                details: details,
                amount: amount,
                votes-for: u0,
                votes-against: u0,
                end-height: (+ block-height (var-get proposal-duration)),
                executed: false
            })
        
        (ok true)
    )
)

(define-public (vote-on-proposal (property-id uint) (vote-for bool))
    (let
        (
            (proposal (unwrap! (map-get? property-proposals property-id) err-no-active-proposal))
            (voter-shares (get-share-balance property-id tx-sender))
        )
        (asserts! (< block-height (get end-height proposal)) err-proposal-expired)
        (asserts! (not (default-to false (map-get? votes {property-id: property-id, voter: tx-sender}))) err-already-voted)
        
        ;; Record the vote
        (map-set votes {property-id: property-id, voter: tx-sender} true)
        
        ;; Update vote counts based on share weight
        (if vote-for
            (map-set property-proposals property-id
                (merge proposal {votes-for: (+ (get votes-for proposal) voter-shares)}))
            (map-set property-proposals property-id
                (merge proposal {votes-against: (+ (get votes-against proposal) voter-shares)}))
        )
        (ok true)
    )
)

(define-public (update-property-price (property-id uint) (new-price uint))
    (let
        (
            (property (unwrap! (map-get? properties property-id) err-not-found))
        )
        (asserts! (is-eq tx-sender (get owner property)) err-unauthorized)
        (asserts! (> new-price u0) err-invalid-price)
        
        (map-set properties property-id
            (merge property {price: new-price}))
        
        (ok true)
    )
)


(define-public (buy-shares (property-id uint) (share-amount uint))
    (let
        (
            (property (unwrap! (map-get? properties property-id) err-not-found))
            (price-per-share (/ (get price property) (get total-shares property)))
            (total-cost (* price-per-share share-amount))
            (fee (/ (* total-cost (var-get platform-fee)) u1000))
            (seller-amount (- total-cost fee))
            (buyer-current-shares (get-share-balance property-id tx-sender))
        )
        (asserts! (get listed property) err-not-listed)
        (asserts! (>= (get available-shares property) share-amount) err-insufficient-funds)
        (asserts! (not (get locked property)) err-property-locked)
        
        ;; Transfer STX payment
        (try! (stx-transfer? total-cost tx-sender (get owner property)))
        (try! (stx-transfer? fee tx-sender contract-owner))
        
        ;; Update share balances
        (map-set share-holdings 
            {property-id: property-id, holder: tx-sender}
            (+ buyer-current-shares share-amount))
        
        ;; Update available shares
        (map-set properties property-id
            (merge property 
                {available-shares: (- (get available-shares property) share-amount)}))
        
        (ok true)
    )
)

;; Admin Functions

(define-public (update-platform-fee (new-fee uint))
    (begin
        (asserts! (is-eq tx-sender contract-owner) err-owner-only)
        (asserts! (<= new-fee u100) err-invalid-price)
        (var-set platform-fee new-fee)
        (ok true)
    )
)

(define-public (update-minimum-shares (new-minimum uint))
    (begin
        (asserts! (is-eq tx-sender contract-owner) err-owner-only)
        (var-set minimum-shares-for-proposal new-minimum)
        (ok true)
    )
)

(define-public (lock-property (property-id uint))
    (let 
        (
            (property (unwrap! (map-get? properties property-id) err-not-found))
        )
        (asserts! (is-eq tx-sender contract-owner) err-owner-only)
        (map-set properties property-id 
            (merge property {locked: true}))  ;; Remove try! here
        (ok true)  ;; This is already a response type
    )
)
