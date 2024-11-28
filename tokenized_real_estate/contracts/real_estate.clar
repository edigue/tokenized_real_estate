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
