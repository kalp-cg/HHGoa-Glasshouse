// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract Rail {
    uint256 public constant DEPOSIT_AMOUNT = 10_000_000;
    uint256 public constant RELEASE_AMOUNT = 1_000_000;

    IERC20 public immutable usdc;
    address public immutable relayer;
    uint256 public depositorCount;
    mapping(address => bool) public hasDeposited;

    error OnlyRelayer();
    error TokenTransferFailed();

    event Deposited(address depositor);
    event Released(address to);

    constructor(address token, address relayerAddress) {
        usdc = IERC20(token);
        relayer = relayerAddress;
    }

    function deposit() external {
        if (!usdc.transferFrom(msg.sender, address(this), DEPOSIT_AMOUNT)) revert TokenTransferFailed();
        if (!hasDeposited[msg.sender]) {
            hasDeposited[msg.sender] = true;
            ++depositorCount;
        }
        emit Deposited(msg.sender);
    }

    function release(address to) external {
        if (msg.sender != relayer) revert OnlyRelayer();
        if (!usdc.transfer(to, RELEASE_AMOUNT)) revert TokenTransferFailed();
        emit Released(to);
    }
}
