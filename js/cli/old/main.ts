import {
    Connection,
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
    SystemProgram,
    Transaction,
} from '@solana/web3.js';
import {
    depositReserveLiquidityInstruction,
    initLendingMarketInstruction,
    initObligationInstruction,
    initReserveInstruction,
    LENDING_MARKET_SIZE,
    LENDING_PROGRAM_ID,
    OBLIGATION_SIZE,
    parseLendingMarket,
    redeemReserveCollateralInstruction,
    refreshObligationInstruction,
    refreshReserveInstruction,
    RESERVE_SIZE,
} from '../../src';
import {
    createAndFundUserAccount,
    generateCreateStateAccIx,
    generateCreateTokenAccIx, generateCreateTokenMintIx,
    generateStandardReserveConfig,
    getCorrectPythOracle,
} from './util';
import { Token } from '@solana/spl-token';

// ============================================================================= globals
let connection;

let blockchain = {
    tokenA: {
        currency: "usdc",
        //mint
        mint: null,
        //accounts
        userPk: null,
        protocolKp: new Keypair(),
        protocolFeeKp: new Keypair(),
        //LP tokens
        lpMintKp: new Keypair(),
        lpUserKp: new Keypair(),
        lpProtocolKp: new Keypair(),
        //pyth
        pythProductAcc: new PublicKey('6NpdXrQEpmDZ3jZKmM2rhdmkd3H6QAk23j2x8bkXcHKA'),
        pythPriceAcc: new PublicKey('5SSkXsEKQepHHAewytPVwdej4epN1nxgLVM84L4KXgy7'),
        //numbers
        mintAmount: 10000,
        initAmount: 1000,
    },
};

let ownerKp: Keypair = Keypair.fromSecretKey(Uint8Array.from([208, 175, 150, 242, 88, 34, 108, 88, 177, 16, 168, 75, 115, 181, 199, 242, 120, 4, 78, 75, 19, 227, 13, 215, 184, 108, 226, 53, 111, 149, 179, 84, 137, 121, 79, 1, 160, 223, 124, 241, 202, 203, 220, 237, 50, 242, 57, 158, 226, 207, 203, 188, 43, 28, 70, 110, 214, 234, 251, 15, 249, 157, 62, 80]));
let lendingMarketKp: Keypair = new Keypair();
let lendingMarketAuthority: PublicKey;
let reserveKp: Keypair = new Keypair();
let obligationKp: Keypair = new Keypair();

// --------------------------------------- usdc (liquidity)
//mint
let tokenAMint: Token; //created client-side
//accounts
let tokenAUserPk: PublicKey; //created client-side
let tokenAProtocolKp: Keypair = new Keypair();
let tokenAProtocolFeeKp: Keypair = new Keypair();
//LP tokens
let tokenALPMintKp: Keypair = new Keypair();
let tokenALPUserKp: Keypair = new Keypair();
let tokenALPProtocolKp: Keypair = new Keypair();

// --------------------------------------- eth (collateral)
//mint
let tokenBMint: Token; //created client-side
//accounts
let tokenBUserPk: PublicKey; //created client-side
let tokenBProtocolKp: Keypair = new Keypair();
let tokenBProtocolFeeKp: Keypair = new Keypair();
//LP tokens
let tokenBLPMintKp: Keypair = new Keypair();
let tokenBLPUserKp: Keypair = new Keypair();
let tokenBLPProtocolKp: Keypair = new Keypair();

// ============================================================================= consts


// ============================================================================= connection

async function getConnection(): Promise<Connection> {
    const url = 'https://api.devnet.solana.com';
    if (connection) return connection;
    connection = new Connection(url, 'recent');
    const version = await connection.getVersion();
    console.log('Connection to cluster established:', url, version);
    return connection;
}

// ============================================================================= init lending market
async function initLendingMarket() {
    console.log('create lending market state account');
    const createLendingMarketAccIx = SystemProgram.createAccount({
        programId: LENDING_PROGRAM_ID, //assigned as the owner
        fromPubkey: ownerKp.publicKey,
        newAccountPubkey: lendingMarketKp.publicKey,
        space: LENDING_MARKET_SIZE,
        lamports: await connection.getMinimumBalanceForRentExemption(LENDING_MARKET_SIZE),
    });

    console.log('init lending market');
    const quoteCurrency = Buffer.alloc(32);
    quoteCurrency.write('USD');

    const initLendingMarketIx = initLendingMarketInstruction(
        ownerKp.publicKey,
        quoteCurrency,
        lendingMarketKp.publicKey,
    );

    let tx = new Transaction();
    tx.add(createLendingMarketAccIx, initLendingMarketIx);
    let sig = await sendAndConfirmTransaction(connection, tx, [ownerKp, lendingMarketKp]);
    console.log(sig);

    // --------------------------------------- parse back
    let lendingAccInfo = await connection.getAccountInfo(lendingMarketKp.publicKey);
    let lendingAccState = parseLendingMarket(lendingMarketKp.publicKey, lendingAccInfo);
    // console.log(lendingAccState)

}

