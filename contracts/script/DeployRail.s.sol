// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../src/Rail.sol";

interface VmDeploy {
    function envUint(string calldata name) external returns (uint256);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployRail {
    VmDeploy private constant vm = VmDeploy(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external returns (Rail rail) {
        uint256 relayerKey = vm.envUint("RELAYER_PRIVATE_KEY");
        vm.startBroadcast(relayerKey);
        rail = new Rail(BASE_SEPOLIA_USDC, vm.addr(relayerKey));
        vm.stopBroadcast();
    }
}
