// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../src/Rail.sol";

interface Vm {
    function prank(address sender) external;
    function expectRevert() external;
    function expectRevert(bytes4 selector) external;
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData, address emitter) external;
}

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract RailTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant RELAYER = address(0xBEEF);
    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B);

    MockUSDC private token;
    Rail private rail;

    function setUp() public {
        token = new MockUSDC();
        rail = new Rail(address(token), RELAYER);
        token.mint(ALICE, 20_000_000);
        vm.prank(ALICE);
        token.approve(address(rail), type(uint256).max);
    }

    function testDepositRevertsWhenAllowanceIsLessThanTenUSDC() public {
        vm.prank(ALICE);
        token.approve(address(rail), 9_999_999);
        vm.expectRevert();
        vm.prank(ALICE);
        rail.deposit();
    }

    function testDepositTransfersTenUSDCAndEmitsEvent() public {
        vm.expectEmit(false, false, false, true, address(rail));
        emit Rail.Deposited(ALICE);
        vm.prank(ALICE);
        rail.deposit();

        assert(token.balanceOf(address(rail)) == 10_000_000);
        assert(token.balanceOf(ALICE) == 10_000_000);
        assert(rail.depositorCount() == 1);
    }

    function testDepositorCountCountsUniqueDepositors() public {
        vm.prank(ALICE);
        rail.deposit();
        vm.prank(ALICE);
        rail.deposit();
        assert(rail.depositorCount() == 1);
    }

    function testReleaseRejectsNonRelayer() public {
        vm.expectRevert(Rail.OnlyRelayer.selector);
        vm.prank(ALICE);
        rail.release(BOB);
    }

    function testReleaseTransfersOneUSDCAndEmitsEvent() public {
        token.mint(address(rail), 1_000_000);
        vm.expectEmit(false, false, false, true, address(rail));
        emit Rail.Released(BOB);
        vm.prank(RELAYER);
        rail.release(BOB);

        assert(token.balanceOf(BOB) == 1_000_000);
        assert(token.balanceOf(address(rail)) == 0);
    }
}