// ============================================================================= init reserve

async function initReserve(token) {
    // --------------------------------------- create necessary accounts
    console.log(`prepare ${token.currency} mint & accounts`);
    //init'ed client-side
    [token.tokenMint, token.tokenUserPk] = await createAndFundUserAccount(connection, ownerKp, token.mint, token.tokenUserPk, token.mintAmount);

    //init'ed program-side
    let createTokenAProtocolAccIx = await generateCreateTokenAccIx(connection, ownerKp, token.tokenProtocolKp.publicKey);
    let createTokenAProtocolFeeAccIx = await generateCreateTokenAccIx(connection, ownerKp, token.tokenProtocolFeeKp.publicKey);
    let createTokenLPMintAccIx = await generateCreateTokenMintIx(connection, ownerKp, token.tokenLPMintKp.publicKey);
    let createTokenLPUserAccIx = await generateCreateTokenAccIx(connection, ownerKp, token.tokenLPUserKp.publicKey);
    let createTokenLPProtocolAccIx = await generateCreateTokenAccIx(connection, ownerKp, token.tokenLPProtocolKp.publicKey);

    let createTx = new Transaction().add(
        createTokenAProtocolAccIx,
        createTokenAProtocolFeeAccIx,
        createTokenLPMintAccIx,
        createTokenLPUserAccIx,
        createTokenLPProtocolAccIx,
    );
    let createSign = await sendAndConfirmTransaction(connection, createTx, [
        ownerKp,
        token.tokenProtocolKp,
        token.tokenProtocolFeeKp,
        token.tokenLPMintKp,
        token.tokenLPUserKp,
        token.tokenLPProtocolKp,
    ]);
    console.log(createSign);

    // --------------------------------------- create & init reserve
    console.log(`create ${token.currency} reserve`);

    const createReserveAccIx = await generateCreateStateAccIx(connection, ownerKp, reserveKp.publicKey, RESERVE_SIZE);
    const reserveConfig = generateStandardReserveConfig();

    //when we FIND the pda, we only pass OUR seed, not the bump seed
    let nonce;
    [lendingMarketAuthority, nonce] = await PublicKey.findProgramAddress(
        [lendingMarketKp.publicKey.toBuffer()],
        LENDING_PROGRAM_ID,
    );

    const initReserveIx = initReserveInstruction(
        token.initAmount,
        reserveConfig,
        token.tokenUserPk,
        token.tokenLPUserKp.publicKey,
        reserveKp.publicKey,
        token.mint.publicKey,
        token.tokenProtocolKp.publicKey,
        token.tokenProtocolFeeKp.publicKey,
        token.pythProductAcc,
        token.pythPriceAcc,
        token.tokenLPMintKp.publicKey,
        token.tokenLPProtocolKp.publicKey,
        lendingMarketKp.publicKey,
        lendingMarketAuthority,
        ownerKp.publicKey,
        ownerKp.publicKey,
    );

    let tx = new Transaction().add(
        createReserveAccIx,
        initReserveIx);
    let sign = await sendAndConfirmTransaction(connection, tx, [
        ownerKp,
        reserveKp,
    ]);
    console.log(sign);
}

// ============================================================================= refresh reserve

async function refreshReserve(currency: string) {
    console.log('refresh reserve');
    let [pythProductAcc, pythPriceAcc] = getCorrectPythOracle(currency);
    const refreshReserveIx = refreshReserveInstruction(reserveKp.publicKey, pythPriceAcc);
    const tx = new Transaction().add(refreshReserveIx);
    const sign = await sendAndConfirmTransaction(connection, tx, [ownerKp]);
    console.log(sign);
}

// ============================================================================= reposit reserve liquidity

async function depositReserveLiquidity(currency: string) {
    //todo currently only token A

    console.log('deposit liquidity into reserve');
    let [pythProductAcc, pythPriceAcc] = getCorrectPythOracle(currency);
    const refreshReserveIx = refreshReserveInstruction(reserveKp.publicKey, pythPriceAcc);

    const depositReserveLiqIx = depositReserveLiquidityInstruction(
        550,
        tokenAUserPk,
        tokenALPUserKp.publicKey,
        reserveKp.publicKey,
        tokenAProtocolKp.publicKey,
        tokenALPMintKp.publicKey,
        lendingMarketKp.publicKey,
        lendingMarketAuthority,
        ownerKp.publicKey,
    );
    const tx = new Transaction().add(refreshReserveIx, depositReserveLiqIx);
    const sign = await sendAndConfirmTransaction(connection, tx, [ownerKp]);
    console.log(sign);
}

