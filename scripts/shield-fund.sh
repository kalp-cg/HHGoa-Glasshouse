#!/usr/bin/env bash
# `pnpm shield:fund`: deposit 10 test USDC from the relayer wallet into the Rail on Base Sepolia (approve + deposit),
# so the Rail can fund one-time wallets. Testnet only. Needs Foundry's `cast`. Prints tx hashes only, never keys.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PATH:$HOME/.foundry/bin"
val() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//' | tr -d ' "'; }
RPC=$(val BASE_SEPOLIA_RPC_URL); RAIL=$(val RAIL_ADDRESS); KEY=$(val RELAYER_PRIVATE_KEY)
USDC=0x036CbD53842c5426634e7929541eC2318f3dCF7e
[ "$(cast chain-id --rpc-url "$RPC")" = "84532" ] || { echo "not Base Sepolia, refusing"; exit 1; }
ME=$(cast wallet address --private-key "$KEY")
BAL=$(cast call $USDC "balanceOf(address)(uint256)" "$ME" --rpc-url "$RPC" | awk '{print $1}')
echo "relayer $ME holds $((BAL / 1000000)) USDC"
[ "$BAL" -ge 10000000 ] || { echo "need at least 10 test USDC (faucet → Base Sepolia → USDC)"; exit 1; }
cast send $USDC "approve(address,uint256)" "$RAIL" 10000000 --private-key "$KEY" --rpc-url "$RPC" --json | python3 -c "import sys,json; r=json.load(sys.stdin); print('approve', r['transactionHash'], 'status', r['status'])"
cast send "$RAIL" "deposit()" --private-key "$KEY" --rpc-url "$RPC" --json | python3 -c "import sys,json; r=json.load(sys.stdin); print('deposit', r['transactionHash'], 'status', r['status'])"
echo "Rail now holds $(( $(cast call $USDC "balanceOf(address)(uint256)" "$RAIL" --rpc-url "$RPC" | awk '{print $1}') / 1000000 )) USDC; depositors: $(cast call "$RAIL" "depositorCount()(uint256)" --rpc-url "$RPC")"
