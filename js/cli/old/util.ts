import {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    TransactionInstruction,
} from '@solana/web3.js';
import {
    AccountLayout,
    MintLayout,
    Token,
    TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
    LENDING_PROGRAM_ID,
    ReserveConfig,
    ReserveFees,
    WAD_BigInt,
} from '../../src';

export async function newAccountWithLamports(
  connection: Connection,
  lamports: number = 1000000,
): Promise<Keypair> {
  const account = new Keypair();

  let retries = 30;
  // console.log("new account is ", account);
  await connection.requestAirdrop(account.publicKey, lamports);
  for (;;) {
    // console.log('round', retries)
    await sleep(500);
    if (lamports == (await connection.getBalance(account.publicKey))) {
      return account;
    }
    if (--retries <= 0) {
      break;
    }
  }
  throw new Error(`Airdrop of ${lamports} failed`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getCorrectPythOracle(currency: string): [PublicKey, PublicKey] {
    const PYTH_PRODUCT_ETH = new PublicKey('2ciUuGZiee5macAMeQ7bHGTJtwcYTgnt6jdmQnnKZrfu');
    const PYTH_PRICE_ETH = new PublicKey('EdVCmQ9FSPcVe5YySXDPCRmc8aDQLKJ9xvYBMZPie1Vw');

    const PYTH_PRODUCT_SOL = new PublicKey('3Mnn2fX6rQyUsyELYms1sBJyChWofzSNRoqYzvgMVz5E');
    const PYTH_PRICE_SOL = new PublicKey('J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix');

    const PYTH_PRODUCT_USDC = new PublicKey('6NpdXrQEpmDZ3jZKmM2rhdmkd3H6QAk23j2x8bkXcHKA');
    const PYTH_PRICE_USDC = new PublicKey('5SSkXsEKQepHHAewytPVwdej4epN1nxgLVM84L4KXgy7');

    let pythProductAcc, pythPriceAcc;
    switch (currency) {
        case 'eth':
            pythProductAcc = PYTH_PRODUCT_ETH;
            pythPriceAcc = PYTH_PRICE_ETH;
            break;
        case 'sol' :
            pythProductAcc = PYTH_PRODUCT_SOL;
            pythPriceAcc = PYTH_PRICE_SOL;
            break;
        case 'usdc':
            pythProductAcc = PYTH_PRODUCT_USDC;
            pythPriceAcc = PYTH_PRICE_USDC;
            break;
        default:
            throw 'unknown token - choose between eth, sol, and usdc';
    }
    return [pythProductAcc, pythPriceAcc];
}

// export async function createTokenMint(
//     connection: Connection,
//     ownerKp: Keypair,
// ): Promise<Token> {
//     return await Token.createMint(
//         connection,
//         ownerKp,
//         ownerKp.publicKey,
//         null,
//         0,
//         TOKEN_PROGRAM_ID,
//     );
// }

export async function createAndFundUserAccount(
    connection: Connection,
    ownerKp: Keypair,
    tokenMint: Token,
    tokenUserPk: PublicKey,
    mintAmount: number,
): Promise<[Token, PublicKey]> {
    tokenMint = await Token.createMint(
        connection,
        ownerKp,
        ownerKp.publicKey,
        null,
        0,
        TOKEN_PROGRAM_ID,
    );
    tokenUserPk = await tokenMint.createAccount(ownerKp.publicKey);
    await tokenMint.mintTo(tokenUserPk, ownerKp.publicKey, [], mintAmount);

    return [tokenMint, tokenUserPk];
}

export async function generateCreateTokenAccIx(
    connection: Connection,
    ownerKp: Keypair,
    newAccountPubkey: PublicKey,
): Promise<TransactionInstruction> {
    return SystemProgram.createAccount({
        programId: TOKEN_PROGRAM_ID,
        fromPubkey: ownerKp.publicKey,
        newAccountPubkey,
        space: AccountLayout.span,
        lamports: await connection.getMinimumBalanceForRentExemption(AccountLayout.span),
    });
}

export async function generateCreateTokenMintIx(
    connection: Connection,
    ownerKp: Keypair,
    newAccountPubkey: PublicKey,
): Promise<TransactionInstruction> {
    return SystemProgram.createAccount({
        programId: TOKEN_PROGRAM_ID,
        fromPubkey: ownerKp.publicKey,
        newAccountPubkey,
        space: MintLayout.span,
        lamports: await connection.getMinimumBalanceForRentExemption(MintLayout.span),
    });
}

export async function generateCreateStateAccIx(
    connection: Connection,
    ownerKp: Keypair,
    newAccountPubkey: PublicKey,
    space: number,
): Promise<TransactionInstruction> {
    return SystemProgram.createAccount({
        programId: LENDING_PROGRAM_ID,
        fromPubkey: ownerKp.publicKey,
        newAccountPubkey,
        space,
        lamports: await connection.getMinimumBalanceForRentExemption(space),
    });
}

export function generateStandardReserveConfig(): ReserveConfig {
    const reserveFees: ReserveFees = {
        /// Must be between 0 and 10^18 (1e18), such that 10^18 (1e18) = 1.
        // 5% each
        borrowFeeWad: WAD_BigInt / 20n,
        flashLoanFeeWad: WAD_BigInt / 20n,
        hostFeePercentage: 20,
    };

    return {
        //https://blog.alphafinance.io/defi-lending/
        optimalUtilizationRate: 80,
        //crypto lending platforms enforce a 50% LTV ratio, meaning that as a minimum, you'll need to deposit 2X the amount you're borrowing as collateral.
        //https://academy.shrimpy.io/post/guide-to-crypto-loans#:~:text=The%20LTV%20stands%20for%20Loan,you're%20borrowing%20as%20collateral.
        loanToValueRatio: 50,
        //as a %
        liquidationBonus: 3,
        //LTV at which can be liquidated
        //https://www.reddit.com/r/Compound/comments/hu9f1y/where_do_i_find_liquidation_thresholds_similar_to/
        liquidationThreshold: 80,
        minBorrowRate: 2,
        //https://medium.com/aave/aave-borrowing-rates-upgraded-f6c8b27973a7
        optimalBorrowRate: 8,
        maxBorrowRate: 15,
        fees: reserveFees,
    };
}