// ============================================================================= withdraw reserve liquidity

async function redeemReserveCollateral(currency) {
    //todo currently only token A

    console.log('redeem collateral from reserve');
    let [pythProductAcc, pythPriceAcc] = getCorrectPythOracle(currency);
    const refreshReserveIx = refreshReserveInstruction(reserveKp.publicKey, pythPriceAcc);

    const redeemReserveColIx = redeemReserveCollateralInstruction(
        150,
        tokenALPUserKp.publicKey,
        tokenAUserPk,
        reserveKp.publicKey,
        tokenALPMintKp.publicKey,
        tokenAProtocolKp.publicKey,
        lendingMarketKp.publicKey,
        lendingMarketAuthority,
        ownerKp.publicKey,
    );
    const tx = new Transaction().add(refreshReserveIx, redeemReserveColIx);
    const sign = await sendAndConfirmTransaction(connection, tx, [ownerKp]);
    console.log(sign);
}

// ============================================================================= init obligation

async function initObligation() {
    console.log('init obligation');

    let createObligAccIx = SystemProgram.createAccount({
        programId: LENDING_PROGRAM_ID,
        fromPubkey: ownerKp.publicKey,
        newAccountPubkey: obligationKp.publicKey,
        space: OBLIGATION_SIZE,
        lamports: await connection.getMinimumBalanceForRentExemption(OBLIGATION_SIZE),
    });

    const initObligIx = initObligationInstruction(
        obligationKp.publicKey,
        lendingMarketKp.publicKey,
        ownerKp.publicKey,
    );

    const tx = new Transaction().add(createObligAccIx, initObligIx);
    const sign = await sendAndConfirmTransaction(connection, tx, [ownerKp, obligationKp]);
    console.log(sign);
}

// ============================================================================= refresh obligation

async function refreshObligation() {
    console.log('refresh obligation');

    const refreshObligIx = refreshObligationInstruction(
        obligationKp.publicKey,
        [],
        [],
    );
    const tx = new Transaction().add(refreshObligIx);
    const sign = await sendAndConfirmTransaction(connection, tx, [ownerKp]);
    console.log(sign);
}

// ============================================================================= deposit oblig collateral

// async function depositObligationCollateral() {
//
//
//
//     console.log('deposit obligation collateral');
//     let depositObligColIx = depositObligationCollateralInstruction(
//         1, //1 eth
//         tokenBUserPk,
//         tokenBProtocolPk,
//     );
// }

// ============================================================================= play

async function main() {
    await getConnection();
    await initLendingMarket();

    console.log(blockchain.tokenA.mint)

    await initReserve(blockchain.tokenA);
    // await printInterestingStats();

    console.log(blockchain.tokenA.mint)
    let tokenAUserBalance = await connection.getTokenAccountBalance(blockchain.tokenA.userPk);
    console.log('user A token balance:', tokenAUserBalance.value.uiAmount);

    // await depositReserveLiquidity('usdc');
    // await printInterestingStats();
    //
    // await redeemReserveCollateral('usdc');
    // await printInterestingStats();
    //
    // await initObligation();
    // await refreshObligation();
}

main();

// ============================================================================= helpers

async function printInterestingStats() {
    console.log('// ---------------------------------------');
    // --------------------------------------- liquidity reserve
    // let reserveAccInfo = await connection.getAccountInfo(reserveKp.publicKey);
    // let reserveAccState = parseReserve(reserveKp.publicKey, reserveAccInfo);
    // console.log("reserve liquidity:", reserveAccState.data.liquidity.availableAmount.valueOf());

    // --------------------------------------- A tokens
    let tokenAUserBalance = await connection.getTokenAccountBalance(tokenAUserPk);
    let tokenAProtocolBalance = await connection.getTokenAccountBalance(tokenAProtocolKp.publicKey);
    let tokenAProtocolFeeBalance = await connection.getTokenAccountBalance(tokenAProtocolFeeKp.publicKey);
    console.log('user A token balance:', tokenAUserBalance.value.uiAmount);
    console.log('protocol A token balance:', tokenAProtocolBalance.value.uiAmount);
    console.log('protocol fee account A token balance:', tokenAProtocolFeeBalance.value.uiAmount);

    // --------------------------------------- LP tokens
    let tokenLPUserBalance = await connection.getTokenAccountBalance(tokenALPUserKp.publicKey);
    let tokenLPProtocolBalance = await connection.getTokenAccountBalance(tokenALPProtocolKp.publicKey);
    console.log('user LP token balance:', tokenLPUserBalance.value.uiAmount);
    console.log('protocol LP token balance:', tokenLPProtocolBalance.value.uiAmount);
    console.log('// ---------------------------------------');
}

