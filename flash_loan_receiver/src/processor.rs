use std::convert::TryInto;

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::invoke,
    program_error::ProgramError,
    pubkey::Pubkey,
};

pub fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    input: &[u8],
) -> ProgramResult {
    msg!("Flash Loan Receiver invoked");
    let account_info_iter = &mut accounts.iter();
    let destination_liq_info = next_account_info(account_info_iter)?;
    let source_liq_info = next_account_info(account_info_iter)?;
    let spl_token_program_info = next_account_info(account_info_iter)?;
    let user_transfer_authority_info = next_account_info(account_info_iter)?;

    let (tag, rest) = input
        .split_first()
        .ok_or(ProgramError::InvalidInstructionData)?;

    //make sure the 0th instruction is called
    if *tag != 0 {
        msg!("tag must be 0");
        return Err(ProgramError::InvalidInstructionData);
    }

    //unpack amount as u64
    let amount = unpack_amount(rest)?;

    //send the tokens back to where they came from
    invoke(
        &spl_token::instruction::transfer(
            spl_token_program_info.key,
            destination_liq_info.key,
            source_liq_info.key,
            user_transfer_authority_info.key,
            &[],
            amount,
        )?,
        &[
            source_liq_info.clone(),
            destination_liq_info.clone(),
            user_transfer_authority_info.clone(),
            spl_token_program_info.clone(),
        ],
    );
    Ok(())
}

fn unpack_amount(input: &[u8]) -> Result<u64, ProgramError> {
    let amount = input
        .get(..8)
        .and_then(|slice| slice.try_into().ok())
        .map(u64::from_le_bytes)
        .ok_or(ProgramError::InvalidInstructionData)
        .map_err(|e| {
            msg!("failed to unpack amount");
            e
        })?;
    Ok(amount)
}
