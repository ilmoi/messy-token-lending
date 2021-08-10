import { PublicKey } from '@solana/web3.js';
import BigNumber from 'bignumber.js';

//todo changed to my own program address
export const LENDING_PROGRAM_ID = new PublicKey('69XC5QntXPhd14psQms6zUofH9ZPZiHfKAhQa32u3t2A');

//todo changed to match this - https://explorer.solana.com/address/2ciUuGZiee5macAMeQ7bHGTJtwcYTgnt6jdmQnnKZrfu?cluster=devnet
/** @internal */
export const ORACLE_PROGRAM_ID = new PublicKey('gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s');

/** @internal */
export const WAD = new BigNumber('1e+18');
//todo added this
export const WAD_BigInt = BigInt(WAD.toString());