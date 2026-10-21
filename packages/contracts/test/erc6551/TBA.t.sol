// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {Counter} from "../../src/Counter.sol";
import {Registry} from "../../src/erc6551/Registry.sol";
import {TokenBoundAccount, IERC6551Account} from "../../src/erc6551/TokenBoundAccount.sol";

// Stand-in for tc-02 Critter (interface-compatible: ownerOf only)
contract MockNFT {
    mapping(uint256 => address) public ownerOf;

    function mint(address to, uint256 tokenId) external { ownerOf[tokenId] = to; }
}

// Accepts plain transfers via execute{value:}
contract EthReceiver {
    uint256 public totalReceived;

    receive() external payable { totalReceived += msg.value; }
}

// Reverting target to exercise ExecuteFailed
contract Reverter {
    function boom() external pure { revert("nope"); }
}

contract TBATest is Test {
    Registry public registry;
    TokenBoundAccount public implementation;
    MockNFT public nft;
    Counter public counter;
    address public owner;
    address public stranger;

    uint256 constant TOKEN_ID = 1;
    bytes32 constant SALT = bytes32(uint256(0x6551));
    uint256 constant CHAIN_ID = 32_337;

    function setUp() public {
        (owner, stranger) = (makeAddr("owner"), makeAddr("stranger"));
        nft = new MockNFT();
        nft.mint(owner, TOKEN_ID);
        implementation = new TokenBoundAccount();
        registry = new Registry();
        counter = new Counter();
    }

    function _accountAddr() public view returns (address) {
        return registry.account(address(implementation), SALT, CHAIN_ID, address(nft), TOKEN_ID);
    }

    function _createAccount() public returns (TokenBoundAccount tba) {
        tba = TokenBoundAccount(
            payable(registry.createAccount(address(implementation), SALT, CHAIN_ID, address(nft), TOKEN_ID))
        );
    }

    function test_CreateAccount_CodeWithDeterministicBinding() public {
        TokenBoundAccount tba = _createAccount();
        // idempotent re-create + prediction match
        assertEq(address(tba), address(_createAccount()));
        assertEq(address(tba), _accountAddr());
        assertTrue(address(tba).code.length > 0);
    }

    function test_TokenBinding_RegistryInitParams() public {
        (uint256 chainId, address tokenContract, uint256 tokenId) = _createAccount().token();
        assertEq(chainId, CHAIN_ID);
        assertEq(tokenContract, address(nft));
        assertEq(tokenId, TOKEN_ID);
    }

    function test_Execute_OwnerCanExecute() public {
        TokenBoundAccount tba = _createAccount();
        vm.prank(owner);
        tba.execute(address(counter), 0, abi.encodeWithSignature("setNumber(uint256)", 7));
        assertEq(counter.number(), 7);
    }

    // stranger's execute reverts; after transfer the ownership follows
    function test_Execute_StrangerRevertThenOwnership() public {
        TokenBoundAccount tba = _createAccount();
        vm.prank(stranger);
        vm.expectRevert(TokenBoundAccount.NotTokenOwner.selector);
        tba.execute(address(counter), 0, "");
        // token moves to stranger → now stranger owns the account
        nft.mint(stranger, TOKEN_ID);
        vm.prank(stranger);
        tba.execute(address(counter), 0, abi.encodeWithSignature("setNumber(uint256)", 9));
        assertEq(counter.number(), 9);
    }

    function test_Execute_SendsValue() public {
        TokenBoundAccount tba = _createAccount();
        vm.deal(address(this), 2 ether);
        (bool ok, ) = address(tba).call{value: 1 ether}("");
        assertTrue(ok);
        EthReceiver receiver = new EthReceiver();
        vm.prank(owner);
        tba.execute(address(receiver), 0.5 ether, "");
        assertEq(address(receiver).balance, 0.5 ether);
        assertEq(receiver.totalReceived(), 0.5 ether);
    }

    function test_Execute_RevertsOnFailedCall() public {
        TokenBoundAccount tba = _createAccount();
        Reverter reverter = new Reverter();
        // wrapped = returndata of revert("nope") = Error(string)
        bytes memory wrapped = abi.encodeWithSignature("Error(string)", "nope");
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TokenBoundAccount.ExecuteFailed.selector, wrapped));
        tba.execute(address(reverter), 0, abi.encodeWithSignature("boom()"));
    }

    function test_IsValidSigner_OwnerYesStrangerNo() public {
        TokenBoundAccount tba = _createAccount();
        vm.prank(owner);
        assertEq(tba.isValidSigner(owner, ""), IERC6551Account.isValidSigner.selector);
        vm.prank(stranger);
        assertEq(tba.isValidSigner(stranger, ""), bytes4(0xffffffff));
    }

    function test_State_IncrementsPerExecution() public {
        TokenBoundAccount tba = _createAccount();
        assertEq(tba.state(), 0);
        vm.prank(owner);
        tba.execute(address(counter), 0, abi.encodeWithSignature("increment()"));
        vm.prank(owner);
        tba.execute(address(counter), 0, abi.encodeWithSignature("increment()"));
        assertEq(tba.state(), 2);
        assertEq(counter.number(), 2);
    }

    function test_SupportsInterface() public {
        TokenBoundAccount tba = _createAccount();
        assertTrue(tba.supportsInterface(type(IERC6551Account).interfaceId));
        assertFalse(tba.supportsInterface(bytes4(0xdeadbeef)));
    }
}
