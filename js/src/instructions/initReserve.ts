import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
    PublicKey,
    SYSVAR_CLOCK_PUBKEY,
    SYSVAR_RENT_PUBKEY,
    TransactionInstruction,
} from '@solana/web3.js';
import { struct, u8 } from 'buffer-layout';
import { LENDING_PROGRAM_ID } from '../constants';
import { ReserveConfig, ReserveConfigLayout } from '../state';
import { u64 } from '../util';
import { LendingInstruction } from './instruction';

interface Data {
    instruction: number;
    liquidityAmount: bigint;
    config: ReserveConfig;
}

const DataLayout = struct<Data>([u8('instruction'), u64('liquidityAmount'), ReserveConfigLayout]);

export const initReserveInstruction = (
    liquidityAmount: number | bigint,
    config: ReserveConfig,
    sourceLiquidity: PublicKey,
    destinationCollateral: PublicKey,
    reserve: PublicKey,
    liquidityMint: PublicKey,
    liquiditySupply: PublicKey,
    liquidityFeeReceiver: PublicKey,
    pythProduct: PublicKey,
    pythPrice: PublicKey,
    collateralMint: PublicKey,
    collateralSupply: PublicKey,
    lendingMarket: PublicKey,
    lendingMarketAuthority: PublicKey,
    lendingMarketOwner: PublicKey,
    transferAuthority: PublicKey,
): TransactionInstruction => {
    const data = Buffer.alloc(DataLayout.span);
    DataLayout.encode(
        {
            instruction: LendingInstruction.InitReserve,
            liquidityAmount: BigInt(liquidityAmount),
            config,
        },
        data,
    );

    const keys = [
        ///   0. `[writable]` Source liquidity token account.
        ///   $authority can transfer $liquidity_amount.
        { pubkey: sourceLiquidity, isSigner: false, isWritable: true },
        ///   1. `[writable]` Destination collateral token account - uninitialized.
        { pubkey: destinationCollateral, isSigner: false, isWritable: true },
        ///   2. `[writable]` Reserve account - uninitialized.
        { pubkey: reserve, isSigner: false, isWritable: true },
        ///   3. `[]` Reserve liquidity SPL Token mint.
        { pubkey: liquidityMint, isSigner: false, isWritable: false },
        ///   4. `[writable]` Reserve liquidity supply SPL Token account - uninitialized.
        { pubkey: liquiditySupply, isSigner: false, isWritable: true },
        ///   5. `[writable]` Reserve liquidity fee receiver - uninitialized.
        { pubkey: liquidityFeeReceiver, isSigner: false, isWritable: true },
        ///   6. `[]` Pyth product account.
        { pubkey: pythProduct, isSigner: false, isWritable: false },
        ///   7. `[]` Pyth price account.
        ///   This will be used as the reserve liquidity oracle account.
        { pubkey: pythPrice, isSigner: false, isWritable: false },
        ///   8. `[writable]` Reserve collateral SPL Token mint - uninitialized.
        { pubkey: collateralMint, isSigner: false, isWritable: true },
        ///   9. `[writable]` Reserve collateral token supply - uninitialized.
        { pubkey: collateralSupply, isSigner: false, isWritable: true },
        ///   10 `[]` Lending market account.
        { pubkey: lendingMarket, isSigner: false, isWritable: true },
        ///   11 `[]` Derived lending market authority.
        { pubkey: lendingMarketAuthority, isSigner: false, isWritable: false },
        ///   12 `[signer]` todo bug here - this account was missing
        { pubkey: lendingMarketOwner, isSigner: true, isWritable: false },
        ///   13 `[signer]` User transfer authority ($authority).
        { pubkey: transferAuthority, isSigner: true, isWritable: false },
        ///   14 `[]` Clock sysvar.
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        ///   15 `[]` Rent sysvar.
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ///   16 `[]` Token program id.
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
        keys,
        programId: LENDING_PROGRAM_ID,
        data,
    });
};
